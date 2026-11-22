/**
 * Content script "capture": gắn nút Lưu vào BrainTot trên các trang video ngắn
 * (YouTube Shorts, TikTok, Facebook Reels) qua shadow root cô lập, tự
 * mount/unmount khi SPA điều hướng (3 cơ chế: yt-navigate-finish,
 * MutationObserver trên title, poll 1s), và gửi CaptureSaveRequest về
 * background khi bấm.
 */

import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";

import { getLinkStatus, initBackendAuth, reloadAuth } from "../../lib/backend-auth";
import { buildCapturePayload } from "../../lib/capture-payload";
import {
  MSG_GET_ACTIVE_URL,
  type ActiveUrlResponse,
  type CaptureSaveResponse,
} from "../../lib/messages";

import {
  isDurationTooLong,
  resolveActiveCaptureUrl,
  resolveActiveVideoDurationSec,
} from "./active-url";
import { BUTTON_STYLE, createCaptureButton, type CaptureButton } from "./button";
import { TOAST_STYLE, createCaptureToast, type CaptureToast } from "./toast";

const HOST_ID = "braintot-capture-root";
const SOURCE = "content-button" as const;
const DOCK_Y_STORAGE_KEY = "braintot:dock-y-ratio";
const DEFAULT_DOCK_Y_RATIO = 0.34;
const DOCK_MIN_TOP = 64;
const DOCK_BOTTOM_MARGIN = 64;
const DRAG_THRESHOLD_PX = 5;

// Copy verbatim — không chỉnh từng ký tự.
const TOAST_SAVED = "Đã lưu link — mở QuizKard để xem hàng đợi";
const TOAST_INVALID = "Link chưa đúng — chỉ nhận Reels, TikTok, YouTube Shorts";
const TOAST_ERROR = "Có lỗi khi lưu — thử lại";
const TOAST_LOGIN = "Hãy đăng nhập QuizKard để lưu video — đã mở trang liên kết";

function clampDockTop(px: number): number {
  const maxTop = Math.max(DOCK_MIN_TOP, window.innerHeight - DOCK_BOTTOM_MARGIN);
  return Math.min(maxTop, Math.max(DOCK_MIN_TOP, Math.round(px)));
}

function topFromRatio(ratio: number): number {
  const safeRatio = Number.isFinite(ratio) ? Math.min(0.95, Math.max(0.05, ratio)) : DEFAULT_DOCK_Y_RATIO;
  return clampDockTop(window.innerHeight * safeRatio);
}

/** Tab dính mép phải kiểu eJOY: thu gọn chỉ hiện logo QK, hover trượt mở, kéo dọc để chỉnh độ cao. */
const HOST_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  right: "0px",
  zIndex: "2147483647",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "8px",
  // Container không nuốt click; riêng nút bật lại qua .braintot-button.
  pointerEvents: "none",
};

export default defineContentScript({
  matches: ["*://*.youtube.com/*", "*://*.tiktok.com/*", "*://*.facebook.com/*"],
  main(ctx) {
    console.info("[QuizKard] content script ready (capture button)");

    const button: CaptureButton = createCaptureButton(() => void saveCurrentPage());
    const toast: CaptureToast = createCaptureToast();

    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let dockClip: HTMLDivElement | null = null;
    let mounted = false;
    let lastTargetUrl: string | null = null;
    let saveInFlight = false;
    let dockRatio = DEFAULT_DOCK_Y_RATIO;

    function applyDockPosition(topPx: number): void {
      if (!host) return;
      host.style.top = `${clampDockTop(topPx)}px`;
    }

    // Nạp độ cao người dùng đã kéo lần trước (nếu có).
    void browser.storage.local
      .get(DOCK_Y_STORAGE_KEY)
      .then((bag) => {
        const stored = bag[DOCK_Y_STORAGE_KEY];
        if (typeof stored === "number" && Number.isFinite(stored)) {
          dockRatio = stored;
          applyDockPosition(topFromRatio(dockRatio));
        }
      })
      .catch(() => {
        /* giữ vị trí mặc định */
      });

    // Kéo thả dọc theo mép phải màn hình (chỉ cần kéo ≥ 5px là chuyển sang kéo thay vì bấm lưu).
    let dragStartY = 0;
    let dragStartTop = 0;
    let dragging = false;
    let pointerActive = false;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !host) return;
      pointerActive = true;
      dragging = false;
      dragStartY = event.clientY;
      dragStartTop = host.getBoundingClientRect().top;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!pointerActive || !host) return;
      const deltaY = event.clientY - dragStartY;
      if (!dragging && Math.abs(deltaY) < DRAG_THRESHOLD_PX) return;
      if (!dragging) {
        dragging = true;
        button.element.dataset.dragging = "true";
      }
      applyDockPosition(dragStartTop + deltaY);
    };

    const onPointerUp = (): void => {
      if (!pointerActive) return;
      pointerActive = false;
      if (dragging && host) {
        dragging = false;
        delete button.element.dataset.dragging;
        button.suppressNextClick();
        const currentTop = host.getBoundingClientRect().top;
        dockRatio = window.innerHeight > 0 ? currentTop / window.innerHeight : DEFAULT_DOCK_Y_RATIO;
        void browser.storage.local.set({ [DOCK_Y_STORAGE_KEY]: dockRatio }).catch(() => {
          /* không lưu được vị trí vẫn giữ vị trí hiện tại */
        });
      }
    };

    button.element.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const onResize = (): void => {
      applyDockPosition(topFromRatio(dockRatio));
    };
    window.addEventListener("resize", onResize);

    /** Tạo (hoặc tạo lại nếu host page đã gỡ) host div + shadow root. */
    function ensureShadowRoot(): ShadowRoot {
      if (shadow && host?.isConnected && dockClip) return shadow;

      host?.remove();
      host = document.createElement("div");
      host.id = HOST_ID;
      Object.assign(host.style, HOST_STYLE);
      applyDockPosition(topFromRatio(dockRatio));
      shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = BUTTON_STYLE + TOAST_STYLE;
      dockClip = document.createElement("div");
      dockClip.className = "braintot-dock-clip";
      shadow.append(style, dockClip, toast.element);

      (document.body ?? document.documentElement).append(host);
      return shadow;
    }

    function mount(): void {
      ensureShadowRoot();
      dockClip?.append(button.element);
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
     * Re-evaluate theo URL hiện tại (kể cả video đang phát trên TikTok For You feed) —
     * idempotent, chỉ đụng DOM khi video hoặc giới hạn thời lượng (> 3 phút) đổi.
     */
    function evaluate(): void {
      // Nhãn nút theo trạng thái liên kết (tính từ phiên đã nạp, rẻ, kể cả khi token vừa hết hạn).
      button.setLinkStatus(getLinkStatus());
      const activeUrl = resolveActiveCaptureUrl(document, location.href);
      const payload = activeUrl ? buildCapturePayload(activeUrl, SOURCE) : null;
      const targetUrl = payload?.url ?? null;
      const durationSec = payload ? resolveActiveVideoDurationSec(document, location.href) : null;
      button.setTooLong(isDurationTooLong(durationSec));

      if (targetUrl === lastTargetUrl && (payload !== null) === mounted) {
        return;
      }
      lastTargetUrl = targetUrl;

      if (payload) {
        mount();
      } else {
        unmount();
      }
    }

    /** Click flow: build payload → sendMessage → toast theo mọi nhánh response. */
    async function saveCurrentPage(): Promise<void> {
      if (saveInFlight || button.getState() === "saved") return;

      const activeUrl = resolveActiveCaptureUrl(document, location.href);
      const request = activeUrl ? buildCapturePayload(activeUrl, SOURCE) : null;
      if (!request) {
        // Trang đổi URL giữa chừng (đã rời video ngắn trước khi bấm).
        toast.show(TOAST_INVALID);
        return;
      }
      const durationSec = resolveActiveVideoDurationSec(document, location.href);
      if (isDurationTooLong(durationSec)) {
        button.setTooLong(true);
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
        } else if (response && !response.ok && response.reason === "not-linked") {
          button.setState("idle");
          toast.show(TOAST_LOGIN);
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

    // Nạp phiên đăng nhập và theo dõi thay đổi (liên kết/đăng xuất xảy ra ở context khác).
    void initBackendAuth().then(evaluate).catch(() => {
      /* noop: nút giữ nhãn mặc định */
    });
    const onStorageChanged = (changes: Record<string, unknown>, area: string): void => {
      if (area !== "local" || !("braintot:auth-session" in changes)) return;
      void reloadAuth().then(evaluate).catch(() => {
        /* noop */
      });
    };
    browser.storage.onChanged.addListener(onStorageChanged);

    const onMessage = (message: unknown): Promise<ActiveUrlResponse> | undefined => {
      if (
        typeof message === "object" &&
        message !== null &&
        (message as { type?: unknown }).type === MSG_GET_ACTIVE_URL
      ) {
        const url = resolveActiveCaptureUrl(document, location.href);
        const durationSec = url ? resolveActiveVideoDurationSec(document, location.href) : null;
        return Promise.resolve({
          url,
          durationSec,
          tooLong: isDurationTooLong(durationSec),
        });
      }
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);

    // --- SPA watcher (5 cơ chế) -------------------------------------------
    // 1) YouTube bắn yt-navigate-finish sau mỗi điều hướng trong app.
    document.addEventListener("yt-navigate-finish", evaluate);

    // 2) Khi thẻ <video> nạp xong thời lượng (loadedmetadata / durationchange) → cập nhật quá 3 phút ngay.
    document.addEventListener("loadedmetadata", evaluate, true);
    document.addEventListener("durationchange", evaluate, true);

    // 2) TikTok For You cuộn sang video mới không đổi URL — bắt scroll có debounce nhẹ.
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (): void => {
      if (scrollTimer !== undefined) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(evaluate, 200);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });

    // 3) TikTok/Facebook đổi document.title khi điều hướng — quan sát chính
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

    // 4) Poll 1s phủ mọi trường hợp còn lại (pushState / autoplay không bắn event nào).
    ctx.setInterval(evaluate, 1_000);

    // Cleanup khi context invalidated (extension reload/update) — không leak.
    ctx.onInvalidated(() => {
      if (scrollTimer !== undefined) clearTimeout(scrollTimer);
      button.element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("yt-navigate-finish", evaluate);
      document.removeEventListener("loadedmetadata", evaluate, true);
      document.removeEventListener("durationchange", evaluate, true);
      window.removeEventListener("scroll", onScroll, { capture: true });
      browser.storage.onChanged.removeListener(onStorageChanged);
      browser.runtime.onMessage.removeListener(onMessage);
      titleObserver.disconnect();
      unmount();
      host?.remove();
      host = null;
      shadow = null;
    });

    evaluate();
  },
});
