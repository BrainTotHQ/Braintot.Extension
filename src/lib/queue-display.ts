/**
 * Hiển thị card hàng đợi (spec/57): thumbnail và "x phút trước", cùng quy ước với
 * web `QueueItemCard` / `lib/client/queue.ts`. TypeScript thuần.
 */

import type { PendingLink } from "../domain/pending-link";

/** Ảnh thật chỉ có cho YouTube; TikTok/Reels không có thumbnail công khai ổn định → null. */
export function thumbnailUrl(link: Pick<PendingLink, "platform" | "videoId">): string | null {
  return link.platform === "youtube"
    ? `https://i.ytimg.com/vi/${encodeURIComponent(link.videoId)}/mqdefault.jpg`
    : null;
}

/** "vừa xong" / "5 phút trước" / "3 giờ trước" / "2 ngày trước"; ISO lỗi → chuỗi rỗng. */
export function formatSavedAgo(savedAt: string, now: number = Date.now()): string {
  const time = Date.parse(savedAt);
  if (Number.isNaN(time)) return "";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

/**
 * Tiêu đề cho card: tên video thật (oEmbed, nếu đã có) hoặc tên ngắn theo link (thay URL thô): TikTok → "@handle", Reels → "Reel …<6 số cuối>",
 * YouTube → "YouTube Short …<id>". Link rút gọn / không đọc được → tên nền tảng.
 */
export function displayTitle(
  link: Pick<PendingLink, "platform" | "videoId" | "url">,
  videoTitle?: string,
): string {
  if (videoTitle) return videoTitle;
  let path = "";
  try {
    path = new URL(link.url).pathname;
  } catch {
    /* url lỗi: dùng fallback theo nền tảng */
  }
  if (link.platform === "tiktok") {
    const handle = /^\/(@[^/]+)\//.exec(path)?.[1];
    return handle ?? "Video TikTok";
  }
  if (link.platform === "facebook_reel") {
    const id = /(\d{6,})/.exec(path)?.[1];
    return id ? `Reel …${id.slice(-6)}` : "Facebook Reel";
  }
  return `YouTube Short …${link.videoId.slice(-4)}`;
}

/**
 * Dòng chi tiết dưới nhãn trạng thái (như `detailText` của QueueCard mobile):
 * Sẵn sàng "Đã tạo flashcard", Đang chờ "Chờ xử lý", Đang xử lý "Đang tách câu…",
 * Lỗi → lý do (map qua `reasonLabels`, mã lạ giữ nguyên).
 */
export function detailText(
  link: Pick<PendingLink, "status" | "failureReason">,
  reasonLabels: Record<string, string> = {},
): string {
  switch (link.status) {
    case "succeeded":
      return "Đã tạo flashcard";
    case "pending":
      return "Chờ xử lý";
    case "processing":
      return "Đang tách câu…";
    case "failed":
      return link.failureReason ? (reasonLabels[link.failureReason] ?? link.failureReason) : "Xử lý thất bại";
  }
}
