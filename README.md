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

開発に貢献する方は [CONTRIBUTING.md](./CONTRIBUTING.md) を、リリース履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。


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

<details>
<summary>Chrome Web Store 公開手順</summary>

1. `extension/` フォルダを zip 化
2. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) にログイン（初回 $5）
3. 「新しいアイテム」から zip をアップロード
4. 説明文・スクリーンショット 1280×800・カテゴリ・プライバシーポリシー URL を入力
5. パーミッション使用理由（Justification）を記載。以下の文面はそのまま審査フォームに貼り付け可。

   **`host_permissions: <all_urls>` の使用理由**
   本拡張は、ユーザーが任意の Web サイト（X、Instagram などに加え、ユーザー自身が指定する SNS / ニュースサイト等）を「リダイレクト対象」として登録できることを中核機能としています。対象ドメインは事前に固定できないため、`<all_urls>` を要求します。すべてのページに対して content script を inject しますが、対象ドメインに合致しないページではタイマー起動・バナー表示を行いません。リモートサーバへの送信は一切行わず、ユーザーが登録したルールは `chrome.storage.local` にローカル保存されます。

   **代替権限の検討:** `activeTab` ではユーザーが拡張アイコンをクリックした瞬間にしか権限が得られず、本拡張のように「ユーザーが操作する前にバックグラウンドで滞在時間を計測して自動リダイレクトする」用途には実装上不可能です。`optional_host_permissions` で都度許可を取る設計も検討しましたが、(a) ユーザーが対象ドメインを登録するたびに許可ダイアログが出ることで「気が乗らないものから距離を置く」という体験が破綻する、(b) リダイレクト先ページでバナーを表示するために遷移先ホストにも別途許可が要る、という二点から本拡張のメンタルモデルと合致しないため採用していません。

   **`webNavigation` の使用理由**
   ユーザーが登録した対象ドメインへのナビゲーションを検知し、SPA 遷移を含めて滞在時間タイマーを起動するために使用します。

   **`scripting` の使用理由**
   対象ドメインのページに滞在時間カウントを行う content script を inject し、リダイレクト先ページではバナーを表示するために使用します。動的に inject するスクリプトは本拡張に同梱された `content.js` のみで、外部スクリプトの読み込みは行いません。

   **`tabs` の使用理由**
   リダイレクト発火時、ユーザーがブラウザの「戻る」ボタンで SNS に戻ってしまうことを防ぐために、新しいタブで遷移先を開いたうえで元の SNS タブを閉じる動作を行います。この実装に `chrome.tabs.create` および `chrome.tabs.remove` を用いるため必要です。

   **`storage` の使用理由**
   ユーザーが登録したリダイレクトルール（対象ホスト・遷移先 URL・タイマー設定）をローカル保存するために `chrome.storage.local` を使用します。リモートサーバへの送信は行いません。

6. プライバシーポリシー URL を入力（[`PRIVACY.md`](./PRIVACY.md) を GitHub の raw / blob URL でそのまま指定可能）
7. 審査提出（通常 1〜3 営業日）

</details>
