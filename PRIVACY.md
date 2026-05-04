# プライバシーポリシー / Privacy Policy

**対象拡張機能:** SNS Detox Redirect
**最終更新日 / Last updated:** 2026-05-04

---

## 単一目的の宣言 / Single Purpose Declaration

**日本語:** 本拡張は、ユーザーが事前に登録した対象ドメインの滞在時間と確率に応じて、別の URL へ自動リダイレクトすることを唯一の目的としています。

**English:** This extension's single purpose is to automatically redirect the user to a different URL based on dwell time on user-registered target domains and configurable probability values.

---

## 日本語

### 収集する情報

本拡張機能（以下「本拡張」）は、ユーザーの個人情報、閲覧履歴、Cookie、入力フォームの内容、認証情報など、いかなる個人を識別可能な情報も収集しません。

### ローカル保存するデータ

本拡張は以下の情報のみを、利用者のブラウザ内 (`chrome.storage.local`) にローカル保存します。これらの情報が利用者のデバイス外へ送信されることはありません。

- 利用者自身が設定画面で登録した「対象ホスト名」
- 利用者自身が設定画面で登録した「リダイレクト先 URL」
- 利用者自身が設定画面で登録した「タイマー秒数 / 確率」
- 利用者自身が設定画面で行った有効 / 無効の切り替え状態

### 外部送信

本拡張は、いかなるデータも外部のサーバ・第三者・解析サービス・広告ネットワークへ送信しません。

### 権限の使用目的

`<all_urls>` / `webNavigation` / `scripting` / `tabs` / `storage` の各権限は、利用者が登録したルールに従って対象ドメインの滞在時間を計測し、リダイレクトを実行するためにのみ使用されます。詳細は [README](./README.md) のパーミッション使用理由セクションを参照してください。

### 子どもの個人情報

本拡張は子どもを含む特定の利用者層を対象としておらず、いかなる個人情報も収集しません。

### 本ポリシーの変更

本ポリシーが変更された場合、本ファイル冒頭の「最終更新日」を更新します。

### お問い合わせ

本ポリシーに関するお問い合わせは、本リポジトリの GitHub Issues よりお願いいたします。

- Issues: https://github.com/sakurairai/detox/issues
- メンテナ: [@sakurairai](https://github.com/sakurairai)

---

## English

### Information We Collect

This extension does **not** collect any personally identifiable information, browsing history, cookies, form input, or authentication credentials.

### Locally Stored Data

This extension stores **only** the following data locally in the user's browser via `chrome.storage.local`. None of this data leaves the user's device.

- Target hostnames the user registered through the options UI
- Redirect destination URLs the user registered through the options UI
- Timer durations and probability values the user configured
- Per-rule enabled / disabled state the user toggled

### External Transmission

This extension does **not** transmit any data to any external server, third party, analytics service, or advertising network.

### Permission Usage

The `<all_urls>`, `webNavigation`, `scripting`, `tabs`, and `storage` permissions are used solely to measure dwell time on user-registered target domains and to perform the redirect according to user-configured rules. See the permission justification section of the [README](./README.md) for details.

### Children's Privacy

This extension is not directed at any specific demographic, including children, and does not collect any personal information.

### Changes to This Policy

If this policy is updated, the "Last updated" date at the top of this file will be revised.

### Contact

Questions regarding this policy should be filed via this repository's GitHub Issues.

- Issues: https://github.com/sakurairai/detox/issues
- Maintainer: [@sakurairai](https://github.com/sakurairai)
