/**
 * Toast thông báo trong shadow root: hiện phía trên nút Lưu, tự ẩn sau 3s,
 * `pointer-events: none` nên không bao giờ chặn click của host page.
 * v1 chỉ text (kèm ✓ trong copy), không dùng mascot.
 */

const TOAST_VISIBLE_CLASS = "braintot-toast--visible";
const TOAST_DURATION_MS = 3_000;

export const TOAST_STYLE = `
  .braintot-toast {
    pointer-events: none;
    display: none;
    margin: 0 0 8px auto;
    max-width: 280px;
    padding: 8px 14px;
    border-radius: 12px;
    background: #12264F;
    color: #ffffff;
    font: 500 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 4px 14px rgba(18, 38, 79, 0.28);
    text-align: left;
  }
  .braintot-toast--visible {
    display: block;
  }
`;

export interface CaptureToast {
  readonly element: HTMLDivElement;
  /** Hiện message và hẹn giờ tự ẩn sau 3s (bỏ hẹn giờ cũ nếu chưa kịp ẩn). */
  show(message: string): void;
  /** Ẩn ngay và hủy hẹn giờ — dùng khi unmount khỏi trang. */
  clear(): void;
}

export function createCaptureToast(): CaptureToast {
  const element = document.createElement("div");
  element.className = "braintot-toast";
  element.setAttribute("role", "status");

  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    element,
    show(message) {
      if (timer !== undefined) clearTimeout(timer);
      element.textContent = message;
      element.classList.add(TOAST_VISIBLE_CLASS);
      timer = setTimeout(() => {
        element.classList.remove(TOAST_VISIBLE_CLASS);
        timer = undefined;
      }, TOAST_DURATION_MS);
    },
    clear() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      element.classList.remove(TOAST_VISIBLE_CLASS);
    },
  };
}
