# Contributing

本拡張への貢献を歓迎します。Issue / Pull Request はお気軽にどうぞ。

## 開発環境

ビルドステップは無く、`extension/` ディレクトリをそのまま `chrome://extensions` の「パッケージ化されていない拡張機能を読み込む」で読み込めば動作します。

```bash
git clone https://github.com/sakurairai/detox.git
cd detox
# その後 Chrome で extension/ を Load unpacked
```

## ファイル構成と責務

```
extension/
├── manifest.json
├── background.js   # Service Worker。リスナー登録は top-level 同期で行う
├── content.js      # ページに inject されるバナー＋タイマー
├── lib/
│   ├── host.js     # ホスト判定の共通ライブラリ（非モジュール）
│   └── rules.js    # ルール定義・ストレージ I/O・判定（非モジュール）
├── options.html
├── options.js
└── icons/
```

`lib/` は **3 つの実行コンテキストすべて** から同じファイルが読み込まれます（SW は `importScripts`、ポップアップは `<script>`、content script は `executeScript`）。重複実装を避けるための設計なので、修正は必ず `lib/` 側で行ってください。

## コーディング規約

- ESLint / Prettier は導入していません。既存ファイルのスタイルに揃えてください
- `lib/*.js` の top-level は **`var` と `function` 宣言のみ**（`const`/`let` は再注入時の二重宣言エラーを起こす）
- ローカル変数は `const`/`let` を使用してください（IIFE や関数の内部）
- 不要なコメントは追加せず、「なぜ」が非自明な箇所だけ書く
- 利用者向けの文言は日本語、コードコメントも日本語で OK

## 動作確認チェックリスト

PR 提出前に以下を確認してください:

- [ ] `node --check` で全 JS の構文エラーが無い
- [ ] Chrome で Load unpacked して、ルール追加 → 滞在 → リダイレクト → バナー表示 が動作する
- [ ] SPA 内遷移 (X や YouTube など) でタイマーが継続する
- [ ] フルリロードでタイマーがリセットされる
- [ ] 拡張アイコンクリック → ポップアップでルール編集 → 保存される
- [ ] 「＋ このサイトをルール化」ボタンが現在のホストで動作する
- [ ] キーボード操作（Tab / Enter）でルールの有効化・削除ができる
- [ ] ダークモードで表示が崩れない

## コミットメッセージ

短く簡潔に。複数の変更を 1 コミットに混ぜず、論理的な単位で分割してください。コミットメッセージは日本語 / 英語どちらでも構いません。

## リリース

メンテナのみが行います。`manifest.json` の `version` を更新し、`CHANGELOG.md` に記載した上で `extension/` を zip 化して [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) からアップロードします。詳細手順は [README](./README.md) の「Chrome Web Store 公開手順」を参照。
