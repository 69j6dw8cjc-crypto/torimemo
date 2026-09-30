# トリメモ v1

Discordのサーバーやチャンネルのような階層で、個人用メモを整理できるオフライン中心のWebアプリです。

## v1でできること

- スペース作成
- スペース内のメモグループ作成
- グループ内に複数メモを保存
- メモの編集・削除
- 画像・動画の添付
- メモ検索
- JSONバックアップの書き出し / 読み込み
- IndexedDBによる端末内保存
- PWA / Service Workerによるオフライン利用

## GitHubへのアップロード

このフォルダ内のファイルを、GitHubリポジトリ `torimemo` の一番上（ルート）へすべてアップロードしてください。

必要ファイル:

- `index.html`
- `style.css`
- `app.js`
- `service-worker.js`
- `manifest.webmanifest`
- `icon.svg`
- `.nojekyll`
- `README.md`

## GitHub Pagesで公開する

1. GitHubで `torimemo` を開く
2. `Settings`
3. `Pages`
4. `Build and deployment`
5. Sourceを `Deploy from a branch`
6. Branchを `main` / `/(root)` にして Save
7. 数分待つ
8. 表示されたURLを開く

## iPhone / iPadでアプリのように使う

SafariでGitHub Pagesのトリメモを開き、
「共有」→「ホーム画面に追加」
を選ぶと、アプリのように起動できます。

## 保存について

メモ・画像・動画はGitHubには保存されず、基本的にその端末のブラウザ内（IndexedDB）に保存されます。
ブラウザデータを削除すると消える可能性があるため、重要なデータは「バックアップを書き出す」で定期的に保存してください。

大きな動画を大量に保存すると、端末やブラウザの保存容量上限に達する場合があります。

## 次の拡張候補

- AI自動整理
- タグ
- ピン留め
- リマインダー
- 共有スペース
- クラウド同期
- メモ並べ替え
- Markdown対応
