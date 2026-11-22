/**
 * Nút "Lưu vào QuizKard" render bên trong shadow root: 3 state (idle / saving /
 * saved). Logo QK nhúng inline SVG nên không phụ thuộc `web_accessible_resources`
 * hay URL `chrome-extension://` (tránh tuyệt đối lỗi cross-origin trên host page).
 * Toàn bộ style nằm trong shadow root, không đụng CSS của host page.
 */

/** Trạng thái nút: idle (bấm được), saving (chờ response), saved (đã lưu). */
export type CaptureButtonState = "idle" | "saving" | "saved";

const LABEL_IDLE = "Lưu";
const LABEL_SAVED = "Đã lưu";
/** Chưa đăng nhập: nhãn ngắn gọn mời liên kết với QuizKard Web (spec/62). */
const LABEL_LINK = "Đăng nhập";
const LABEL_RELINK = "Kết nối lại";

const TITLE_DEFAULT = "Lưu vào QuizKard (kéo lên/xuống để đổi vị trí)";
const TOOLTIP_TOO_LONG = "Chỉ hỗ trợ video ngắn tối đa 3 phút";

/** Logo vector QK từ braintot-web/public/logo-qk.svg — render sắc nét mọi độ phân giải. */
const QK_LOGO_SVG = `<svg class="braintot-button__icon" xmlns="http://www.w3.org/2000/svg" viewBox="2 4 234 120" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="qkBtnMain" x1="8" y1="112" x2="232" y2="12" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#4338EC" />
      <stop offset="48%" stop-color="#3050FF" />
      <stop offset="100%" stop-color="#1982FF" />
    </linearGradient>
    <linearGradient id="qkBtnTail" x1="94" y1="88" x2="132" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0EA5FF" />
      <stop offset="100%" stop-color="#38CCFF" />
    </linearGradient>
    <linearGradient id="qkBtnFold" x1="88" y1="83" x2="115" y2="110" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#42DCFF" />
      <stop offset="100%" stop-color="#18B4FF" />
    </linearGradient>
  </defs>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M62 8C30.52 8 5 33.07 5 64C5 94.93 30.52 120 62 120C93.48 120 119 94.93 119 64C119 33.07 93.48 8 62 8ZM62 35C78.57 35 92 47.98 92 64C92 80.02 78.57 93 62 93C45.43 93 32 80.02 32 64C32 47.98 45.43 35 62 35Z" fill="url(#qkBtnMain)" />
  <path d="M85 88Q85 84.5 89 83.5V110Q86.2 111.2 85.4 108.5Z" fill="#1E2F9E" opacity="0.3" />
  <path d="M91.5 103L109.5 85L112 88L129.6 114.8Q133 120 126.8 120H110.2Q105.5 120 102.5 116.2L91.5 103Z" fill="url(#qkBtnTail)" />
  <path d="M89 89Q89 83 95 83H111Q115.5 83 112.4 86.3L92.1 107.7Q89 111 89 106.5V89Z" fill="url(#qkBtnFold)" />
  <path d="M137 15Q137 8 144 8H158Q165 8 165 15V38.2Q165 42 162.8 45.1L140.4 77.1Q137 82 137 76V15Z" fill="url(#qkBtnMain)" />
  <path d="M137 99Q137 94 139.9 89.9L193.6 12.9Q197 8 203 8H224.5Q231.5 8 227.1 13.4L186.5 62.7Q183 67 186.7 71L227.4 115Q232 120 225.2 120H202.2Q197 120 193.7 116L168.1 84.8Q165 81 165 85.8V113Q165 120 158 120H144Q137 120 137 113V99Z" fill="url(#qkBtnMain)" />
</svg>`;

export const BUTTON_STYLE = `
  .braintot-dock-clip {
    position: relative;
    overflow: visible;
    padding: 10px 0 14px 24px;
    margin: -10px 0 -14px 0;
    pointer-events: none;
  }
  .braintot-button {
    position: relative;
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 84px;
    height: 44px;
    padding: 0 16px 0 10px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-right: none;
    border-radius: 9999px 0 0 9999px;
    background-color: #2563EB;
    color: #ffffff;
    font: 700 13.5px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    letter-spacing: -0.01em;
    box-shadow: -3px 6px 18px rgba(37, 99, 235, 0.3), 0 2px 6px rgba(15, 23, 42, 0.14);
    opacity: 0.9;
    cursor: pointer;
    user-select: none;
    touch-action: none;
    will-change: transform, opacity;
    /* Luôn hiện đủ [QK] Lưu để bấm 1 click ngay; hover chỉ nhích nhẹ 4px. */
    transform: translateX(4px);
    transition:
      transform 0.18s ease,
      opacity 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s ease;
  }
  .braintot-button:hover:not(:disabled),
  .braintot-button:focus-visible {
    transform: translateX(0);
    opacity: 1;
    background-color: #1D4ED8;
    box-shadow: -4px 8px 22px rgba(37, 99, 235, 0.4), 0 3px 8px rgba(15, 23, 42, 0.16);
  }
  .braintot-button:active:not(:disabled) {
    transform: translateX(1px);
  }
  .braintot-button[data-dragging="true"] {
    cursor: grabbing;
    opacity: 1;
    transition: none;
  }
  .braintot-button:focus-visible {
    outline: 2px solid #2563EB;
    outline-offset: 2px;
  }
  .braintot-button:disabled {
    cursor: default;
  }
  .braintot-button[data-state="saving"] {
    transform: translateX(0);
    opacity: 0.95;
  }
  .braintot-button[data-state="saved"] {
    transform: translateX(0);
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.24);
    background-color: #0F8A5F;
    color: #ffffff;
    box-shadow: -4px 6px 16px rgba(15, 138, 95, 0.32);
  }
  .braintot-button[data-too-long="true"] {
    transform: translateX(4px);
    opacity: 0.72;
    border-color: rgba(255, 255, 255, 0.2);
    background-color: #64748B;
    color: #E2E8F0;
    box-shadow: -2px 4px 12px rgba(15, 23, 42, 0.16);
    cursor: not-allowed;
  }
  .braintot-button[data-too-long="true"]:hover,
  .braintot-button[data-too-long="true"]:focus-visible {
    transform: translateX(4px);
    opacity: 0.86;
    background-color: #64748B;
    box-shadow: -2px 4px 12px rgba(15, 23, 42, 0.16);
  }
  .braintot-button[data-too-long="true"]::before {
    content: attr(data-tooltip);
    position: absolute;
    right: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%) translateX(4px);
    padding: 6px 10px;
    border-radius: 8px;
    background: #0F1F42;
    color: #ffffff;
    font: 500 12px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    white-space: nowrap;
    box-shadow: 0 6px 16px rgba(15, 31, 66, 0.24);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }
  .braintot-button[data-too-long="true"]:hover::before,
  .braintot-button[data-too-long="true"]:focus-visible::before {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
  .braintot-button__icon-wrap {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 9999px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
    flex-shrink: 0;
  }
  .braintot-button__icon {
    display: block;
    width: 18px;
    height: 18px;
    object-fit: contain;
    pointer-events: none;
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
  /** Khóa nút nhưng vẫn hiển thị khi video vượt quá giới hạn 3 phút. */
  setTooLong(tooLong: boolean): void;
  /** Bỏ qua sự kiện click kế tiếp (dùng ngay sau khi người dùng vừa kéo thả dọc mép màn hình). */
  suppressNextClick(): void;
}

export function createCaptureButton(onClick: () => void): CaptureButton {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "braintot-button";
  element.title = TITLE_DEFAULT;

  const iconWrap = document.createElement("span");
  iconWrap.className = "braintot-button__icon-wrap";
  iconWrap.innerHTML = QK_LOGO_SVG;

  const label = document.createElement("span");
  label.className = "braintot-button__label";

  element.append(iconWrap, label);

  let state: CaptureButtonState = "idle";
  let linkStatus: "linked" | "expired" | "unlinked" = "linked";
  let tooLong = false;
  let skipNextClick = false;
  element.addEventListener("click", () => {
    if (skipNextClick) {
      skipNextClick = false;
      return;
    }
    if (state === "idle" && !tooLong) onClick();
  });

  const render = () => {
    element.dataset.state = state;
    if (tooLong) {
      element.dataset.tooLong = "true";
      element.dataset.tooltip = TOOLTIP_TOO_LONG;
      element.setAttribute("aria-disabled", "true");
      element.title = "";
      label.textContent = LABEL_IDLE;
      element.disabled = false;
      return;
    }
    delete element.dataset.tooLong;
    delete element.dataset.tooltip;
    element.removeAttribute("aria-disabled");
    element.title = TITLE_DEFAULT;
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
    setTooLong(next) {
      if (next === tooLong) return;
      tooLong = next;
      render();
    },
    suppressNextClick() {
      skipNextClick = true;
    },
  };
}
