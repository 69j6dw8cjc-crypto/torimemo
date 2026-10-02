const DB_NAME = 'torimemo-db';
const DB_VERSION = 1;
const DEFAULT_THEME = '#7c5cff';

const state = {
  db: null,
  spaces: [],
  groups: [],
  notes: [],
  attachments: [],
  currentSpaceId: null,
  currentGroupId: null,
  pendingFiles: [],
  activeObjectUrls: new Set(),
  modalAttachmentId: null,
  pendingSpaceIconId: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  app: $('app'),
  spacesList: $('spacesList'),
  groupsList: $('groupsList'),
  notesList: $('notesList'),
  addSpaceBtn: $('addSpaceBtn'),
  addGroupBtn: $('addGroupBtn'),
  currentSpaceIcon: $('currentSpaceIcon'),
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
  collapseSpacesBtn: $('collapseSpacesBtn'),
  collapseGroupsBtn: $('collapseGroupsBtn'),
  themeColorInput: $('themeColorInput'),
  resetThemeBtn: $('resetThemeBtn'),
  mediaModal: $('mediaModal'),
  mediaModalImg: $('mediaModalImg'),
  mediaModalVideo: $('mediaModalVideo'),
  closeMediaModalBtn: $('closeMediaModalBtn'),
  saveModalMediaBtn: $('saveModalMediaBtn'),
  appearanceMode: $('appearanceMode'),
  setPasswordBtn: $('setPasswordBtn'),
  lockNowBtn: $('lockNowBtn'),
  spaceIconImageInput: $('spaceIconImageInput'),
  lockScreen: $('lockScreen'),
  unlockForm: $('unlockForm'),
  unlockPasswordInput: $('unlockPasswordInput'),
  lockError: $('lockError'),
};

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => els.toast.classList.remove('show'), 1900);
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

function sanitizeText(text) {
  return String(text ?? '');
}

function escapeHtml(str) {
  return sanitizeText(str).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function linkifyText(text) {
  const raw = sanitizeText(text);
  const regex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  let html = '';
  let last = 0;

  for (const match of raw.matchAll(regex)) {
    const index = match.index ?? 0;
    html += escapeHtml(raw.slice(last, index)).replaceAll('\n', '<br>');

    let visible = match[0];
    let trailing = '';
    while (/[.,!?;:)\]}、。！？）］】]$/.test(visible)) {
      trailing = visible.slice(-1) + trailing;
      visible = visible.slice(0, -1);
    }

    const href = visible.toLowerCase().startsWith('www.') ? `https://${visible}` : visible;
    html += `<a class="note-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(visible)}</a>`;
    html += escapeHtml(trailing);
    last = index + match[0].length;
  }

  html += escapeHtml(raw.slice(last)).replaceAll('\n', '<br>');
  return html;
}

function applyAppearance(mode, persist = true) {
  const safe = mode === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.mode = safe;
  els.appearanceMode.value = safe;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', safe === 'light' ? '#ffffff' : '#1f232b');
  if (persist) localStorage.setItem('torimemo-appearance-mode', safe);
}

function spaceIconHtml(space, className = 'space-icon-img') {
  if (space?.iconImage && /^data:image\//.test(space.iconImage)) {
    return `<img class="${className}" src="${escapeAttr(space.iconImage)}" alt="" />`;
  }
  return escapeHtml(space?.icon || '🗂️');
}

function fileToSquareIcon(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hasPasswordLock() {
  return !!localStorage.getItem('torimemo-lock-hash');
}

function updateLockControls() {
  const enabled = hasPasswordLock();
  els.setPasswordBtn.textContent = enabled ? '変更' : '設定';
  els.lockNowBtn.classList.toggle('hidden', !enabled);
}

function showLockScreen() {
  if (!hasPasswordLock()) return;
  document.body.classList.add('is-locked');
  els.lockScreen.classList.remove('hidden');
  els.lockScreen.setAttribute('aria-hidden', 'false');
  els.lockError.textContent = '';
  els.unlockPasswordInput.value = '';
  setTimeout(() => els.unlockPasswordInput.focus(), 50);
}

function hideLockScreen() {
  document.body.classList.remove('is-locked');
  els.lockScreen.classList.add('hidden');
  els.lockScreen.setAttribute('aria-hidden', 'true');
  els.lockError.textContent = '';
  els.unlockPasswordInput.value = '';
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function lightenHex(hex, amount = 28) {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : DEFAULT_THEME.slice(1);
  const num = parseInt(clean, 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 255) + amount);
  const b = Math.min(255, (num & 255) + amount);
  return `#${[r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')}`;
}

function applyTheme(color, persist = true) {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_THEME;
  document.documentElement.style.setProperty('--accent', safe);
  document.documentElement.style.setProperty('--accent-2', lightenHex(safe));
  els.themeColorInput.value = safe;
  if (persist) localStorage.setItem('torimemo-theme-color', safe);
}

function applyPanelPreferences() {
  const spacesCollapsed = localStorage.getItem('torimemo-spaces-collapsed') === '1';
  const groupsCollapsed = localStorage.getItem('torimemo-groups-collapsed') === '1';
  els.app.classList.toggle('spaces-collapsed', spacesCollapsed);
  els.app.classList.toggle('groups-collapsed', groupsCollapsed);
}

function isNarrow() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function setDesktopPanel(panel, collapsed) {
  const className = panel === 'spaces' ? 'spaces-collapsed' : 'groups-collapsed';
  els.app.classList.toggle(className, collapsed);
  localStorage.setItem(`torimemo-${panel}-collapsed`, collapsed ? '1' : '0');
}

function togglePanel(panel) {
  const pane = document.querySelector(panel === 'spaces' ? '.spaces-pane' : '.groups-pane');
  const other = document.querySelector(panel === 'spaces' ? '.groups-pane' : '.spaces-pane');
  if (isNarrow()) {
    other?.classList.remove('open');
    pane?.classList.toggle('open');
    return;
  }
  const className = panel === 'spaces' ? 'spaces-collapsed' : 'groups-collapsed';
  setDesktopPanel(panel, !els.app.classList.contains(className));
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

function render() {
  renderSpaces();
  renderGroups();
  renderNotes();

  const hasSpace = !!state.currentSpaceId;
  els.saveNoteBtn.disabled = !hasSpace;
  els.noteInput.disabled = !hasSpace;
  els.attachmentInput.disabled = !hasSpace;
  els.noteInput.placeholder = hasSpace
    ? (state.currentGroupId ? 'メモを書く…' : 'メモを書く…（保存するとグループを自動作成）')
    : '先にスペースを作成してください';
}

function renderSpaces() {
  els.spacesList.innerHTML = '';

  for (const space of state.spaces) {
    const row = document.createElement('button');
    row.className = `list-item ${space.id === state.currentSpaceId ? 'active' : ''}`;
    row.innerHTML = `
      <span class="item-main">
        <span class="space-icon" data-action="icon-space" data-id="${space.id}" title="絵文字アイコン変更">${spaceIconHtml(space)}</span>
        <span class="item-name">${escapeHtml(space.name)}</span>
      </span>
      <span class="item-actions">
        <span class="mini-btn" data-action="image-space" data-id="${space.id}" title="画像アイコン">🖼</span>
        <span class="mini-btn" data-action="rename-space" data-id="${space.id}" title="名前変更">✎</span>
        <span class="mini-btn" data-action="delete-space" data-id="${space.id}" title="削除">×</span>
      </span>`;

    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      state.currentSpaceId = space.id;
      state.currentGroupId = state.groups.find(g => g.spaceId === space.id)?.id || null;
      closeMobilePanels();
      render();
    });
    els.spacesList.append(row);
  }

  const current = state.spaces.find(s => s.id === state.currentSpaceId);
  els.currentSpaceName.textContent = current?.name || '未選択';
  els.currentSpaceIcon.innerHTML = current ? spaceIconHtml(current, 'space-icon-img') : '🗂️';
}

function renderGroups() {
  els.groupsList.innerHTML = '';
  const groups = state.groups.filter(g => g.spaceId === state.currentSpaceId);

  for (const group of groups) {
    const row = document.createElement('button');
    row.className = `list-item ${group.id === state.currentGroupId ? 'active' : ''}`;
    row.innerHTML = `
      <span class="item-main"><span>#</span><span class="item-name">${escapeHtml(group.name)}</span></span>
      <span class="item-actions">
        <span class="mini-btn" data-action="rename-group" data-id="${group.id}" title="名前変更">✎</span>
        <span class="mini-btn" data-action="delete-group" data-id="${group.id}" title="削除">×</span>
      </span>`;

    row.addEventListener('click', (e) => {
      if (e.target.dataset.action) return;
      state.currentGroupId = group.id;
      document.querySelector('.groups-pane')?.classList.remove('open');
      render();
    });
    els.groupsList.append(row);
  }

  const current = state.groups.find(g => g.id === state.currentGroupId);
  els.currentGroupName.textContent = current?.name || (state.currentSpaceId ? '新しいメモ' : 'グループを選択');
}

function clearRenderedObjectUrls() {
  for (const url of state.activeObjectUrls) URL.revokeObjectURL(url);
  state.activeObjectUrls.clear();
}

function makeObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  state.activeObjectUrls.add(url);
  return url;
}

function bindVideoDoubleTap(video, attachment, url) {
  video.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openMediaModal(attachment, url, 'video');
  });

  let lastTap = 0;
  video.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap < 360) {
      e.preventDefault();
      openMediaModal(attachment, url, 'video');
      lastTap = 0;
    } else {
      lastTap = now;
    }
  }, { passive: false });
}

async function renderNotes() {
  clearRenderedObjectUrls();

  const q = els.searchInput.value.trim().toLowerCase();
  let notes = state.notes.filter(n => n.groupId === state.currentGroupId);
  if (q) notes = notes.filter(n => (n.text || '').toLowerCase().includes(q));

  els.notesList.innerHTML = '';

  if (!state.currentSpaceId) {
    els.emptyState.classList.remove('hidden');
    els.emptyState.querySelector('h2').textContent = 'スペースを作成してください';
    els.emptyState.querySelector('p').textContent = '左側の「＋」から最初のスペースを作成してください。';
    return;
  }

  if (!state.currentGroupId) {
    els.emptyState.classList.remove('hidden');
    els.emptyState.querySelector('h2').textContent = 'メモグループがありません';
    els.emptyState.querySelector('p').textContent = 'そのまま下にメモを書くと、最初の文章を名前にしたメモグループを自動で作成します。';
    return;
  }

  if (!notes.length) {
    els.emptyState.classList.remove('hidden');
    els.emptyState.querySelector('h2').textContent = q ? '一致するメモがありません' : 'まだメモがありません';
    els.emptyState.querySelector('p').textContent = q ? '別の言葉で検索してみてください。' : '下の入力欄から最初のメモを書いてみましょう。';
    return;
  }

  els.emptyState.classList.add('hidden');

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
      <div class="note-text">${linkifyText(note.text || '')}</div>
      <div class="attachments" data-attachments-for="${note.id}"></div>
    `;
    els.notesList.append(card);

    const box = card.querySelector(`[data-attachments-for="${note.id}"]`);
    const atts = state.attachments.filter(a => a.noteId === note.id);

    for (const att of atts) {
      const type = att.type || att.blob?.type || 'application/octet-stream';
      const name = att.name || '添付ファイル';
      const url = makeObjectUrl(att.blob);

      if (type.startsWith('image/')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'attachment-card';
        wrapper.innerHTML = `
          <img alt="${escapeHtml(name)}" title="タップで拡大" />
          <div class="attachment-footer">
            <span class="attachment-name">${escapeHtml(name)}</span>
            <button class="attachment-save" type="button">保存</button>
          </div>`;
        const img = wrapper.querySelector('img');
        img.src = url;
        img.addEventListener('click', () => openMediaModal(att, url, 'image'));
        wrapper.querySelector('.attachment-save').addEventListener('click', () => saveAttachment(att));
        box.append(wrapper);
        continue;
      }

      if (type.startsWith('video/')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'attachment-card';
        wrapper.innerHTML = `
          <video controls playsinline></video>
          <span class="video-hint">ダブルタップで拡大</span>
          <div class="attachment-footer">
            <span class="attachment-name">${escapeHtml(name)}</span>
            <button class="attachment-save" type="button">保存</button>
          </div>`;
        const video = wrapper.querySelector('video');
        video.src = url;
        bindVideoDoubleTap(video, att, url);
        wrapper.querySelector('.attachment-save').addEventListener('click', () => saveAttachment(att));
        box.append(wrapper);
        continue;
      }

      const fileCard = document.createElement('div');
      fileCard.className = 'attachment-card file-attachment';
      fileCard.innerHTML = `
        <div class="file-icon">📄</div>
        <div class="file-info">
          <div class="file-title">${escapeHtml(name)}</div>
          <div class="file-meta">${escapeHtml(type)} · ${formatBytes(att.blob?.size || 0)}</div>
        </div>
        <button class="attachment-save" type="button">保存</button>`;
      fileCard.querySelector('.attachment-save').addEventListener('click', () => saveAttachment(att));
      box.append(fileCard);
    }
  }
}

function deriveAutoGroupName(text, files = []) {
  const firstLine = (text || '').split(/\r?\n/).map(s => s.trim()).find(Boolean);
  let base = firstLine || files[0]?.name?.replace(/\.[^.]+$/, '') || '新しいメモ';
  base = base.replace(/\s+/g, ' ').trim();
  return base.length > 28 ? `${base.slice(0, 28)}…` : base;
}

els.addSpaceBtn.addEventListener('click', async () => {
  const name = prompt('スペース名を入力してください');
  if (!name?.trim()) return;
  const iconInput = prompt('スペースのアイコンを絵文字で入力してください（空欄なら 🗂️）', '🗂️');
  const space = {
    id: uuid(),
    name: name.trim(),
    icon: iconInput?.trim() || '🗂️',
    createdAt: Date.now()
  };
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


els.spaceIconImageInput.addEventListener('change', async () => {
  const file = els.spaceIconImageInput.files?.[0];
  const id = state.pendingSpaceIconId;
  state.pendingSpaceIconId = null;
  if (!file || !id) return;

  try {
    const item = state.spaces.find(s => s.id === id);
    if (!item) return;
    const iconImage = await fileToSquareIcon(file);
    await put('spaces', { ...item, iconImage });
    await loadState();
    toast('スペースの画像アイコンを変更しました');
  } catch (err) {
    console.error(err);
    alert('画像アイコンの設定に失敗しました。');
  } finally {
    els.spaceIconImageInput.value = '';
  }
});

els.attachmentInput.addEventListener('change', () => {
  state.pendingFiles = [...els.attachmentInput.files];
  const totalMb = state.pendingFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024;
  els.attachmentStatus.textContent = state.pendingFiles.length
    ? `${state.pendingFiles.length}件 / 約${totalMb.toFixed(1)}MB`
    : '';
});

els.saveNoteBtn.addEventListener('click', async () => {
  if (!state.currentSpaceId) return toast('先にスペースを作成してください');

  const text = els.noteInput.value.trim();
  if (!text && state.pendingFiles.length === 0) return toast('文章かファイルを追加してください');

  els.saveNoteBtn.disabled = true;

  try {
    if (!state.currentGroupId) {
      const group = {
        id: uuid(),
        spaceId: state.currentSpaceId,
        name: deriveAutoGroupName(text, state.pendingFiles),
        createdAt: Date.now()
      };
      await put('groups', group);
      state.currentGroupId = group.id;
    }

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
    alert('保存に失敗しました。大きなファイルの場合は、端末やブラウザの空き容量を確認してください。');
  } finally {
    els.saveNoteBtn.disabled = !state.currentSpaceId;
  }
});

els.searchInput.addEventListener('input', renderNotes);

document.addEventListener('click', async (e) => {
  const action = e.target.dataset?.action;
  const id = e.target.dataset?.id;
  if (!action || !id) return;

  if (action === 'icon-space') {
    e.stopPropagation();
    const item = state.spaces.find(s => s.id === id);
    if (!item) return;
    const icon = prompt('スペースのアイコンを絵文字で入力してください', item.icon || '🗂️');
    if (icon === null) return;
    await put('spaces', { ...item, icon: icon.trim() || '🗂️', iconImage: null });
    await loadState();
    return;
  }

  if (action === 'image-space') {
    e.stopPropagation();
    state.pendingSpaceIconId = id;
    els.spaceIconImageInput.value = '';
    els.spaceIconImageInput.click();
    return;
  }

  if (action === 'rename-space') {
    e.stopPropagation();
    const item = state.spaces.find(s => s.id === id);
    const name = prompt('新しいスペース名', item?.name || '');
    if (!name?.trim()) return;
    await put('spaces', { ...item, name: name.trim() });
    await loadState();
    return;
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
    if (state.currentSpaceId === id) {
      state.currentSpaceId = null;
      state.currentGroupId = null;
    }
    await loadState();
    return;
  }

  if (action === 'rename-group') {
    e.stopPropagation();
    const item = state.groups.find(g => g.id === id);
    const name = prompt('新しいグループ名', item?.name || '');
    if (!name?.trim()) return;
    await put('groups', { ...item, name: name.trim() });
    await loadState();
    return;
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
    return;
  }

  if (action === 'edit-note') {
    const note = state.notes.find(n => n.id === id);
    const text = prompt('メモを編集', note?.text || '');
    if (text === null) return;
    await put('notes', { ...note, text, updatedAt: Date.now() });
    await loadState();
    toast('メモを更新しました');
    return;
  }

  if (action === 'delete-note') {
    if (!confirm('このメモを削除しますか？')) return;
    for (const att of state.attachments.filter(a => a.noteId === id)) await remove('attachments', att.id);
    await remove('notes', id);
    await loadState();
    toast('メモを削除しました');
  }
});

function openMediaModal(attachment, url, kind) {
  state.modalAttachmentId = attachment.id;
  els.mediaModal.classList.remove('hidden');
  els.mediaModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  if (kind === 'image') {
    els.mediaModalVideo.pause();
    els.mediaModalVideo.removeAttribute('src');
    els.mediaModalVideo.classList.add('hidden');
    els.mediaModalImg.src = url;
    els.mediaModalImg.alt = attachment.name || '拡大画像';
    els.mediaModalImg.classList.remove('hidden');
  } else {
    els.mediaModalImg.removeAttribute('src');
    els.mediaModalImg.classList.add('hidden');
    els.mediaModalVideo.src = url;
    els.mediaModalVideo.classList.remove('hidden');
    els.mediaModalVideo.play().catch(() => {});
  }
}

function closeMediaModal() {
  els.mediaModalVideo.pause();
  els.mediaModalVideo.removeAttribute('src');
  els.mediaModalImg.removeAttribute('src');
  els.mediaModalImg.classList.add('hidden');
  els.mediaModalVideo.classList.add('hidden');
  els.mediaModal.classList.add('hidden');
  els.mediaModal.setAttribute('aria-hidden', 'true');
  state.modalAttachmentId = null;
  document.body.style.overflow = '';
}

els.closeMediaModalBtn.addEventListener('click', closeMediaModal);
els.mediaModal.addEventListener('click', (e) => {
  if (e.target === els.mediaModal || e.target.classList.contains('media-modal-backdrop')) closeMediaModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.mediaModal.classList.contains('hidden')) closeMediaModal();
});
els.saveModalMediaBtn.addEventListener('click', () => {
  const att = state.attachments.find(a => a.id === state.modalAttachmentId);
  if (att) saveAttachment(att);
});

async function saveAttachment(att) {
  try {
    const file = new File([att.blob], att.name || 'torimemo-file', {
      type: att.type || att.blob?.type || 'application/octet-stream'
    });

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: att.name || 'トリメモ' });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('Share fallback:', err);
  }

  const url = URL.createObjectURL(att.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.name || 'torimemo-file';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('ファイルを保存しました');
}

els.appearanceMode.addEventListener('change', (e) => {
  applyAppearance(e.target.value);
});

els.setPasswordBtn.addEventListener('click', async () => {
  const currentHash = localStorage.getItem('torimemo-lock-hash');

  if (currentHash) {
    const current = prompt('現在のパスワードを入力してください');
    if (current === null) return;
    if (await hashPassword(current) !== currentHash) {
      alert('現在のパスワードが違います。');
      return;
    }

    const next = prompt('新しいパスワードを入力してください。\nロックを解除する場合は空欄のままOKを押してください。');
    if (next === null) return;

    if (!next) {
      if (confirm('パスワードロックを解除しますか？')) {
        localStorage.removeItem('torimemo-lock-hash');
        updateLockControls();
        toast('パスワードロックを解除しました');
      }
      return;
    }

    if (next.length < 4) {
      alert('パスワードは4文字以上にしてください。');
      return;
    }

    const confirmNext = prompt('確認のため、もう一度新しいパスワードを入力してください');
    if (confirmNext !== next) {
      alert('パスワードが一致しません。');
      return;
    }

    localStorage.setItem('torimemo-lock-hash', await hashPassword(next));
    updateLockControls();
    toast('パスワードを変更しました');
    return;
  }

  const password = prompt('トリメモを開くためのパスワードを設定してください（4文字以上）');
  if (password === null) return;
  if (password.length < 4) {
    alert('パスワードは4文字以上にしてください。');
    return;
  }

  const confirmPassword = prompt('確認のため、もう一度パスワードを入力してください');
  if (confirmPassword !== password) {
    alert('パスワードが一致しません。');
    return;
  }

  localStorage.setItem('torimemo-lock-hash', await hashPassword(password));
  updateLockControls();
  toast('パスワードロックを設定しました');
});

els.lockNowBtn.addEventListener('click', showLockScreen);

els.unlockForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = els.unlockPasswordInput.value;
  const saved = localStorage.getItem('torimemo-lock-hash');
  if (!saved) {
    hideLockScreen();
    return;
  }

  const inputHash = await hashPassword(input);
  if (inputHash === saved) {
    hideLockScreen();
  } else {
    els.lockError.textContent = 'パスワードが違います。';
    els.unlockPasswordInput.select();
  }
});

els.themeColorInput.addEventListener('input', (e) => applyTheme(e.target.value));
els.resetThemeBtn.addEventListener('click', () => {
  applyTheme(DEFAULT_THEME);
  toast('テーマカラーを初期色に戻しました');
});

els.toggleSpacesBtn.addEventListener('click', () => togglePanel('spaces'));
els.toggleGroupsBtn.addEventListener('click', () => togglePanel('groups'));
els.collapseSpacesBtn.addEventListener('click', () => setDesktopPanel('spaces', true));
els.collapseGroupsBtn.addEventListener('click', () => setDesktopPanel('groups', true));

function closeMobilePanels() {
  document.querySelector('.spaces-pane')?.classList.remove('open');
  document.querySelector('.groups-pane')?.classList.remove('open');
}

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
    version: 1.3,
    exportedAt: new Date().toISOString(),
    spaces: state.spaces,
    groups: state.groups,
    notes: state.notes,
    attachments,
    settings: {
      themeColor: localStorage.getItem('torimemo-theme-color') || DEFAULT_THEME,
      appearanceMode: localStorage.getItem('torimemo-appearance-mode') || 'dark',
      spacesCollapsed: localStorage.getItem('torimemo-spaces-collapsed') === '1',
      groupsCollapsed: localStorage.getItem('torimemo-groups-collapsed') === '1',
    }
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
        id: item.id,
        noteId: item.noteId,
        name: item.name,
        type: item.type,
        createdAt: item.createdAt,
        blob: base64ToBlob(item.data),
      });
    }

    if (backup.settings?.themeColor) {
      localStorage.setItem('torimemo-theme-color', backup.settings.themeColor);
    }
    if (backup.settings?.appearanceMode) {
      localStorage.setItem('torimemo-appearance-mode', backup.settings.appearanceMode === 'light' ? 'light' : 'dark');
    }
    if (typeof backup.settings?.spacesCollapsed === 'boolean') {
      localStorage.setItem('torimemo-spaces-collapsed', backup.settings.spacesCollapsed ? '1' : '0');
    }
    if (typeof backup.settings?.groupsCollapsed === 'boolean') {
      localStorage.setItem('torimemo-groups-collapsed', backup.settings.groupsCollapsed ? '1' : '0');
    }

    state.currentSpaceId = null;
    state.currentGroupId = null;
    applyTheme(localStorage.getItem('torimemo-theme-color') || DEFAULT_THEME, false);
    applyAppearance(localStorage.getItem('torimemo-appearance-mode') || 'dark', false);
    applyPanelPreferences();
    await loadState();
    toast('バックアップを読み込みました');
  } catch (err) {
    console.error(err);
    alert('バックアップファイルを読み込めませんでした。');
  } finally {
    els.importInput.value = '';
  }
});

async function ensureDemoData() {
  const spaces = await getAll('spaces');
  if (spaces.length) return;
  const space = { id: uuid(), name: 'はじめてのスペース', icon: '🗂️', createdAt: Date.now() };
  const group = { id: uuid(), spaceId: space.id, name: 'メモ', createdAt: Date.now() };
  await put('spaces', space);
  await put('groups', group);
}

async function main() {
  applyTheme(localStorage.getItem('torimemo-theme-color') || DEFAULT_THEME, false);
  applyAppearance(localStorage.getItem('torimemo-appearance-mode') || 'dark', false);
  applyPanelPreferences();
  updateLockControls();
  if (hasPasswordLock()) showLockScreen();

  state.db = await openDb();
  await ensureDemoData();
  await loadState();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js?v=1.3').catch(console.warn);
  }
}

main().catch(err => {
  console.error(err);
  alert('トリメモの起動に失敗しました。ページを再読み込みしてください。');
});
