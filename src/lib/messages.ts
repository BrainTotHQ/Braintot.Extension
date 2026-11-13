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
  | { ok: false; reason: "invalid-url" | "storage-error" };
