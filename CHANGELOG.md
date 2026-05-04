# Changelog

本ファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に従い、本拡張の変更履歴を記録します。
本プロジェクトは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) に準拠します。

## [Unreleased]

## [1.3.0] - 2026-05-04

初回の公開準備版。`1.0.0` から `1.2.x` までは内部反復のため、最初の公開は `1.3.0` から開始する。

### Added

- 対象ドメインの滞在時間と確率に応じた自動リダイレクト機能
- 1 ルールにつき複数タイマーを段階的に設定できる UI
- リダイレクト先ページ上部のバナー表示（`?detox` クエリで発火）
- ポップアップ兼オプション画面（拡張アイコンクリックで起動）
- クイックアクション「＋ このサイトをルール化」（現在開いているホストを 1 クリックで登録）
- クイックアクション「このサイトのルールを表示」（既登録ホストの場合に該当ルールカードへスクロール＋ハイライト）
- ルールごとの有効 / 無効トグル
- ホスト名のサブドメイン一致 (`x.com` → `mobile.x.com` も対象)
- フォーム要素の `aria-label` / `aria-invalid` / `aria-live` 対応
- キーボード操作の `:focus-visible` ハイライト
- バナーの `prefers-reduced-motion` 対応
- バナー表示後の `?detox` クエリ自動除去（`history.replaceState`）
- SPA 遷移 (`webNavigation.onHistoryStateUpdated`) を含むナビゲーション検知
- `chrome.tabs.create` 時の元タブの `pinned` / `groupId` 引き継ぎ
- バックグラウンドタブでも遅延しない `Date.now()` ベースのタイマー実装

### Changed

- 旧スキーマ（`{ probability }` のみのルール）から新スキーマへのストレージマイグレーションは `chrome.runtime.onInstalled` で 1 度だけ実行する。`loadRules()` は読み出し専用となり、編集中の保存とのレースを防ぐ。

### Security

- リダイレクト先 URL のスキーム検証（`http(s)` のみ許容）
- `onMessage` ハンドラでの `sender.id` / `sender.frameId` 検証
- `REDIRECT_REQUEST` メッセージは `sender.url`（Chrome 側が保証する送信時点の URL）から導出したホストと、メッセージに含まれる `ruleId` で対象ルールを照合してから実行する（content script 偽造耐性）
- バナー表示は `chrome.tabs.create` 直前に `chrome.storage.session` へ書き込む TTL 付きの認可エントリを根拠とし、content は `CLAIM_BANNER` で確認してから表示する（任意のサイトに `?detox` を付けたページが拡張ブランドのバナーを出せないよう抑止）
- ?detox 付きで到達したページではタイマーを起動しない（A→B / B→A 相互ループ抑止）
- バナーは Closed Shadow DOM 内にマウントし、ページ JS から内部の DOM を直接読み取れないようにする（拡張保有の指紋化を抑止）
- 抽選乱数を `crypto.getRandomValues` ベースに統一（defense-in-depth）
- ルール ID を UUID 様文字列形式で検証し、不正な ID は `migrateRule` で振り直す（DOM 検索のセレクタ注入対策）
- ストレージのマイグレーションは `chrome.runtime.onInstalled` と `chrome.runtime.onStartup` の両方で 1 度ずつ実行する
- Manifest V3 のデフォルト CSP に依拠（明示宣言なし。インライン / 外部スクリプト不可）
- 既定の `DEFAULT_RULES` を空にし、ハードコードされた誘導 URL を削除
- `importScripts` の引数は拡張パッケージ内の相対パス固定（remote code execution 対策）

[Unreleased]: https://github.com/sakurairai/detox/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/sakurairai/detox/releases/tag/v1.3.0
