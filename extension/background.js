// Service Worker: ナビゲーションを監視して content script を inject、
// content からのリダイレクト要求を受けて新規タブで遷移先を開き、元タブを閉じる。
//
// importScripts() を使う非モジュール SW として動作する。
// MV3 のベストプラクティス（リスナー登録は top-level 同期）を厳守するため、
// import の解決待ちが発生する ESM SW を避けている。
//
// SECURITY: importScripts の引数は必ず拡張パッケージ内の相対パス固定とすること。
// ユーザー設定や remote URL 由来の文字列を渡すと MV3 の CSP（script-src 'self'）
// 違反かつ remote code execution の入口になる。
importScripts("lib/host.js", "lib/rules.js");

// content script の inject 順: lib/host.js → lib/rules.js → content.js
// content.js は前 2 ファイルが定義するグローバル関数（hostMatches, isUsableRule
// 等）を参照する。
const CONTENT_SCRIPT_FILES = ["lib/host.js", "lib/rules.js", "content.js"];

// バナー認可の有効期限（ミリ秒）。リダイレクト発火から遷移先 content の
// CLAIM_BANNER 到達までの猶予。30 秒で十分余裕。
const BANNER_TTL_MS = 30 * 1000;

// ============================================================
// 初期化
// ============================================================

chrome.runtime.onInstalled.addListener(async () => {
  await initializeIfEmpty();
  await migrateStorageOnce();
});

// 起動毎に 1 度だけマイグレーション。`onInstalled` を逃した既存ストアの
// 不正 id（過去の DevTools 直編集や別端末同期由来）を訂正するため。
chrome.runtime.onStartup.addListener(async () => {
  await migrateStorageOnce();
});

// ============================================================
// ナビゲーション監視: 全タブに content script を inject
// ============================================================
//
// content.js は2役を兼ねる:
//   (a) 対象ドメインならタイマーを起動
//   (b) URLに ?detox があり、かつ background が事前に発行した認可が
//       存在する場合のみバナーを表示
// (b) はリダイレクト先（ルール対象外）でも発火する必要があるため、
// 全 http(s) タブに inject して content 側で必要なら無視する形にする。

chrome.webNavigation.onCommitted.addListener(handleNavigation);
// SPA の history.pushState / replaceState による URL 変更も検知して再 inject。
// content.js 側はバナー処理とタイマー起動をそれぞれ別フラグで冪等化する。
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

async function handleNavigation(details) {
  if (details.frameId !== 0) return;
  if (!isHttpUrl(details.url)) return;
  await injectContentScript(details.tabId);
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: CONTENT_SCRIPT_FILES,
      injectImmediately: true,
    });
  } catch (err) {
    // 呼び出し側で isHttpUrl により chrome:// 等は事前に弾いているため、
    // 通常はここに到達しない。到達した場合は診断のため err を残す。
    console.warn("[detox] inject failed:", err);
  }
}

// ============================================================
// メッセージハンドラ
// ============================================================
//
// 受け付けるメッセージ:
//   - REDIRECT_REQUEST: タイマー当選時、content から SW へ送信。
//     ruleId と redirectUrl を含み、SW 側で sender.url からホスト判定
//     と一致確認を行ったうえでリダイレクトを実行する。
//   - CLAIM_BANNER: ?detox 付き URL を読んだ content から SW へ送信。
//     直前のリダイレクトで発行された認可の有無を返す。

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  // 同一拡張内のメインフレーム由来のみ受け付ける
  if (sender.id !== chrome.runtime.id) return;
  if (!sender.tab?.id || sender.frameId !== 0) return;

  if (msg.type === "REDIRECT_REQUEST") {
    handleRedirectRequest(sender, msg)
      .then((ok) => sendResponse({ ok }))
      .catch((err) => {
        console.warn("[detox] redirect failed:", err);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (msg.type === "CLAIM_BANNER") {
    claimBanner(sender.tab.id)
      .then((show) => sendResponse({ show }))
      .catch(() => sendResponse({ show: false }));
    return true;
  }
});

async function handleRedirectRequest(sender, msg) {
  const redirectUrl = String(msg.redirectUrl || "");
  const ruleId = String(msg.ruleId || "");
  if (!redirectUrl || !ruleId) return false;
  if (!isHttpUrl(redirectUrl)) return false;

  // sender.url は Chrome がメッセージ送信時点の URL を保証する信頼源。
  // sender.tab.url は受信処理中に書き換わり得る（TOCTOU）。
  const senderHost = (() => {
    try {
      return new URL(sender.url || "").hostname;
    } catch {
      return "";
    }
  })();
  if (!senderHost) return false;

  const rules = await loadRules();
  const rule = rules.find((r) => r && r.id === ruleId);
  if (!rule || !isUsableRule(rule)) return false;
  if (rule.redirectUrl !== redirectUrl) return false;
  if (!hostMatches(senderHost, rule.host)) return false;
  if (wouldLoop(rule)) return false;

  await openInNewTabAndClose(sender.tab, appendDetoxQuery(redirectUrl));
  return true;
}

async function openInNewTabAndClose(originTab, url) {
  try {
    const created = await chrome.tabs.create({
      url,
      windowId: originTab.windowId,
      index: originTab.index + 1,
      active: true,
      pinned: !!originTab.pinned,
    });
    // バナー表示認可をセッションストレージに記録。
    // 任意のサイトに ?detox を付けただけではバナーが出ないようにする。
    await recordPendingBanner(created.id);
    // 元タブが Tab Group に属していたら新タブも同グループに入れる。
    if (originTab.groupId && originTab.groupId !== -1 && chrome.tabs.group) {
      try {
        await chrome.tabs.group({
          tabIds: [created.id],
          groupId: originTab.groupId,
        });
      } catch {}
    }
    await chrome.tabs.remove(originTab.id);
  } catch {
    // フォールバック: 新規タブが作れなかった場合は同タブで遷移
    try {
      await recordPendingBanner(originTab.id);
      await chrome.tabs.update(originTab.id, { url });
    } catch {}
  }
}

// ============================================================
// バナー認可（chrome.storage.session）
// ============================================================

async function recordPendingBanner(tabId) {
  const { pendingBanners = {} } = await chrome.storage.session.get("pendingBanners");
  // GC: 期限切れエントリを掃除
  const now = Date.now();
  for (const [k, v] of Object.entries(pendingBanners)) {
    if (!v || v.expiresAt < now) delete pendingBanners[k];
  }
  pendingBanners[tabId] = { expiresAt: now + BANNER_TTL_MS };
  await chrome.storage.session.set({ pendingBanners });
}

async function claimBanner(tabId) {
  const { pendingBanners = {} } = await chrome.storage.session.get("pendingBanners");
  const entry = pendingBanners[tabId];
  if (!entry) return false;
  delete pendingBanners[tabId];
  await chrome.storage.session.set({ pendingBanners });
  return entry.expiresAt >= Date.now();
}
