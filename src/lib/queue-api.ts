/**
 * Client của `/api/v1/pending-links` (spec/61): extension dùng đúng API như web,
 * backend giao AI xử lý và nhận webhook; extension chỉ gửi link và đọc lại danh sách.
 */

import type { PendingLink } from "../domain/pending-link";
import { authedFetch } from "./authed-fetch";
import { backendBaseUrl } from "./backend-config";

export type RemoteResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: "unreachable" | "auth-error" | "rejected";
      /** `detail.error_code` của backend (vd INVALID_URL) khi reason = rejected. */
      errorCode?: string;
    };

/** Doc backend (có thể kèm field nội bộ, null thay cho vắng) → PendingLink của extension. */
export function toPendingLink(doc: Record<string, unknown>): PendingLink | null {
  const { id, url, platform, videoId, status, savedAt } = doc;
  if (
    typeof id !== "string" ||
    typeof url !== "string" ||
    typeof videoId !== "string" ||
    typeof savedAt !== "string" ||
    (platform !== "youtube" && platform !== "tiktok" && platform !== "facebook_reel") ||
    (status !== "pending" && status !== "processing" && status !== "succeeded" && status !== "failed")
  ) {
    return null;
  }
  return {
    id,
    url,
    platform,
    videoId,
    status,
    savedAt,
    ...(typeof doc.processedAt === "string" ? { processedAt: doc.processedAt } : {}),
    ...(typeof doc.failureReason === "string" ? { failureReason: doc.failureReason } : {}),
  };
}

async function request(
  path: string,
  init: RequestInit,
  fetchImpl?: typeof fetch,
): Promise<Response | "unreachable"> {
  try {
    return await authedFetch(`${backendBaseUrl().replace(/\/+$/, "")}${path}`, init, fetchImpl);
  } catch {
    return "unreachable";
  }
}

async function errorCodeOf(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => null)) as {
    detail?: { error_code?: unknown };
  } | null;
  return typeof body?.detail?.error_code === "string" ? body.detail.error_code : undefined;
}

/** GET danh sách link của user (doc lạ bị bỏ qua, không làm hỏng cả danh sách). */
export async function fetchRemoteLinks(fetchImpl?: typeof fetch): Promise<RemoteResult<PendingLink[]>> {
  const response = await request("/api/v1/pending-links", { method: "GET" }, fetchImpl);
  if (response === "unreachable") return { ok: false, reason: "unreachable" };
  if (response.status === 401) return { ok: false, reason: "auth-error" };
  if (!response.ok) return { ok: false, reason: "unreachable" };
  const body = (await response.json().catch(() => null)) as { links?: unknown } | null;
  if (!body || !Array.isArray(body.links)) return { ok: false, reason: "unreachable" };
  const links = body.links
    .map((doc) => (typeof doc === "object" && doc !== null ? toPendingLink(doc as Record<string, unknown>) : null))
    .filter((link): link is PendingLink => link !== null);
  return { ok: true, value: links };
}

/** POST gửi link (idempotent theo URL; link failed được giao lại). */
export async function submitRemoteLink(url: string, fetchImpl?: typeof fetch): Promise<RemoteResult<PendingLink>> {
  const response = await request("/api/v1/pending-links", { method: "POST", body: JSON.stringify({ url }) }, fetchImpl);
  if (response === "unreachable") return { ok: false, reason: "unreachable" };
  if (response.status === 401) return { ok: false, reason: "auth-error" };
  if (response.status === 400) {
    const errorCode = await errorCodeOf(response);
    return { ok: false, reason: "rejected", ...(errorCode ? { errorCode } : {}) };
  }
  if (!response.ok) return { ok: false, reason: "unreachable" };
  const doc = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const link = doc ? toPendingLink(doc) : null;
  return link ? { ok: true, value: link } : { ok: false, reason: "unreachable" };
}

/** DELETE một link (xoá luôn video và flashcard nếu đã xong). 404 coi như đã xoá. */
export async function deleteRemoteLink(id: string, fetchImpl?: typeof fetch): Promise<RemoteResult<null>> {
  const response = await request(`/api/v1/pending-links/${encodeURIComponent(id)}`, { method: "DELETE" }, fetchImpl);
  if (response === "unreachable") return { ok: false, reason: "unreachable" };
  if (response.status === 401) return { ok: false, reason: "auth-error" };
  if (response.ok || response.status === 404) return { ok: true, value: null };
  return { ok: false, reason: "unreachable" };
}
