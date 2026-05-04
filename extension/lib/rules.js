// ルールの定義・読み書き・判定ロジック。
// 非モジュールスクリプト。lib/host.js がこの前に読み込まれている前提で、
// hostMatches / normalizeHost をグローバルスコープから参照する。
//
// ルール構造:
//   {
//     id: string,
//     host: string,
//     redirectUrl: string,
//     enabled: boolean,
//     timers: Array<{ seconds: number, probability: number }>
//   }

// content script として再注入された際、top-level `const`/`let` は
// GlobalLexicalEnvironment の二重宣言エラーになるため `var` を使う。
// 値はリードオンリーとして扱う。

// 初回インストール時は空ルールから開始する。
// ユーザー自身が「対象ホスト」と「リダイレクト先」を設定して使い始める。
var DEFAULT_RULES = [];

// バナー表示のトリガとなるクエリキー（値は不問・存在チェックのみ）
var QUERY_KEY = "detox";

// ============================================================
// 値の正規化
// ============================================================

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function clampSeconds(v) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, n);
}

function clampProbability(v) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function defaultTimer() {
  return { seconds: 60, probability: 100 };
}

// ============================================================
// マイグレーション
// ============================================================

// id を「英数字 + ハイフン」の UUID 様文字列に正規化する。
// version ニブルは検査しないため UUID v1〜v8 全てを許容するが、本拡張で id
// に求めるのは「DOM dataset と JSON ストレージで安全に往復できる文字列」
// であって暗号学的性質ではないため、これで十分。形式不一致なら新規発行。
// （過去には querySelector セレクタ注入を許す経路だったため検証を入れた）
function safeUuid(id) {
  if (typeof id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return crypto.randomUUID();
}

function migrateRule(rule) {
  if (!rule || typeof rule !== "object") return null;

  if (Array.isArray(rule.timers)) {
    const timers = rule.timers
      .filter((t) => t && typeof t === "object")
      .map((t) => ({
        seconds: clampSeconds(t.seconds),
        probability: clampProbability(t.probability),
      }))
      .sort((a, b) => a.seconds - b.seconds);
    return {
      id: safeUuid(rule.id),
      host: rule.host || "",
      redirectUrl: rule.redirectUrl || "",
      enabled: rule.enabled !== false,
      timers,
    };
  }

  // 旧スキーマ: { probability } のみ → 0秒タイマー1個に変換
  const probability = clampProbability(rule.probability ?? 20);
  return {
    id: safeUuid(rule.id),
    host: rule.host || "",
    redirectUrl: rule.redirectUrl || "",
    enabled: rule.enabled !== false,
    timers: [{ seconds: 0, probability }],
  };
}

// ============================================================
// ストレージ I/O
// ============================================================

// 純粋な読み出し。マイグレーション結果を「自動で書き戻さない」のは、
// options 編集中の debounce 保存とのレースで未確定値を上書きしないため。
// 実際のマイグレーション永続化は migrateStorageOnce()（onInstalled で実行）が担う。
async function loadRules() {
  const { rules } = await chrome.storage.local.get(["rules"]);
  if (!Array.isArray(rules)) return [];
  return rules.map(migrateRule).filter(Boolean);
}

async function saveRules(rules) {
  await chrome.storage.local.set({ rules });
}

async function initializeIfEmpty() {
  const { rules } = await chrome.storage.local.get(["rules"]);
  if (!Array.isArray(rules)) {
    await chrome.storage.local.set({ rules: DEFAULT_RULES });
  }
}

// インストール / 更新時に 1 回だけ走らせるストレージマイグレーション。
// 旧スキーマを新スキーマに書き換えて永続化する。
async function migrateStorageOnce() {
  const { rules } = await chrome.storage.local.get(["rules"]);
  if (!Array.isArray(rules)) return;
  const migrated = rules.map(migrateRule).filter(Boolean);
  if (JSON.stringify(migrated) === JSON.stringify(rules)) return;
  try {
    await chrome.storage.local.set({ rules: migrated });
  } catch {}
}

// ============================================================
// 判定
// ============================================================

function isUsableRule(rule) {
  if (!rule || !rule.enabled) return false;
  if (!rule.host || !rule.redirectUrl) return false;
  if (!Array.isArray(rule.timers) || rule.timers.length === 0) return false;
  return true;
}

function findMatchingRule(rules, host) {
  for (const rule of rules) {
    if (!isUsableRule(rule)) continue;
    if (hostMatches(host, rule.host)) return rule;
  }
  return null;
}

function wouldLoop(rule) {
  let target;
  try {
    target = new URL(rule.redirectUrl);
  } catch {
    return true;
  }
  // リダイレクト先で同じルールが再起動するか（= ループ条件）を判定。
  // hostMatches(currentHost, ruleHost) と同じ向きで揃え、
  // 短いホスト誤入力（例: rule.host="co.jp"）で過剰検出するのを避ける。
  return hostMatches(target.hostname, rule.host);
}

// ============================================================
// URL組立
// ============================================================

/** リダイレクト先URLにバナートリガとなる ?detox を付与 */
function appendDetoxQuery(redirectUrl) {
  try {
    const url = new URL(redirectUrl);
    url.searchParams.set(QUERY_KEY, "");
    return url.toString();
  } catch {
    return redirectUrl;
  }
}
