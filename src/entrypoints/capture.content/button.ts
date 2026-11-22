/**
 * Nút "Lưu vào QuizKard" render bên trong shadow root: 3 state (idle / saving /
 * saved). Logo QK nhúng inline SVG nên không phụ thuộc `web_accessible_resources`
 * hay URL `chrome-extension://` (tránh tuyệt đối lỗi cross-origin trên host page).
 * Toàn bộ style nằm trong shadow root, không đụng CSS của host page.
 */

/** Trạng thái nút: idle (bấm được), saving (chờ response), saved (đã lưu). */
export type CaptureButtonState = "idle" | "saving" | "saved";

const LABEL_IDLE = "Lưu vào QuizKard";
const LABEL_SAVED = "Đã lưu link";
/** Chưa đăng nhập: nút đổi thành lời mời liên kết/đồng bộ với QuizKard Web (spec/62). */
const LABEL_LINK = "Đồng bộ với QuizKard Web";
const LABEL_RELINK = "Liên kết lại QuizKard Web";

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
    overflow: hidden;
    padding: 10px 0 14px 24px;
    margin: -10px 0 -14px 0;
    pointer-events: none;
  }
  .braintot-button {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 14px 0 9px;
    border: 1px solid #DCE8F8;
    border-right: none;
    border-radius: 9999px 0 0 9999px;
    background-color: #ffffff;
    color: #12264F;
    font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    letter-spacing: -0.01em;
    box-shadow: -2px 4px 12px rgba(15, 23, 42, 0.14);
    cursor: pointer;
    user-select: none;
    touch-action: none;
    will-change: transform;
    /* Trượt bằng GPU transform: chỉ lòi đúng 42px phần logo QK sát mép phải. */
    transform: translateX(calc(100% - 42px));
    transition:
      transform 0.36s cubic-bezier(0.25, 0.8, 0.25, 1),
      background-color 0.28s ease,
      border-color 0.28s ease,
      color 0.28s ease,
      box-shadow 0.28s ease;
  }
  .braintot-button:hover,
  .braintot-button:focus-visible,
  .braintot-button[data-state="saving"],
  .braintot-button[data-state="saved"] {
    transform: translateX(0);
    border-color: rgba(255, 255, 255, 0.22);
    background-color: #2563EB;
    color: #ffffff;
    box-shadow: -4px 8px 20px rgba(37, 99, 235, 0.32);
  }
  .braintot-button[data-dragging="true"] {
    cursor: grabbing;
  }
  .braintot-button:focus-visible {
    outline: 2px solid #2563EB;
    outline-offset: 2px;
  }
  .braintot-button:disabled {
    cursor: default;
  }
  .braintot-button[data-state="saved"] {
    border-color: rgba(255, 255, 255, 0.22);
    background-color: #0F8A5F;
    color: #ffffff;
    box-shadow: -4px 6px 16px rgba(15, 138, 95, 0.28);
  }
  .braintot-button__icon-wrap {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    background: #ffffff;
    flex-shrink: 0;
    transition: box-shadow 0.25s ease;
  }
  .braintot-button:hover .braintot-button__icon-wrap,
  .braintot-button[data-state="saved"] .braintot-button__icon-wrap {
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
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
    opacity: 0;
    transition: opacity 0.26s ease;
  }
  .braintot-button:hover .braintot-button__label,
  .braintot-button:focus-visible .braintot-button__label,
  .braintot-button[data-state="saving"] .braintot-button__label,
  .braintot-button[data-state="saved"] .braintot-button__label {
    opacity: 1;
  }
`;

export interface CaptureButton {
  readonly element: HTMLButtonElement;
  getState(): CaptureButtonState;
  setState(state: CaptureButtonState): void;
  /** Cập nhật nhãn theo trạng thái liên kết tài khoản web. */
  setLinkStatus(status: "linked" | "expired" | "unlinked"): void;
  /** Bỏ qua sự kiện click kế tiếp (dùng ngay sau khi người dùng vừa kéo thả dọc mép màn hình). */
  suppressNextClick(): void;
}

export function createCaptureButton(onClick: () => void): CaptureButton {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "braintot-button";
  element.title = "Lưu vào QuizKard (kéo lên/xuống để đổi vị trí)";

  const iconWrap = document.createElement("span");
  iconWrap.className = "braintot-button__icon-wrap";
  iconWrap.innerHTML = QK_LOGO_SVG;

  const label = document.createElement("span");
  label.className = "braintot-button__label";

  element.append(iconWrap, label);

  let state: CaptureButtonState = "idle";
  let linkStatus: "linked" | "expired" | "unlinked" = "linked";
  let skipNextClick = false;
  element.addEventListener("click", () => {
    if (skipNextClick) {
      skipNextClick = false;
      return;
    }
    if (state === "idle") onClick();
  });

  const render = () => {
    element.dataset.state = state;
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
    suppressNextClick() {
      skipNextClick = true;
    },
  };
}
