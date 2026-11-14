/**
 * Sync engine (spec/61, server-first): extension là client của backend như web.
 *
 * Luồng: (1) mỗi link local `pending` → POST /pending-links (backend giao AI,
 * nhận webhook) và ghi lại doc server trả về; (2) GET /pending-links rồi gộp
 * vào cache local, SERVER THẮNG (trạng thái từ AI, link tạo/xoá trên web).
 *
 * Token: access token backend lấy qua /extension-link (spec/58). Hết hạn →
 * `auth-error`, popup mời liên kết lại. Backend unreachable → không đụng queue.
 * Sync là additive: mọi lỗi không ảnh hưởng luồng capture/save.
 */

import {
  initBackendAuth,
  isAuthExpired,
  isSyncAvailable,
} from "./backend-auth";
import { fetchRemoteLinks, submitRemoteLink } from "./queue-api";
import type { QueueStore } from "./queue-store";

export type SyncStatusResponse =
  | { ok: true; pushed: number; processed: number; failed: number }
  | {
      ok: false;
      reason: "sync-unavailable" | "unreachable" | "auth-error";
    };

const nowIso = (): string => new Date().toISOString();

/** Chu trình sync đang chạy — single-flight: call dồn về cùng 1 lần chạy
 * (2 capture liên tiếp / popup poll trong lúc auto-sync không nhân đôi). */
let activeSync: Promise<SyncStatusResponse> | null = null;

/** Chạy toàn bộ chu trình sync. Idempotent, single-flight. */
export function syncQueue(deps: {
  store: QueueStore;
  fetchImpl?: typeof fetch;
}): Promise<SyncStatusResponse> {
  if (activeSync) return activeSync;
  activeSync = runSync(deps).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function runSync(deps: {
  store: QueueStore;
  fetchImpl?: typeof fetch;
}): Promise<SyncStatusResponse> {
  const fetchImpl = deps.fetchImpl;

  // Đợi init auth (idempotent): SW mới dậy + capture ngay có thể sync trước khi xong.
  await initBackendAuth();
  if (!isSyncAvailable()) return { ok: false, reason: "sync-unavailable" };
  // Access token backend hết hạn: không gửi token chết, popup mời liên kết lại.
  if (isAuthExpired()) return { ok: false, reason: "auth-error" };

  // 1. Đẩy link `pending` — tuần tự, doc server trả về thay bản local.
  let pushed = 0;
  let failed = 0;
  const pending = (await deps.store.listQueue()).filter((link) => link.status === "pending");
  for (const link of pending) {
    const result = await submitRemoteLink(link.url, fetchImpl);
    if (result.ok) {
      await deps.store.updateLink(result.value);
      pushed++;
      continue;
    }
    if (result.reason !== "rejected") {
      return { ok: false, reason: result.reason };
    }
    // Backend từ chối link (vd INVALID_URL): đánh dấu lỗi để người dùng thấy, không gửi lại mãi.
    await deps.store.updateLink({
      ...link,
      status: "failed",
      processedAt: nowIso(),
      failureReason: result.errorCode ?? "PROCESSING_FAILED",
    });
    failed++;
  }

  // 2. Kéo danh sách server về, server thắng.
  const remote = await fetchRemoteLinks(fetchImpl);
  if (!remote.ok) {
    return { ok: false, reason: remote.reason === "auth-error" ? "auth-error" : "unreachable" };
  }
  await deps.store.replaceFromServer(remote.value);
  const processed = remote.value.filter((link) => link.status === "succeeded").length;
  return { ok: true, pushed, processed, failed };
}
