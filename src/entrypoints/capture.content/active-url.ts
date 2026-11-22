/**
 * Suy ra URL video ngắn đang xem trên trang hiện tại.
 * - Với YouTube Shorts, Facebook Reels, TikTok detail: `location.href` đã là URL video.
 * - Với TikTok feed (`tiktok.com/`, `/foryou`, `/following`, `/friends`, `/explore`):
 *   TikTok không đổi `location.href` khi lướt; phải đọc ID + tác giả của bài đang hiển thị
 *   ở giữa viewport từ DOM để người dùng lưu ngay mà không cần mở drawer bình luận.
 */

import { normalizeCaptureUrl } from "../../domain/url-canonicalizer";

const TIKTOK_MEDIA_HREF = /\/@[^/?#]+\/(?:video|photo)\/\d{10,}/;
const TIKTOK_AUTHOR_HREF = /^\/(@[A-Za-z0-9._-]+)(?:[/?#]|$)/;
const XGWRAPPER_ID = /xgwrapper-\d+-(\d{15,})/;
const LONG_NUMERIC_ID = /\b(\d{18,20})\b/;

const FEED_ITEM_SELECTORS = [
  'article[data-e2e="recommend-list-item-container"]',
  '[data-e2e="recommend-list-item-container"]',
  "article",
].join(", ");

function isTikTokHost(href: string): boolean {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

/** Chọn bài feed đang chiếm nhiều diện tích nhất trong viewport (gần tâm màn hình nhất). */
function pickActiveFeedContainer(doc: Document): Element | null {
  const candidates = Array.from(doc.querySelectorAll(FEED_ITEM_SELECTORS));
  if (candidates.length === 0) return null;

  const viewHeight = doc.defaultView?.innerHeight || 900;
  const viewCenter = viewHeight / 2;

  let best: Element | null = null;
  let bestOverlap = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 && rect.width <= 0) continue;
    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(viewHeight, rect.bottom);
    const overlap = Math.max(0, visibleBottom - visibleTop);
    const centerDistance = Math.abs((rect.top + rect.bottom) / 2 - viewCenter);

    if (overlap > bestOverlap || (overlap === bestOverlap && centerDistance < bestDistance)) {
      best = el;
      bestOverlap = overlap;
      bestDistance = centerDistance;
    }
  }

  return best ?? candidates[0] ?? null;
}

function toAbsoluteTikTokUrl(rawHref: string): string | null {
  try {
    const url = new URL(rawHref, "https://www.tiktok.com");
    return normalizeCaptureUrl(url.toString())?.canonicalUrl ?? null;
  } catch {
    return null;
  }
}

/** Tìm link trực tiếp /@user/video/<id> hoặc /@user/photo/<id> bên trong scope. */
function findDirectMediaLink(scope: ParentNode): string | null {
  const links = scope.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const raw = link.getAttribute("href") ?? "";
    if (!TIKTOK_MEDIA_HREF.test(raw)) continue;
    const resolved = toAbsoluteTikTokUrl(raw);
    if (resolved) return resolved;
  }
  return null;
}

/** Tìm handle tác giả (@username) bên trong bài đăng TikTok. */
function findAuthorHandle(scope: ParentNode): string {
  const priorityLinks = scope.querySelectorAll<HTMLAnchorElement>(
    '[data-e2e="video-author-uniqueid"], [data-e2e="video-author-avatar"] a[href], a[href^="/@"]',
  );
  for (const el of priorityLinks) {
    const href = el.getAttribute("href");
    if (href) {
      const match = TIKTOK_AUTHOR_HREF.exec(href)?.[1];
      if (match) return match;
    }
    const text = el.textContent?.trim();
    if (text && /^[A-Za-z0-9._-]+$/.test(text)) {
      return `@${text}`;
    }
  }
  return "@_";
}

/** Trích TikTok item ID (15–20 chữ số) từ xgwrapper id hoặc data attribute của player. */
function findTikTokItemId(scope: ParentNode): string | null {
  const xgNodes = scope.querySelectorAll<HTMLElement>('[id*="xgwrapper-"]');
  for (const node of xgNodes) {
    const match = XGWRAPPER_ID.exec(node.id)?.[1];
    if (match) return match;
  }

  const dataNodes = scope.querySelectorAll<HTMLElement>(
    "[data-item-id], [data-video-id], [data-aweme-id]",
  );
  for (const node of dataNodes) {
    const raw =
      node.getAttribute("data-item-id") ??
      node.getAttribute("data-video-id") ??
      node.getAttribute("data-aweme-id") ??
      "";
    if (/^\d{15,}$/.test(raw)) return raw;
  }

  const idNodes = scope.querySelectorAll<HTMLElement>("[id]");
  for (const node of idNodes) {
    const match = LONG_NUMERIC_ID.exec(node.id)?.[1];
    if (match) return match;
  }

  return null;
}

function isPhotoPost(scope: ParentNode): boolean {
  const hasPhotoMarker =
    scope.querySelector('[data-e2e="photo-mode"], .swiper-slide img') !== null;
  const hasVideo = scope.querySelector("video") !== null;
  return hasPhotoMarker && !hasVideo;
}

function extractTikTokFeedUrl(doc: Document): string | null {
  const container = pickActiveFeedContainer(doc);
  if (!container) return null;

  const direct = findDirectMediaLink(container);
  if (direct) return direct;

  const itemId = findTikTokItemId(container);
  if (!itemId) return null;

  const author = findAuthorHandle(container);
  const kind = isPhotoPost(container) ? "photo" : "video";
  return `https://www.tiktok.com/${author}/${kind}/${itemId}`;
}

/**
 * Trả về URL video đang xem (hợp lệ với `normalizeCaptureUrl`), hoặc `null` nếu
 * trang hiện tại không có video nào để lưu.
 */
export function resolveActiveCaptureUrl(doc: Document, href: string): string | null {
  if (normalizeCaptureUrl(href)) return href;
  if (isTikTokHost(href)) return extractTikTokFeedUrl(doc);
  return null;
}
