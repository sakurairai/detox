# リリース手順

メンテナ向け。Chrome Web Store への公開手順をまとめます。

## バージョニング

`extension/manifest.json` の `version` を更新します。Semantic Versioning に準拠（`MAJOR.MINOR.PATCH`）。Web Store はバージョン文字列の単調増加を要求するため、一度公開した番号より大きい値にすること。

更新後、`CHANGELOG.md` に該当バージョンのセクションを書き起こします（Keep a Changelog 形式）。

## ローカルでの最終確認

```bash
node --check extension/background.js
node --check extension/content.js
node --check extension/options.js
node --check extension/lib/host.js
node --check extension/lib/rules.js
```

`chrome://extensions` から `extension/` を「パッケージ化されていない拡張機能を読み込む」で読み込み、CONTRIBUTING.md の動作確認チェックリストを通します。

## Chrome Web Store への提出

1. `extension/` フォルダを zip 化
2. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) にログイン（初回登録 $5）
3. 「新しいアイテム」から zip をアップロード
4. 説明文・スクリーンショット 1280×800・カテゴリ・プライバシーポリシー URL を入力
   - プライバシーポリシー URL は [`PRIVACY.md`](./PRIVACY.md) の GitHub raw / blob URL で指定可能
   - Single purpose 欄には PRIVACY.md 冒頭の "Single Purpose Declaration" 英語版をそのままコピペ
5. 後述のパーミッション使用理由（Justification）を貼り付け
6. 審査提出（通常 1〜3 営業日）

## パーミッション使用理由（Justification）

以下の文面はそのまま審査フォームに貼り付け可能です。

### `host_permissions: <all_urls>` の使用理由

本拡張は、ユーザーが任意の Web サイト（X、Instagram などに加え、ユーザー自身が指定する SNS / ニュースサイト等）を「リダイレクト対象」として登録できることを中核機能としています。対象ドメインは事前に固定できないため、`<all_urls>` を要求します。すべてのページに対して content script を inject しますが、対象ドメインに合致しないページではタイマー起動・バナー表示を行いません。リモートサーバへの送信は一切行わず、ユーザーが登録したルールは `chrome.storage.local` にローカル保存されます。

**代替権限の検討:** `activeTab` ではユーザーが拡張アイコンをクリックした瞬間にしか権限が得られず、本拡張のように「ユーザーが操作する前にバックグラウンドで滞在時間を計測して自動リダイレクトする」用途には実装上不可能です。`optional_host_permissions` で都度許可を取る設計も検討しましたが、(a) ユーザーが対象ドメインを登録するたびに許可ダイアログが出ることで「気が乗らないものから距離を置く」という体験が破綻する、(b) リダイレクト先ページでバナーを表示するために遷移先ホストにも別途許可が要る、という二点から本拡張のメンタルモデルと合致しないため採用していません。

### `webNavigation` の使用理由

ユーザーが登録した対象ドメインへのナビゲーションを検知し、SPA 遷移を含めて滞在時間タイマーを起動するために使用します。

### `scripting` の使用理由

対象ドメインのページに滞在時間カウントを行う content script を inject し、リダイレクト先ページではバナーを表示するために使用します。動的に inject するスクリプトは本拡張に同梱された `content.js` のみで、外部スクリプトの読み込みは行いません。

### `tabs` の使用理由

リダイレクト発火時、ユーザーがブラウザの「戻る」ボタンで SNS に戻ってしまうことを防ぐために、新しいタブで遷移先を開いたうえで元の SNS タブを閉じる動作を行います。この実装に `chrome.tabs.create` および `chrome.tabs.remove` を用いるため必要です。

### `storage` の使用理由

ユーザーが登録したリダイレクトルール（対象ホスト・遷移先 URL・タイマー設定）をローカル保存するために `chrome.storage.local` を使用します。リモートサーバへの送信は行いません。

## リリース後

1. ローカルで該当バージョンの git タグを打ってリモートへ push
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. GitHub Releases で同じバージョンのリリースを作成、CHANGELOG の該当セクションを本文にコピー
