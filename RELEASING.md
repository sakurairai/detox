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

## ストアリスト掲載文

### Short description（132 文字以内）

```
Redirect away from time-sink sites after a configurable dwell time. Build focus habits by escaping social media loops automatically.
```

### Long description

```
SNS Detox Redirect helps you build healthier browsing habits by automatically redirecting you away from social media and other time-sink sites after you've spent a configurable amount of time on them.

HOW IT WORKS
1. Add a rule: enter the domain you want to limit (e.g. x.com) and the destination URL (e.g. your task manager or a blank page).
2. Set a timer: choose how many seconds to wait before the redirect triggers, and the probability (1–100%) that it fires on any given visit.
3. Browse normally: when you exceed the set time on a target domain, the extension opens the destination in a new tab and closes the original — no back-button escape.

FEATURES
• Multiple timers per rule — ramp up gradually (e.g. 50% after 60 s, 100% after 180 s)
• SPA-aware — detects in-app navigation on single-page apps
• Redirect banner — a discreet notice on the destination page reminds you why you were redirected
• Subdomain matching — a rule for x.com also covers mobile.x.com
• Enable/disable individual rules without deleting them
• Dark mode support

PRIVACY
All settings are stored locally on your device. No data is sent to any server. No tracking, no analytics.
```

## パーミッション使用理由（Justification）

以下の文面はそのまま審査フォームに貼り付け可能です。英語版・日本語版を掲載します。

### `host_permissions: ["http://*/*", "https://*/*"]` の使用理由

**英語（審査フォーム提出用）**

```
This extension lets users register any web domain (social media sites, news sites, or any other time-sink site of their choosing) as a redirect target. Because the target domains cannot be known in advance, broad host permissions over HTTP and HTTPS are required. Content scripts are injected on all pages, but the dwell-time timer and banner logic are only activated when the page hostname matches a user-defined rule. No data is sent to remote servers; all user rules are stored locally via chrome.storage.local.

Alternative permissions considered: "activeTab" only grants access at the moment the user clicks the extension icon, which makes background dwell-time measurement impossible. "optional_host_permissions" with per-domain prompts would break the user experience — each new rule addition would trigger a permission dialog — and would also require separate grants for redirect-destination pages where the banner needs to appear.
```

**日本語（参考訳）**

本拡張は、ユーザーが任意の Web サイト（X、Instagram などに加え、ユーザー自身が指定する SNS / ニュースサイト等）を「リダイレクト対象」として登録できることを中核機能としています。対象ドメインは事前に固定できないため、HTTP / HTTPS 全域のホスト権限を要求します。すべてのページに対して content script を inject しますが、対象ドメインに合致しないページではタイマー起動・バナー表示を行いません。リモートサーバへの送信は一切行わず、ユーザーが登録したルールは `chrome.storage.local` にローカル保存されます。

### `webNavigation` の使用理由

**英語（審査フォーム提出用）**

```
Used to detect navigation to user-registered target domains — including SPA transitions via onHistoryStateUpdated — so that the dwell-time timer starts (or restarts) correctly without requiring a full page reload.
```

**日本語（参考訳）**

ユーザーが登録した対象ドメインへのナビゲーションを検知し、SPA 遷移（`onHistoryStateUpdated`）を含めて滞在時間タイマーを正しく起動・再起動するために使用します。

### `scripting` の使用理由

**英語（審査フォーム提出用）**

```
Used to inject content scripts that measure dwell time on target-domain pages and display a redirect banner on destination pages. Only scripts bundled with the extension (content.js) are injected; no remote code is ever loaded.
```

**日本語（参考訳）**

対象ドメインのページに滞在時間カウントを行う content script を inject し、リダイレクト先ページではバナーを表示するために使用します。動的に inject するスクリプトは本拡張に同梱された `content.js` のみで、外部スクリプトの読み込みは行いません。

### `storage` の使用理由

**英語（審査フォーム提出用）**

```
Used to persist user-defined redirect rules (target host, destination URL, timer settings) locally via chrome.storage.local and to coordinate banner-display authorization across the service worker and content scripts via chrome.storage.session. No data is transmitted to remote servers.
```

**日本語（参考訳）**

ユーザーが登録したリダイレクトルール（対象ホスト・遷移先 URL・タイマー設定）をローカル保存するために `chrome.storage.local` を、バナー表示認可情報の SW ↔ content 間共有に `chrome.storage.session` を使用します。リモートサーバへの送信は行いません。

## リリース後

1. ローカルで該当バージョンの git タグを打ってリモートへ push
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. GitHub Releases で同じバージョンのリリースを作成、CHANGELOG の該当セクションを本文にコピー
