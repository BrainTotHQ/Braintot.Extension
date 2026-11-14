/**
 * Nút "Lưu vào BrainTot" render bên trong shadow root: 3 state (idle / saving /
 * saved). Icon mascot lấy qua runtime.getURL("/mascot/logo-mark.png") — asset
 * chỉ được copy ở E5, nên img bắt `error` để tự ẩn khi 404 (nút vẫn hiện text).
 * Toàn bộ style nằm trong shadow root, không đụng CSS của host page.
 */

import { browser } from "wxt/browser";

/** Trạng thái nút: idle (bấm được), saving (chờ response), saved (đã lưu). */
export type CaptureButtonState = "idle" | "saving" | "saved";

const LABEL_IDLE = "Lưu vào BrainTot";
const LABEL_SAVED = "✓ Đã lưu link";
/** Chưa đăng nhập: nút đổi thành lời mời liên kết/đồng bộ với BrainTot Web (spec/62). */
const LABEL_LINK = "Đồng bộ với BrainTot Web";
const LABEL_RELINK = "Liên kết lại BrainTot Web";

/** Icon mascot trong public/ — được copy sang extension ở E5 Step 0. */
const MASCOT_ICON_PATH = "/mascot/logo-mark.png";

/**
 * WXT siết getURL theo PublicPath sinh sẵn từ public/ (asset mascot chỉ xuất
 * hiện ở E5, nên path chưa nằm trong union được khai báo). Nới signature về
 * string để giữ đúng path theo thiết kế; onerror phía dưới lo fallback khi 404.
 */
const getExtensionURL = (browser.runtime as unknown as { getURL(path: string): string }).getURL;

export const BUTTON_STYLE = `
  .braintot-button {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border: 1px solid #DCE8F8;
    border-radius: 9999px;
    background: #ffffff;
    color: #12264F;
    font: 500 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 4px 14px rgba(18, 38, 79, 0.16);
    cursor: pointer;
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .braintot-button:hover:not(:disabled) {
    box-shadow: 0 6px 18px rgba(18, 38, 79, 0.24);
    transform: translateY(-1px);
  }
  .braintot-button:disabled {
    cursor: default;
    opacity: 0.75;
  }
  .braintot-button__icon {
    display: block;
    width: 18px;
    height: 18px;
  }
  .braintot-button__label {
    white-space: nowrap;
  }
`;

export interface CaptureButton {
  readonly element: HTMLButtonElement;
  getState(): CaptureButtonState;
  setState(state: CaptureButtonState): void;
  /** Cập nhật nhãn theo trạng thái liên kết tài khoản web. */
  setLinkStatus(status: "linked" | "expired" | "unlinked"): void;
}

export function createCaptureButton(onClick: () => void): CaptureButton {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "braintot-button";

  const icon = document.createElement("img");
  icon.className = "braintot-button__icon";
  icon.alt = "";
  icon.src = getExtensionURL(MASCOT_ICON_PATH);
  icon.addEventListener("error", () => {
    // Asset chưa tồn tại (chưa tới E5) hoặc nạp lỗi → ẩn icon, giữ text.
    icon.remove();
  });

  const label = document.createElement("span");
  label.className = "braintot-button__label";

  element.append(icon, label);

  let state: CaptureButtonState = "idle";
  let linkStatus: "linked" | "expired" | "unlinked" = "linked";
  element.addEventListener("click", () => {
    if (state === "idle") onClick();
  });

  const render = () => {
    label.textContent =
      state === "saved"
        ? LABEL_SAVED
        : linkStatus === "linked"
          ? LABEL_IDLE
          : linkStatus === "expired"
            ? LABEL_RELINK
            : LABEL_LINK;
    // saved: không cho click lại; saving: chặn double-click trong lúc chờ.
    element.disabled = state !== "idle";
  };
  render();

  return {
    element,
    getState: () => state,
    setState(next) {
      state = next;
      render();
    },
    setLinkStatus(next) {
      if (next === linkStatus) return;
      linkStatus = next;
      render();
    },
  };
}
