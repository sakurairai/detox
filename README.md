# SNS Detox Redirect

X (Twitter) や Instagram など、つい開きすぎてしまう SNS を開いてしばらく経つと、設定しておいた別のページへ自動でリダイレクトしてくれる Chrome 拡張機能です。SNS から距離を置きたいときに。

## できること

- 対象サイトを開いてから **N 秒後に M% の確率で** 別ページへリダイレクト
- 1 つのサイトに **複数のタイマーを段階的に** 設定可能（例: 10 秒後に 20%、60 秒後に 50%、180 秒後に 100%）
- リダイレクトは **新しいタブで開いて元のタブを閉じる** ので、戻るボタンで戻れない
- 遷移先のページの上部に「SNS Detox: リダイレクトしました」のバナーを表示
- ルール（対象ドメイン・遷移先 URL・タイマー）は拡張アイコンのポップアップから自由に編集可能

## インストール

### Chrome Web Store

> 準備中です。公開されたらここにリンクを掲載します。

### 開発版を手元で読み込む

1. このリポジトリをクローン、または [ZIP をダウンロード](../../archive/refs/heads/main.zip) して展開
2. Chrome で `chrome://extensions` を開く
3. 右上の **「デベロッパーモード」** をオン
4. **「パッケージ化されていない拡張機能を読み込む」** をクリック
5. このリポジトリの `extension/` フォルダを選択

## 使い方

1. ツールバーの拡張アイコンをクリックしてポップアップを開く
2. **「＋ ルールを追加」** または **「＋ このサイトをルール化」** をクリック
3. 対象ホスト名（例: `x.com`）と、リダイレクト先 URL（例: `https://example.com`）を入力
4. タイマーを設定（例: `60 秒後に 100% でリダイレクト`）
5. 必要に応じて **「＋ タイマーを追加」** で複数段階のタイマーを設定

ルールの変更は自動で保存されます。チェックボックスでルールごとの有効 / 無効を切り替えられます。

ホスト名はサブドメインも自動でマッチします（`x.com` と登録すると `mobile.x.com` などにも適用）。

## プライバシー

本拡張は、利用者が登録したルール（対象ホスト名・遷移先 URL・タイマー設定）を **ブラウザ内 (`chrome.storage.local`) にのみ保存** します。外部サーバへの送信、解析サービスや広告ネットワークへのデータ提供は一切ありません。

詳細は [PRIVACY.md](./PRIVACY.md) を参照してください。

## ライセンス

[MIT License](./LICENSE)

---

## 開発者向け

- 開発に貢献する方は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください
- リリース履歴は [CHANGELOG.md](./CHANGELOG.md)
- メンテナ向けのリリース手順は [RELEASING.md](./RELEASING.md)


<details>
<summary>ディレクトリ構成</summary>

```
.
└── extension/             # Chrome 拡張機能本体（Load unpacked で指定）
    ├── manifest.json
    ├── background.js      # Service Worker
    ├── content.js         # 全ページに inject されるタイマー＋バナー
    ├── options.html       # ポップアップ兼オプション画面
    ├── options.js
    ├── lib/
    │   ├── host.js
    │   └── rules.js
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

</details>

<details>
<summary>動作仕様</summary>

1. 全タブの遷移を `webNavigation.onCommitted` と `webNavigation.onHistoryStateUpdated`（SPA 遷移検知）で監視し、`content.js` を inject
2. `content.js` は2役を兼ねる:
   - 対象ドメインならタイマーを起動。当選したら background へ `REDIRECT_REQUEST`
   - URL に `?detox` があればバナーを表示し、URL から `?detox` を削除
3. background は要求を受けて、リダイレクト先 URL に `?detox` を付与し、**新しいタブで開いて元の SNS タブを閉じる**（戻るボタンで戻れない）。元タブの `pinned` / `groupId` も引き継ぐ
4. 遷移先で再度 `content.js` が起動 → クエリ検出 → バナー表示

タイマーは「ページロード起点」で計測（`Date.now()` ベースの 1 秒間隔ポーリングで、バックグラウンドタブでも停滞しない）。SPA 遷移では継続、フルリロードでリセット。

</details>

<details>
<summary>アーキテクチャ</summary>

すべてのスクリプトは **非モジュール（classic script）** として書かれている。共有ロジックは `lib/host.js`（ホスト判定）と `lib/rules.js`（ルール定義・ストレージ I/O・判定）に集約され、3 つの実行コンテキストから同じファイルを読み込む:

| コンテキスト | 読み込み方法 |
|---|---|
| Service Worker (`background.js`) | `importScripts("lib/host.js", "lib/rules.js")` |
| ポップアップ / オプション (`options.html`) | `<script src="lib/host.js">` → `<script src="lib/rules.js">` を順に配置 |
| Content Script (`content.js`) | `chrome.scripting.executeScript({ files: ["lib/host.js", "lib/rules.js", "content.js"] })` で同 isolated world に同梱注入 |

この設計により、ロジックの二重実装を排している。`lib/*.js` の top-level は再注入時の二重宣言エラーを避けるため `var` と `function` 宣言のみで構成（`const`/`let` は IIFE 内に閉じ込める）。

SW を非モジュールにしているのは、MV3 のベストプラクティス（リスナー登録は top-level 同期で行うこと）を守るため。`type: "module"` SW では `import` の解決待ちが発生してイベントを取りこぼす既知の問題があり、それを回避している。

</details>

