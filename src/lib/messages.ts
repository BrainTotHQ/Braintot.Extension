/**
 * Hợp đồng message giữa các entrypoint của extension (content script, popup,
 * background). Tầng contract: chỉ gồm kiểu dữ liệu và tên message — không gọi
 * API browser, messaging là data contract thuần.
 */

import type { PendingLink } from "../domain/pending-link";

/** Tên message yêu cầu background lưu một link video vừa capture. */
export const MSG_CAPTURE_SAVE = "braintot/capture-save";

/** Nguồn phát sinh request capture. */
export type CaptureSaveSource = "content-button" | "popup-paste" | "popup-current-tab";

export type CaptureSaveRequest = {
  type: typeof MSG_CAPTURE_SAVE;
  url: string;
  source: CaptureSaveSource;
};

export type CaptureSaveResponse =
  | { ok: true; saved: boolean; link: PendingLink }
  | { ok: false; reason: "invalid-url" | "storage-error" | "not-linked" };

/** Tên message yêu cầu background chạy sync hàng đợi lên backend ngay. */
export const MSG_SYNC_NOW = "braintot/sync-now";

/** Response của MSG_SYNC_NOW — shape trùng SyncStatusResponse của sync-engine. */
export type SyncNowResponse =
  | { ok: true; pushed: number; processed: number; failed: number }
  | { ok: false; reason: "sync-unavailable" | "unreachable" | "auth-error" };

/** Tên message yêu cầu background mở trang liên kết web (spec/17). */
export const MSG_LINK_WEB = "braintot/link-web";

/** Response của MSG_LINK_WEB. */
export type LinkWebResponse = { ok: true } | { ok: false; reason: "unreachable" };

/** Content script `web-session` báo session mới nhất trên web về background (spec/62). */
export const MSG_WEB_SESSION = "braintot/web-session";

/** Popup hỏi content script URL video đang phát trên tab (vd: TikTok For You feed) và trạng thái quá 3 phút. */
export const MSG_GET_ACTIVE_URL = "braintot/get-active-url";

export type ActiveUrlResponse = {
  url: string | null;
  durationSec?: number | null;
  tooLong?: boolean;
};
