/**
 * Toast thông báo trong shadow root: hiện phía dưới nút Lưu, tự ẩn sau 3s,
 * `pointer-events: none` nên không bao giờ chặn click của host page.
 */

const TOAST_VISIBLE_CLASS = "braintot-toast--visible";
const TOAST_DURATION_MS = 3_000;

export const TOAST_STYLE = `
  .braintot-toast {
    pointer-events: none;
    display: none;
    margin: 0 12px 0 0;
    max-width: 260px;
    padding: 8px 13px;
    border-radius: 10px;
    background: #0F1F42;
    color: #ffffff;
    font: 500 12.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 6px 18px rgba(15, 31, 66, 0.24);
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
