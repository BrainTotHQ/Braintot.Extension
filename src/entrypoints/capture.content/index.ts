/**
 * Content script "capture": gắn nút Lưu vào BrainTot trên các trang video ngắn
 * (YouTube Shorts, TikTok, Facebook Reels) qua shadow root cô lập, tự
 * mount/unmount khi SPA điều hướng (3 cơ chế: yt-navigate-finish,
 * MutationObserver trên title, poll 1s), và gửi CaptureSaveRequest về
 * background khi bấm.
 */

import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

import { buildCapturePayload } from "../../lib/capture-payload";
import type { CaptureSaveResponse } from "../../lib/messages";

import { BUTTON_STYLE, createCaptureButton, type CaptureButton } from "./button";
import { TOAST_STYLE, createCaptureToast, type CaptureToast } from "./toast";

const HOST_ID = "braintot-capture-root";
const SOURCE = "content-button" as const;

// Copy verbatim — không chỉnh từng ký tự.
const TOAST_SAVED = "✓ Đã lưu link — mở BrainTot để xem hàng đợi";
const TOAST_INVALID = "Link chưa đúng — chỉ nhận Reels, TikTok, YouTube Shorts";
const TOAST_ERROR = "Có lỗi khi lưu — thử lại";

const HOST_STYLE = {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  zIndex: "2147483647",
  // Container không nuốt click; riêng nút bật lại qua .braintot-button.
  pointerEvents: "none",
} as const;

export default defineContentScript({
  matches: ["*://*.youtube.com/*", "*://*.tiktok.com/*", "*://*.facebook.com/*"],
  main(ctx) {
    const button: CaptureButton = createCaptureButton(() => void saveCurrentPage());
    const toast: CaptureToast = createCaptureToast();

    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let mounted = false;
    let lastHref: string | null = null;
    let saveInFlight = false;

    /** Tạo (hoặc tạo lại nếu host page đã gỡ) host div + shadow root. */
    function ensureShadowRoot(): ShadowRoot {
      if (shadow && host?.isConnected) return shadow;

      host?.remove();
      host = document.createElement("div");
      host.id = HOST_ID;
      Object.assign(host.style, HOST_STYLE);
      shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = BUTTON_STYLE + TOAST_STYLE;
      shadow.append(style, toast.element);

      (document.body ?? document.documentElement).append(host);
      return shadow;
    }

    function mount(): void {
      ensureShadowRoot().append(button.element);
      // Mỗi URL video là một video mới — luôn reset về idle.
      button.setState("idle");
      mounted = true;
    }

    function unmount(): void {
      if (!mounted) return;
      mounted = false;
      button.element.remove();
      toast.clear();
    }

    /**
     * Re-evaluate theo URL hiện tại — idempotent, chỉ đụng DOM khi trạng thái
     * thực sự đổi (poll 1s + mutation bắn dồn dập thì skip ngay).
     */
    function evaluate(): void {
      const href = location.href;
      const isShort = buildCapturePayload(href, SOURCE) !== null;
      if (href === lastHref && isShort === mounted) return;
      lastHref = href;

      if (isShort) mount();
      else unmount();
    }

    /** Click flow: build payload → sendMessage → toast theo mọi nhánh response. */
    async function saveCurrentPage(): Promise<void> {
      if (saveInFlight || button.getState() === "saved") return;

      const request = buildCapturePayload(location.href, SOURCE);
      if (!request) {
        // Trang đổi URL giữa chừng (đã rời video ngắn trước khi bấm).
        toast.show(TOAST_INVALID);
        return;
      }

      saveInFlight = true;
      button.setState("saving");
      try {
        const response = (await browser.runtime.sendMessage(request)) as
          | CaptureSaveResponse
          | undefined;

        if (response?.ok) {
          // saved:true (vừa lưu) và saved:false (đã lưu trước đó) — v1 hiện
          // cùng một trạng thái + toast, không phân biệt nội dung.
          button.setState("saved");
          toast.show(TOAST_SAVED);
        } else if (response && !response.ok && response.reason === "invalid-url") {
          button.setState("idle");
          toast.show(TOAST_INVALID);
        } else {
          // storage-error, hoặc response méo hình/không có listener.
          button.setState("idle");
          toast.show(TOAST_ERROR);
        }
      } catch {
        // Send fail (ví dụ background chưa đăng ký listener / context invalidated).
        button.setState("idle");
        toast.show(TOAST_ERROR);
      } finally {
        saveInFlight = false;
      }
    }

    // --- SPA watcher (3 cơ chế) -------------------------------------------
    // 1) YouTube bắn yt-navigate-finish sau mỗi điều hướng trong app.
    document.addEventListener("yt-navigate-finish", evaluate);

    // 2) TikTok/Facebook đổi document.title khi điều hướng — quan sát chính
    //    phần tử <title> (kèm head để bắt lúc <title> bị thay thế).
    const titleObserver = new MutationObserver(() => {
      watchTitle();
      evaluate();
    });
    function watchTitle(): void {
      const head = document.head;
      if (!head) return;
      titleObserver.observe(head, { childList: true });
      const title = head.querySelector("title");
      if (title) {
        titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
      }
    }
    watchTitle();

    // 3) Poll 1s phủ mọi trường hợp còn lại (pushState không bắn event nào).
    ctx.setInterval(evaluate, 1_000);

    // Cleanup khi context invalidated (extension reload/update) — không leak.
    ctx.onInvalidated(() => {
      document.removeEventListener("yt-navigate-finish", evaluate);
      titleObserver.disconnect();
      unmount();
      host?.remove();
      host = null;
      shadow = null;
    });

    evaluate();
  },
});
