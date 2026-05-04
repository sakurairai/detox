// ホスト名関連のユーティリティ。
// 非モジュールスクリプトとして書かれており、以下 3 つの読み込み形態に対応:
//   - background.js から importScripts() 経由
//   - options.html の <script> タグ経由
//   - content.js への chrome.scripting.executeScript({files}) インジェクト経由
// 関数はすべて top-level declaration で定義され、各実行コンテキストの
// グローバルスコープに公開される（content の場合は isolated world）。

/**
 * 入力文字列をホスト名に正規化する。
 * - スキーム付き (https://x.com/foo) → ホスト部分を抽出
 * - パスやクエリは除去
 * - 先頭の www. を除去
 * - 小文字化
 */
function normalizeHost(input) {
  if (!input) return "";
  let s = String(input).trim().toLowerCase();
  try {
    if (/^[a-z]+:\/\//.test(s)) {
      s = new URL(s).hostname;
    }
  } catch {
    // パース失敗時はフォールバックで後段処理
  }
  s = s.split("/")[0];
  s = s.replace(/^www\./, "");
  return s;
}

/**
 * 現在のホストがルールで指定されたホストにマッチするか判定。
 * 完全一致またはサブドメイン末尾一致ならマッチ。
 */
function hostMatches(currentHost, ruleHost) {
  const h = normalizeHost(currentHost);
  const r = normalizeHost(ruleHost);
  if (!h || !r) return false;
  return h === r || h.endsWith("." + r);
}
