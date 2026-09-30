const DB_NAME = 'torimemo-db';
const DB_VERSION = 1;

const state = {
  db: null,
  spaces: [],
  groups: [],
  notes: [],
  attachments: [],
  currentSpaceId: null,
  currentGroupId: null,
  pendingFiles: [],
};

const $ = (id) => document.getElementById(id);

const els = {
  spacesList: $('spacesList'),
  groupsList: $('groupsList'),
  notesList: $('notesList'),
  addSpaceBtn: $('addSpaceBtn'),
  addGroupBtn: $('addGroupBtn'),
  currentSpaceName: $('currentSpaceName'),
  currentGroupName: $('currentGroupName'),
  noteInput: $('noteInput'),
  saveNoteBtn: $('saveNoteBtn'),
  attachmentInput: $('attachmentInput'),
  attachmentStatus: $('attachmentStatus'),
  searchInput: $('searchInput'),
  emptyState: $('emptyState'),
  toast: $('toast'),
  exportBtn: $('exportBtn'),
  importInput: $('importInput'),
  toggleSpacesBtn: $('toggleSpacesBtn'),
  toggleGroupsBtn: $('toggleGroupsBtn'),
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('spaces')) db.createObjectStore('spaces', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('groups')) db.createObjectStore('groups', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll(store) {
  const tx = state.db.transaction(store, 'readonly');
  return reqToPromise(tx.objectStore(store).getAll());
}

async function put(store, value) {
  const tx = state.db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}

async function remove(store, key) {
  const tx = state.db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

async function clearStore(store) {
  const tx = state.db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await txDone(tx);
}

async function loadState() {
  [state.spaces, state.groups, state.notes, state.attachments] = await Promise.all([
    getAll('spaces'),
    getAll('groups'),
    getAll('notes'),
    getAll('attachments'),
  ]);

  state.spaces.sort((a,b) => a.createdAt - b.createdAt);
  state.groups.sort((a,b) => a.createdAt - b.createdAt);
  state.notes.sort((a,b) => b.createdAt - a.createdAt);

  if (!state.currentSpaceId || !state.spaces.some(s => s.id === state.currentSpaceId)) {
    state.currentSpaceId = state.spaces[0]?.id || null;
  }
  if (!state.currentGroupId || !state.groups.some(g => g.id === state.currentGroupId && g.spaceId === state.currentSpaceId)) {
    state.currentGroupId = state.groups.find(g => g.spaceId === state.currentSpaceId)?.id || null;
  }
  render();
}

function sanitizeText(text) {
  return String(text ?? '');
}

function render() {
  renderSpaces();
  renderGroups();
  renderNotes();
  els.saveNoteBtn.disabled = !state.currentGroupId;
  els.noteInput.disabled = !state.currentGroupId;
  els.attachmentInput.disabled = !state.currentGroupId;
}

function renderSpaces() {
  els.spacesList.innerHTML = '';
  for (const space of state.spaces) {
    const row = document.createElement('button');
    row.className = `list-item ${space.id === state.currentSpaceId ? 'active' : ''}`;
    row.innerHTML = `
      <span class="item-main">▣ ${escapeHtml(space.name)}</span>
      <span class="item-actions">
        <span class="mini-btn" data-action="rename-space" data-id="${space.id}">✎</span>
        <span class="mini-btn" data-action="delete-space" data-id="${space.id}">×</span>
      </span>`;
    row.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) return;
      state.currentSpaceId = space.id;
      state.currentGroupId = state.groups.find(g => g.spaceId === space.id)?.id || null;
      closeMobilePanels();
      render();
    });
    els.spacesList.append(row);
  }
  const current = state.spaces.find(s => s.id === state.currentSpaceId);
  els.currentSpaceName.textContent = current?.name || '未選択';
}

function renderGroups() {
  els.groupsList.innerHTML = '';
  const groups = state.groups.filter(g => g.spaceId === state.currentSpaceId);
  for (const group of groups) {
    const row = document.createElement('button');
    row.className = `list-item ${group.id === state.currentGroupId ? 'active' : ''}`;
    row.innerHTML = `
      <span class="item-main"># ${escapeHtml(group.name)}</span>
      <span class="item-actions">
        <span class="mini-btn" data-action="rename-group" data-id="${group.id}">✎</span>
        <span class="mini-btn" data-action="delete-group" data-id="${group.id}">×</span>
      </span>`;
    row.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) return;
      state.currentGroupId = group.id;
      document.querySelector('.groups-pane')?.classList.remove('open');
      render();
    });
    els.groupsList.append(row);
  }
  const current = state.groups.find(g => g.id === state.currentGroupId);
  els.currentGroupName.textContent = current?.name || 'グループを選択';
}

async function renderNotes() {
  const q = els.searchInput.value.trim().toLowerCase();
  let notes = state.notes.filter(n => n.groupId === state.currentGroupId);
  if (q) notes = notes.filter(n => n.text.toLowerCase().includes(q));

  els.notesList.innerHTML = '';
  els.emptyState.classList.toggle('hidden', !!state.currentGroupId && notes.length > 0);

  if (!state.currentGroupId) {
    els.emptyState.querySelector('h2').textContent = 'スペースとグループを作成してください';
    els.emptyState.querySelector('p').textContent = '左側の「＋」から、まずスペースを作成してください。';
    return;
  }

  if (!notes.length) {
    els.emptyState.querySelector('h2').textContent = q ? '一致するメモがありません' : 'まだメモがありません';
    els.emptyState.querySelector('p').textContent = q ? '別の言葉で検索してみてください。' : '下の入力欄から最初のメモを書いてみましょう。';
    return;
  }

  for (const note of notes) {
    const card = document.createElement('article');
    card.className = 'note-card';
    const date = new Date(note.createdAt);
    card.innerHTML = `
      <div class="note-head">
        <span>${date.toLocaleString('ja-JP')}</span>
        <span class="note-actions">
          <button data-action="edit-note" data-id="${note.id}">編集</button>
          <button data-action="delete-note" data-id="${note.id}">削除</button>
        </span>
      </div>
      <div class="note-text">${escapeHtml(note.text).replaceAll('\n','<br>')}</div>
      <div class="attachments" data-attachments-for="${note.id}"></div>
    `;
    els.notesList.append(card);

    const box = card.querySelector(`[data-attachments-for="${note.id}"]`);
    const atts = state.attachments.filter(a => a.noteId === note.id);
    for (const att of atts) {
      const url = URL.createObjectURL(att.blob);
      const node = document.createElement(att.type.startsWith('video/') ? 'video' : 'img');
      node.src = url;
      node.alt = att.name || '添付ファイル';
      if (node.tagName === 'VIDEO') node.controls = true;
      node.onload = node.onloadeddata = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
      box.append(node);
    }
  }
}

function escapeHtml(str) {
  return sanitizeText(str).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

els.addSpaceBtn.addEventListener('click', async () => {
  const name = prompt('スペース名を入力してください');
  if (!name?.trim()) return;
  const space = { id: uuid(), name: name.trim(), createdAt: Date.now() };
  await put('spaces', space);
  state.currentSpaceId = space.id;
  state.currentGroupId = null;
  await loadState();
  toast('スペースを作成しました');
});

els.addGroupBtn.addEventListener('click', async () => {
  if (!state.currentSpaceId) return toast('先にスペースを作成してください');
  const name = prompt('メモグループ名を入力してください');
  if (!name?.trim()) return;
  const group = { id: uuid(), spaceId: state.currentSpaceId, name: name.trim(), createdAt: Date.now() };
  await put('groups', group);
  state.currentGroupId = group.id;
  await loadState();
  toast('グループを作成しました');
});

els.attachmentInput.addEventListener('change', () => {
  state.pendingFiles = [...els.attachmentInput.files];
  const totalMb = state.pendingFiles.reduce((s,f) => s + f.size, 0) / 1024 / 1024;
  els.attachmentStatus.textContent = state.pendingFiles.length
    ? `${state.pendingFiles.length}件 / 約${totalMb.toFixed(1)}MB`
    : '';
});

els.saveNoteBtn.addEventListener('click', async () => {
  if (!state.currentGroupId) return;
  const text = els.noteInput.value.trim();
  if (!text && state.pendingFiles.length === 0) return toast('文章か画像・動画を追加してください');

  els.saveNoteBtn.disabled = true;
  try {
    const note = {
      id: uuid(),
      groupId: state.currentGroupId,
      text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await put('notes', note);

    for (const file of state.pendingFiles) {
      await put('attachments', {
        id: uuid(),
        noteId: note.id,
        name: file.name,
        type: file.type || 'application/octet-stream',
        blob: file,
        createdAt: Date.now(),
      });
    }

    els.noteInput.value = '';
    els.attachmentInput.value = '';
    state.pendingFiles = [];
    els.attachmentStatus.textContent = '';
    await loadState();
    toast('メモを保存しました');
  } catch (err) {
    console.error(err);
    alert('保存に失敗しました。動画などのファイルが大きすぎる場合、端末の空き容量やブラウザの保存容量を確認してください。');
  } finally {
    els.saveNoteBtn.disabled = !state.currentGroupId;
  }
});

els.searchInput.addEventListener('input', renderNotes);

document.addEventListener('click', async (e) => {
  const action = e.target.dataset?.action;
  const id = e.target.dataset?.id;
  if (!action || !id) return;

  if (action === 'rename-space') {
    e.stopPropagation();
    const item = state.spaces.find(s => s.id === id);
    const name = prompt('新しいスペース名', item?.name || '');
    if (!name?.trim()) return;
    await put('spaces', { ...item, name: name.trim() });
    await loadState();
  }

  if (action === 'delete-space') {
    e.stopPropagation();
    const item = state.spaces.find(s => s.id === id);
    if (!confirm(`「${item?.name}」を削除しますか？ 中のグループ・メモも削除されます。`)) return;
    const groupIds = state.groups.filter(g => g.spaceId === id).map(g => g.id);
    const noteIds = state.notes.filter(n => groupIds.includes(n.groupId)).map(n => n.id);
    for (const att of state.attachments.filter(a => noteIds.includes(a.noteId))) await remove('attachments', att.id);
    for (const noteId of noteIds) await remove('notes', noteId);
    for (const groupId of groupIds) await remove('groups', groupId);
    await remove('spaces', id);
    if (state.currentSpaceId === id) { state.currentSpaceId = null; state.currentGroupId = null; }
    await loadState();
  }

  if (action === 'rename-group') {
    e.stopPropagation();
    const item = state.groups.find(g => g.id === id);
    const name = prompt('新しいグループ名', item?.name || '');
    if (!name?.trim()) return;
    await put('groups', { ...item, name: name.trim() });
    await loadState();
  }

  if (action === 'delete-group') {
    e.stopPropagation();
    const item = state.groups.find(g => g.id === id);
    if (!confirm(`「${item?.name}」を削除しますか？ 中のメモも削除されます。`)) return;
    const noteIds = state.notes.filter(n => n.groupId === id).map(n => n.id);
    for (const att of state.attachments.filter(a => noteIds.includes(a.noteId))) await remove('attachments', att.id);
    for (const noteId of noteIds) await remove('notes', noteId);
    await remove('groups', id);
    if (state.currentGroupId === id) state.currentGroupId = null;
    await loadState();
  }

  if (action === 'edit-note') {
    const note = state.notes.find(n => n.id === id);
    const text = prompt('メモを編集', note?.text || '');
    if (text === null) return;
    await put('notes', { ...note, text, updatedAt: Date.now() });
    await loadState();
    toast('メモを更新しました');
  }

  if (action === 'delete-note') {
    if (!confirm('このメモを削除しますか？')) return;
    for (const att of state.attachments.filter(a => a.noteId === id)) await remove('attachments', att.id);
    await remove('notes', id);
    await loadState();
    toast('メモを削除しました');
  }
});

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
  const bytes = atob(body);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

els.exportBtn.addEventListener('click', async () => {
  const attachments = [];
  for (const a of state.attachments) {
    attachments.push({
      id: a.id,
      noteId: a.noteId,
      name: a.name,
      type: a.type,
      createdAt: a.createdAt,
      data: await blobToBase64(a.blob),
    });
  }
  const backup = {
    app: 'torimemo',
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: state.spaces,
    groups: state.groups,
    notes: state.notes,
    attachments,
  };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `torimemo-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  toast('バックアップを書き出しました');
});

els.importInput.addEventListener('change', async () => {
  const file = els.importInput.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'torimemo') throw new Error('invalid backup');
    if (!confirm('現在のデータを消して、このバックアップに置き換えますか？')) return;

    for (const store of ['attachments','notes','groups','spaces']) await clearStore(store);

    for (const item of backup.spaces || []) await put('spaces', item);
    for (const item of backup.groups || []) await put('groups', item);
    for (const item of backup.notes || []) await put('notes', item);
    for (const item of backup.attachments || []) {
      await put('attachments', {
        id: item.id, noteId: item.noteId, name: item.name, type: item.type,
        createdAt: item.createdAt, blob: base64ToBlob(item.data),
      });
    }
    state.currentSpaceId = null;
    state.currentGroupId = null;
    await loadState();
    toast('バックアップを読み込みました');
  } catch (err) {
    console.error(err);
    alert('バックアップファイルを読み込めませんでした。');
  } finally {
    els.importInput.value = '';
  }
});

els.toggleSpacesBtn.addEventListener('click', () => {
  document.querySelector('.spaces-pane')?.classList.toggle('open');
  document.querySelector('.groups-pane')?.classList.remove('open');
});
els.toggleGroupsBtn.addEventListener('click', () => {
  document.querySelector('.groups-pane')?.classList.toggle('open');
  document.querySelector('.spaces-pane')?.classList.remove('open');
});
function closeMobilePanels() {
  document.querySelector('.spaces-pane')?.classList.remove('open');
  document.querySelector('.groups-pane')?.classList.remove('open');
}

async function ensureDemoData() {
  const spaces = await getAll('spaces');
  if (spaces.length) return;
  const space = { id: uuid(), name: 'はじめてのスペース', createdAt: Date.now() };
  const group = { id: uuid(), spaceId: space.id, name: 'メモ', createdAt: Date.now() };
  await put('spaces', space);
  await put('groups', group);
}

async function main() {
  state.db = await openDb();
  await ensureDemoData();
  await loadState();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  }
}
main().catch(err => {
  console.error(err);
  alert('トリメモの起動に失敗しました。ページを再読み込みしてください。');
});
