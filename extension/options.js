// 管理画面（ポップアップ兼オプション）のロジック。
// 状態 / 操作 / レンダリング / 初期化 をセクションで分離。
//
// options.html で lib/host.js → lib/rules.js → options.js の順に
// 読み込まれている前提で、normalizeHost / hostMatches / loadRules /
// saveRules / clampProbability / clampSeconds / defaultTimer / isHttpUrl
// をグローバルスコープから参照する。

// ============================================================
// 定数 / 状態
// ============================================================

const SAVE_DEBOUNCE_MS = 250;
const FLASH_DURATION_MS = 1200;
const HIGHLIGHT_DURATION_MS = 1500;

const state = {
  rules: [],
  currentHost: null, // ポップアップを開いた時点のアクティブタブのホスト
};

const $ = (id) => document.getElementById(id);
const refs = {
  rules: $("rules"),
  quick: $("quick"),
  msg: $("msg"),
  add: $("add"),
};

// ============================================================
// 保存 / 一時メッセージ
// ============================================================

let saveTimer = null;
let flashTimer = null;

function flash(text) {
  refs.msg.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (refs.msg.textContent = ""), FLASH_DURATION_MS);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveRules(state.rules);
    flash("保存しました");
  }, SAVE_DEBOUNCE_MS);
}

// ============================================================
// ルール / タイマーの操作
// ============================================================

function addRule(partial = {}) {
  // id は常に新規発行を強制する。partial 経由で id を上書きできてしまうと
  // 将来のインポート機能等で不正な id が混入する経路になる。
  const rule = {
    host: "",
    redirectUrl: "",
    enabled: true,
    timers: [defaultTimer()],
    ...partial,
    id: crypto.randomUUID(),
  };
  state.rules.push(rule);
  scheduleSave();
  return rule;
}

function removeRule(id) {
  state.rules = state.rules.filter((r) => r.id !== id);
  scheduleSave();
}

function updateRule(id, patch) {
  const r = findRule(id);
  if (r) {
    Object.assign(r, patch);
    scheduleSave();
  }
}

function addTimer(ruleId) {
  const r = findRule(ruleId);
  if (!r) return;
  if (!Array.isArray(r.timers)) r.timers = [];
  r.timers.push(defaultTimer());
  scheduleSave();
}

function removeTimer(ruleId, index) {
  const r = findRule(ruleId);
  if (!r) return;
  r.timers.splice(index, 1);
  scheduleSave();
}

function updateTimer(ruleId, index, patch) {
  const r = findRule(ruleId);
  const t = r?.timers?.[index];
  if (!t) return;
  Object.assign(t, patch);
  scheduleSave();
}

function findRule(id) {
  return state.rules.find((r) => r.id === id);
}

// ============================================================
// DOM ヘルパー
// ============================================================

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === "attrs") for (const [a, val] of Object.entries(v)) node.setAttribute(a, val);
    else node[k] = v;
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function textInput({ type, value, placeholder, ariaLabel, onChange, onBlur }) {
  const node = el("input", {
    type,
    placeholder: placeholder || "",
    value: value ?? "",
    on: {
      input: (e) => onChange(e.target.value),
      ...(onBlur ? { blur: (e) => onBlur(e.target) } : {}),
    },
  });
  if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
  return node;
}

// 対象ホスト名入力。blur 時に normalizeHost を適用して保存値を整える。
// 空白だけで blur した場合は元値を潰さないよう no-op する。
function hostInput({ value, placeholder, onChange }) {
  return textInput({
    type: "text",
    value,
    placeholder,
    ariaLabel: "対象ホスト名",
    onChange,
    onBlur: (input) => {
      const original = input.value;
      const normalized = normalizeHost(original);
      // 入力が事実上空（trim+正規化結果が空）かつ元値が非空なら何もしない
      if (normalized === "" && original !== "") return;
      if (normalized !== original) {
        input.value = normalized;
        onChange(normalized);
      }
    },
  });
}

// URL 入力の妥当性表示（aria-invalid）を一元的に決定する。
// data-touched が立っていない（=未編集の新規ルール）うちは、
// 「空欄 + enabled」を invalid 表示しない（即赤くしない）。
function setUrlInputValidity(input, value, enabled) {
  const touched = input.dataset.touched === "true";
  const invalid =
    (value.length > 0 && !isHttpUrl(value)) ||
    (touched && enabled && value.length === 0);
  input.setAttribute("aria-invalid", String(invalid));
}

// http(s) のみ許容。空欄かつ enabled は invalid だが、初回 blur まで警告しない。
function redirectUrlInput({ value, placeholder, onChange, isEnabled }) {
  const node = el("input", {
    type: "url",
    placeholder: placeholder || "",
    value: value ?? "",
    on: {
      input: (e) => {
        setUrlInputValidity(e.target, e.target.value, isEnabled?.() ?? true);
        onChange(e.target.value);
      },
      blur: (e) => {
        e.target.dataset.touched = "true";
        setUrlInputValidity(e.target, e.target.value, isEnabled?.() ?? true);
      },
    },
  });
  node.setAttribute("aria-label", "リダイレクト先 URL");
  // 既存値があるルールは「編集経験あり」として touched 扱い
  if ((value ?? "").length > 0) node.dataset.touched = "true";
  setUrlInputValidity(node, value ?? "", isEnabled?.() ?? true);
  return node;
}

function numberInput({ value, min = 0, max, ariaLabel, onChange, onBlur }) {
  const input = el("input", {
    type: "number",
    value,
    on: {
      input: (e) => onChange(e.target.value),
      ...(onBlur ? { blur: (e) => onBlur(e.target) } : {}),
    },
    attrs: { min: String(min), step: "1" },
  });
  if (max !== undefined) input.setAttribute("max", String(max));
  if (ariaLabel) input.setAttribute("aria-label", ariaLabel);
  return input;
}

function removeButton({ title, onClick }) {
  return el("button", {
    class: "btn-remove icon",
    text: "×",
    title,
    on: { click: onClick },
    attrs: { "aria-label": title },
  });
}

// ============================================================
// レンダリング: タイマー行
// ============================================================

function createTimerRow(rule, timer, index, opts = {}) {
  const secInput = numberInput({
    value: timer.seconds ?? 60,
    min: 0,
    ariaLabel: "リダイレクトまでの秒数",
    onChange: (v) => updateTimer(rule.id, index, { seconds: clampSeconds(v) }),
    onBlur: (input) => {
      const clamped = clampSeconds(input.value);
      if (String(clamped) !== input.value) input.value = String(clamped);
    },
  });
  const probInput = numberInput({
    value: timer.probability ?? 100,
    min: 0,
    max: 100,
    ariaLabel: "リダイレクト発火確率（パーセント）",
    onChange: (v) => updateTimer(rule.id, index, { probability: clampProbability(v) }),
    onBlur: (input) => {
      const clamped = clampProbability(input.value);
      if (String(clamped) !== input.value) input.value = String(clamped);
    },
  });

  return el(
    "div",
    { class: "timer" },
    secInput,
    el("span", { class: "unit", text: "秒後に" }),
    probInput,
    el("span", { class: "unit", text: "% でリダイレクト" }),
    el("div", { class: "timer-spacer" }),
    removeButton({
      title: "このタイマーを削除",
      onClick: () => {
        removeTimer(rule.id, index);
        renderAll();
        // 隣接するタイマー、無ければ「＋ タイマーを追加」へフォーカス
        const card = findCard(opts.onRemoveFocusFallbackId || rule.id);
        const timers = card?.querySelectorAll(".timer") ?? [];
        const next = timers[index] || timers[index - 1];
        if (next) {
          next.querySelector('input[type="number"]')?.focus();
        } else {
          card?.querySelector(".btn-add-timer")?.focus();
        }
      },
    })
  );
}

// ============================================================
// レンダリング: ルールカード
// ============================================================

function createRuleHead(rule, card) {
  const toggle = el("input", {
    type: "checkbox",
    checked: !!rule.enabled,
    on: {
      change: (e) => {
        const enabled = e.target.checked;
        updateRule(rule.id, { enabled });
        card.classList.toggle("disabled", !enabled);
        card.setAttribute("aria-disabled", String(!enabled));
        // URL の必須警告は enabled に連動するため再評価
        const urlInput = card.querySelector('input[type="url"]');
        if (urlInput) setUrlInputValidity(urlInput, urlInput.value, enabled);
      },
    },
  });
  toggle.setAttribute("aria-label", "このルールを有効にする");

  return el(
    "div",
    { class: "rule-head" },
    el("label", { class: "toggle" }, toggle),
    hostInput({
      value: rule.host,
      placeholder: "x.com",
      onChange: (v) => updateRule(rule.id, { host: v }),
    }),
    el("span", { class: "arrow", text: "→", attrs: { "aria-hidden": "true" } }),
    redirectUrlInput({
      value: rule.redirectUrl,
      placeholder: "https://example.com",
      onChange: (v) => updateRule(rule.id, { redirectUrl: v }),
      isEnabled: () => !!findRule(rule.id)?.enabled,
    }),
    removeButton({
      title: "このルールを削除",
      onClick: () => {
        const ruleIndex = state.rules.findIndex((r) => r.id === rule.id);
        removeRule(rule.id);
        renderAll();
        focusAfterRuleRemoval(ruleIndex);
      },
    })
  );
}

function focusAfterRuleRemoval(removedIndex) {
  const cards = refs.rules.querySelectorAll(".rule");
  const next = cards[removedIndex] || cards[removedIndex - 1];
  if (next) {
    const input = next.querySelector('input[type="text"]');
    input?.focus();
  } else {
    refs.add.focus();
  }
}

function createTimersSection(rule) {
  const timers = Array.isArray(rule.timers) ? rule.timers : [];
  const rows = timers.map((t, i) =>
    createTimerRow(rule, t, i, { onRemoveFocusFallbackId: rule.id })
  );

  const addBtn = el("button", {
    class: "btn btn-add-timer",
    text: "＋ タイマーを追加",
    on: {
      click: () => {
        addTimer(rule.id);
        renderAll();
        // 追加した最後のタイマーの「秒数」入力にフォーカス
        const card = findCard(rule.id);
        const lastTimer = card?.querySelectorAll(".timer")[
          (findRule(rule.id)?.timers?.length ?? 1) - 1
        ];
        lastTimer?.querySelector('input[type="number"]')?.focus();
      },
    },
  });

  return el(
    "div",
    { class: "timers" },
    el("div", { class: "timers-label", text: "タイマー" }),
    ...rows,
    addBtn
  );
}

function createRuleCard(rule) {
  const card = el("div", {
    class: "rule" + (rule.enabled ? "" : " disabled"),
  });
  card.dataset.id = rule.id;
  card.setAttribute("aria-disabled", String(!rule.enabled));
  card.appendChild(createRuleHead(rule, card));
  card.appendChild(createTimersSection(rule));
  return card;
}

function createEmptyState() {
  return el("div", { class: "empty", text: "ルールがありません。" });
}

function renderRules() {
  const children = state.rules.length === 0
    ? [createEmptyState()]
    : state.rules.map(createRuleCard);
  refs.rules.replaceChildren(...children);
}

// ============================================================
// レンダリング: クイックアクション
// ============================================================

function renderQuick() {
  if (!state.currentHost) {
    refs.quick.classList.add("hidden");
    refs.quick.replaceChildren();
    return;
  }
  refs.quick.classList.remove("hidden");

  const existing = state.rules.find((r) =>
    hostMatches(state.currentHost, r.host)
  );
  const action = existing
    ? createJumpToRuleButton(existing.id)
    : createAddCurrentHostButton();

  refs.quick.replaceChildren(
    createCurrentHostLabel(state.currentHost),
    el("div", { class: "spacer" }),
    action
  );
}

function createCurrentHostLabel(host) {
  return el(
    "div",
    {},
    "現在のページ: ",
    el("span", { class: "host", text: host })
  );
}

function createJumpToRuleButton(ruleId) {
  return el("button", {
    class: "btn",
    text: "このサイトのルールを表示",
    on: { click: () => highlightCard(ruleId) },
  });
}

function createAddCurrentHostButton() {
  return el("button", {
    class: "btn btn-primary",
    text: "＋ このサイトをルール化",
    on: {
      click: () => {
        const rule = addRule({ host: state.currentHost });
        renderAll();
        focusCardInput(rule.id, 'input[type="url"]');
      },
    },
  });
}

// ============================================================
// カード操作（ハイライト・フォーカス）
// ============================================================

function findCard(id) {
  // id を CSS セレクタに直結すると注入リスクがあるため、children を線形検索する。
  for (const el of refs.rules.children) {
    if (el.dataset && el.dataset.id === id) return el;
  }
  return null;
}

function highlightCard(id) {
  const card = findCard(id);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("highlight");
  setTimeout(() => card.classList.remove("highlight"), HIGHLIGHT_DURATION_MS);
}

function focusCardInput(id, selector) {
  const card = findCard(id);
  if (!card) return;
  const input = card.querySelector(selector);
  if (input) {
    input.focus();
    input.select?.();
  }
}

// ============================================================
// 全体レンダリング
// ============================================================

function renderAll() {
  renderRules();
  renderQuick();
}

// ============================================================
// 現在のタブのホスト取得
// ============================================================

async function getCurrentHost() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.url) return null;
    const u = new URL(tab.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return normalizeHost(u.hostname);
  } catch {
    return null;
  }
}

// ============================================================
// イベントバインド / 初期化
// ============================================================

function bindEvents() {
  refs.add.addEventListener("click", () => {
    const rule = addRule();
    renderAll();
    focusCardInput(rule.id, 'input[type="text"]');
  });

  // TODO: 複数ウィンドウからの編集同期は未実装。
  // 必要なら chrome.storage.onChanged で state.rules を更新する。
  // 自分の保存にも発火するため、再描画はフォーカス維持を考慮する必要あり。
}

async function init() {
  const [rules, host] = await Promise.all([loadRules(), getCurrentHost()]);
  state.rules = rules;
  state.currentHost = host;
  bindEvents();
  renderAll();
}

init();
