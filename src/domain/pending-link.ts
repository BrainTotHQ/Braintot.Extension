/**
 * Mô hình "Pending Link" — một link video người dùng lưu vào hàng đợi chờ
 * biến thành bài học. Tầng domain: TypeScript thuần.
 */

export type PendingLinkStatus = "pending" | "processing" | "succeeded" | "failed";

/** Sơ đồ chuyển trạng thái: chỉ các cặp liệt kê ở đây là hợp lệ. */
export const PENDING_LINK_TRANSITIONS: Readonly<
  Record<PendingLinkStatus, readonly PendingLinkStatus[]>
> = {
  pending: ["processing"],
  processing: ["succeeded", "failed"],
  succeeded: [],
  failed: ["pending"],
};

export function canTransition(from: PendingLinkStatus, to: PendingLinkStatus): boolean {
  return PENDING_LINK_TRANSITIONS[from].includes(to);
}

export interface PendingLink {
  id: string;
  url: string;
  platform: PendingLinkPlatform;
  videoId: string;
  status: PendingLinkStatus;
  savedAt: string;
  processedAt?: string;
  failureReason?: string;
}

export type PendingLinkPlatform = "youtube" | "tiktok" | "facebook_reel";

/**
 * ID ổn định của một pending link: SHA-256 của canonical URL.
 * Dùng làm Firestore document ID để lưu 2 lần cùng 1 link là idempotent (upsert).
 */
export async function pendingLinkId(canonicalUrl: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalUrl)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
