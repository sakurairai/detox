// Content Script: 2つの役割を兼ねる。
//
// (1) 対象ドメインならタイマーを起動し、当選したら background にリダイレクト要求
// (2) URL に ?detox があり、かつ background が事前に発行した認可（CLAIM_BANNER で
//     確認）が存在する場合のみバナーを表示
//
// background.js の chrome.scripting.executeScript は
// lib/host.js → lib/rules.js → content.js の順で同じ isolated world に
// 注入する。ここでは前 2 ファイルが定義する以下のグローバル関数を直接参照する:
//   - hostMatches, normalizeHost (host.js)
//   - QUERY_KEY, isUsableRule, wouldLoop, clampSeconds, clampProbability (rules.js)

(async () => {
  // SPA 再 inject や onHistoryStateUpdated 経由の多重起動に対して、
  // バナー処理とタイマー起動を別々に冪等化する。
  if (!window.__snsDetoxState) {
    window.__snsDetoxState = { timerStarted: false, lastBannerUrl: null };
  }
  const detoxState = window.__snsDetoxState;

  const BANNER_MESSAGE = "リダイレクトしました";
  const BANNER_DURATION_MS = 5000;
  const BANNER_FADE_MS = 400;
  const reduceMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ?detox の存在は早期に snapshot する。後段で history.replaceState により
  // クエリが消えるため、そのあとに参照できるよう保持しておく。
  const initialUrl = new URL(location.href);
  const arrivedViaDetox = initialUrl.searchParams.has(QUERY_KEY);

  // ============================================================
  // (2) バナー表示: 認可確認 → 表示 → クエリ除去
  // ============================================================

  await showBannerIfRequested();

  async function showBannerIfRequested() {
    if (!arrivedViaDetox) return;
    if (detoxState.lastBannerUrl === location.href) return;
    detoxState.lastBannerUrl = location.href;

    cleanDetoxQueryFromUrl(initialUrl);

    // バナー表示は background が発行した tab 単位の認可を必要とする。
    // 任意のサイトに ?detox を付けただけでは表示されない。
    let allowed = false;
    try {
      const res = await chrome.runtime.sendMessage({ type: "CLAIM_BANNER" });
      allowed = res && res.show === true;
    } catch {}

    if (allowed) showBanner(BANNER_MESSAGE);
  }

  function cleanDetoxQueryFromUrl(url) {
    try {
      url.searchParams.delete(QUERY_KEY);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch {}
  }

  function showBanner(message) {
    const mount = () => {
      // ホスト要素は Closed Shadow DOM 入れ子で、ページ JS から banner DOM
      // 内容を直接読み取れないようにする（拡張保有の指紋化を抑止）。
      const host = document.createElement("div");
      const parent = document.body || document.documentElement;
      if (!parent) return;
      parent.appendChild(host);
      const shadow = host.attachShadow({ mode: "closed" });

      const banner = document.createElement("div");
      const transition = reduceMotion
        ? "transition: none"
        : "transition: opacity " + BANNER_FADE_MS + "ms ease-out";
      banner.style.cssText = [
        "all: initial",
        "position: fixed",
        "top: 0",
        "left: 0",
        "right: 0",
        "z-index: 2147483647",
        "padding: 12px 20px",
        "background: linear-gradient(135deg, #4e1c8c 0%, #12cfe0 100%)",
        "color: #ffffff",
        "font-family: system-ui, -apple-system, 'Segoe UI', sans-serif",
        "font-size: 14px",
        "font-weight: 600",
        "letter-spacing: 0.02em",
        "line-height: 1.4",
        "text-align: center",
        "box-shadow: 0 2px 12px rgba(0,0,0,0.35)",
        "pointer-events: none",
        transition,
        "opacity: 1",
      ].join(";");
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.textContent = "SNS Detox: " + message;
      shadow.appendChild(banner);

      setTimeout(() => {
        if (reduceMotion) {
          host.remove();
        } else {
          banner.style.opacity = "0";
          setTimeout(() => host.remove(), BANNER_FADE_MS);
        }
      }, BANNER_DURATION_MS);
    };

    if (document.body) {
      mount();
    } else {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    }
  }

  // ============================================================
  // (1) タイマー起動: 対象ドメインかチェックしてから
  // ============================================================

  async function getActiveRule(currentHost) {
    let rules;
    try {
      const got = await chrome.storage.local.get(["rules"]);
      rules = Array.isArray(got.rules) ? got.rules : [];
    } catch {
      return null;
    }
    for (const r of rules) {
      if (!isUsableRule(r)) continue;
      if (hostMatches(currentHost, r.host)) return r;
    }
    return null;
  }

  // 暗号学的乱数で確率抽選する。`Math.random()` でも isolated world では
  // page から書き換えられないが、defense-in-depth として強い乱数源に統一。
  function probabilityRoll(percent) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] / 0x100000000) * 100 < percent;
  }

  function startTimers(rule) {
    // バックグラウンドタブで setTimeout が大幅に遅延するため、
    // ページロード時刻を Date.now() で記録し、定期チェックで経過秒を見る。
    const startedAt = Date.now();
    let fired = false;
    let interval = null;

    const requestRedirect = () => {
      if (fired) return;
      fired = true;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      try {
        chrome.runtime
          .sendMessage({
            type: "REDIRECT_REQUEST",
            ruleId: rule.id,
            redirectUrl: rule.redirectUrl,
          })
          .catch(() => {});
      } catch {}
    };

    const pending = rule.timers
      .filter((t) => t && typeof t === "object")
      .map((t) => ({
        seconds: clampSeconds(t.seconds),
        probability: clampProbability(t.probability),
        rolled: false,
      }))
      .filter((t) => t.probability > 0);

    if (pending.length === 0) return;

    const tick = () => {
      if (fired) return;
      const elapsed = (Date.now() - startedAt) / 1000;
      let allDone = true;
      for (const t of pending) {
        if (t.rolled) continue;
        if (elapsed >= t.seconds) {
          t.rolled = true;
          if (probabilityRoll(t.probability)) {
            requestRedirect();
            return;
          }
        } else {
          allDone = false;
        }
      }
      if (allDone && interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    interval = setInterval(tick, 1000);
    // 初回チェック（0 秒タイマー対応）
    tick();
  }

  // タイマーは「ページロード起点で 1 度だけ起動」。
  // SPA 内遷移では既存の interval が動き続けるため自然に「継続」になる。
  // ?detox 付きで到達したページ（= 直前のリダイレクト先）ではタイマーを
  // 起動しない。A→B / B→A ルールでの相互ループを防ぐため。
  if (!detoxState.timerStarted && !arrivedViaDetox) {
    const rule = await getActiveRule(location.hostname);
    if (rule && !wouldLoop(rule)) {
      detoxState.timerStarted = true;
      startTimers(rule);
    }
  }
})();
