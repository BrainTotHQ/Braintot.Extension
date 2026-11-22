/**
 * Content script chạy trên web BrainTot (spec/62): đọc session web (`localStorage["braintot.session"]`)
 * và báo về background mỗi khi nó đổi, để extension tự liên kết/gia hạn mà không cần bấm nút.
 * Token không được log ra console.
 */

import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

import { MSG_WEB_SESSION } from "../lib/messages";
import { readWebSession } from "../lib/web-session";

const POLL_MS = 5_000;

export default defineContentScript({
  matches: ["https://braintot.tonythaniel.com/*"],
  main() {
    let lastRaw: string | null = null;
    const push = (): void => {
      const found = readWebSession(window.localStorage);
      if (!found || found.raw === lastRaw) return;
      lastRaw = found.raw;
      void browser.runtime
        .sendMessage({ type: MSG_WEB_SESSION, session: found.session })
        .catch(() => {
          lastRaw = null; // background chưa sẵn sàng: thử lại ở nhịp sau.
        });
    };
    push();
    window.addEventListener("storage", push);
    document.addEventListener("visibilitychange", push);
    window.setInterval(push, POLL_MS);
  },
});
