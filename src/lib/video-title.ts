/**
 * Tên video cho card hàng đợi: backend chỉ lưu link, nên popup lấy tên qua oEmbed công khai
 * của YouTube / TikTok (host_permissions đã có), rồi cache vào storage.local.
 * Facebook Reels không có oEmbed công khai (cần token) → rơi về tên ngắn theo link.
 */

import type { PendingLink } from "../domain/pending-link";

/** Key cache tên: Record<linkId, title>. */
export const TITLES_KEY = "braintot:video-titles";

type OembedTarget = Pick<PendingLink, "platform" | "url">;

/** URL oEmbed theo nền tảng; null khi không hỗ trợ. */
export function oembedUrl(link: OembedTarget): string | null {
  const target = encodeURIComponent(link.url);
  if (link.platform === "youtube") return `https://www.youtube.com/oembed?url=${target}&format=json`;
  if (link.platform === "tiktok") return `https://www.tiktok.com/oembed?url=${target}`;
  return null;
}

/** Lấy tên video; lỗi mạng, 4xx, hoặc title rỗng → null (không ném). */
export async function fetchVideoTitle(
  link: OembedTarget,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string | null> {
  const url = oembedUrl(link);
  if (!url) return null;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const body = (await response.json()) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    return title === "" ? null : title;
  } catch {
    return null;
  }
}
