/**
 * Payload builder cho message capture-save: biến URL thô người dùng vừa bắt
 * được thành CaptureSaveRequest. Canonical hóa là việc của domain
 * (normalizeCaptureUrl — nguồn sự thật duy nhất); tầng này chỉ là thin wrapper
 * và không gửi thêm platform/videoId — background tự suy lại từ canonical URL.
 */

import { normalizeCaptureUrl } from "../domain/url-canonicalizer";

import { MSG_CAPTURE_SAVE, type CaptureSaveRequest, type CaptureSaveSource } from "./messages";

/**
 * Trả về payload 3 field (`type`, `url` = canonical URL, `source`), hoặc null
 * khi URL không phải video ngắn hỗ trợ.
 */
export function buildCapturePayload(
  rawUrl: string,
  source: CaptureSaveSource
): CaptureSaveRequest | null {
  const capture = normalizeCaptureUrl(rawUrl);
  if (!capture) return null;
  return { type: MSG_CAPTURE_SAVE, url: capture.canonicalUrl, source };
}
