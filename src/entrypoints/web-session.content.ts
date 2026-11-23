/**
 * Content script chạy trên web BrainTot (spec/62): đọc session web (`localStorage["braintot.session"]`)
 * và báo về background mỗi khi nó đổi (kể cả khi web đăng xuất → gửi `session: null`), để extension
 * tự liên kết, gia hạn hoặc đăng xuất tức thì theo web. Token không được log ra console.
 */

import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

import { MSG_WEB_SESSION } from "../lib/messages";
import { readWebSession, WEB_SESSION_CHANGED_EVENT } from "../lib/web-session";

const POLL_MS = 5_000;

export default defineContentScript({
  matches: ["https://braintot.tonythaniel.com/*"],
  main() {
    // `undefined` = chưa đồng bộ lần nào (kể cả lúc tab mở ra đã đăng xuất vẫn báo 1 lần).
    let lastRaw: string | null | undefined = undefined;
    const push = (): void => {
      const found = readWebSession(window.localStorage);
      const nextRaw = found ? found.raw : null;
      if (nextRaw === lastRaw) return;
      lastRaw = nextRaw;
      void browser.runtime
        .sendMessage({ type: MSG_WEB_SESSION, session: found ? found.session : null })
        .catch(() => {
          lastRaw = undefined; // background chưa sẵn sàng: thử lại ở nhịp sau.
        });
    };
    push();
    window.addEventListener(WEB_SESSION_CHANGED_EVENT, push);
    window.addEventListener("storage", push);
    document.addEventListener("visibilitychange", push);
    window.setInterval(push, POLL_MS);
  },
});
