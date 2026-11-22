/**
 * Suy ra URL video ngắn đang xem trên trang hiện tại.
 * - Với YouTube Shorts, Facebook Reels, TikTok detail: `location.href` đã là URL video.
 * - Với TikTok feed (`tiktok.com/`, `/foryou`, `/following`, `/friends`, `/explore`):
 *   TikTok không đổi `location.href` khi lướt; phải đọc ID + tác giả của bài đang hiển thị
 *   ở giữa viewport từ DOM để người dùng lưu ngay mà không cần mở drawer bình luận.
 */

import { normalizeCaptureUrl } from "../../domain/url-canonicalizer";

/** Giới hạn thời lượng video hỗ trợ (3 phút = 180 giây). */
export const MAX_CAPTURE_DURATION_SEC = 180;

const TIKTOK_MEDIA_HREF = /\/@[^/?#]+\/(?:video|photo)\/\d{10,}/;
const TIKTOK_AUTHOR_HREF = /^\/(@[A-Za-z0-9._-]+)(?:[/?#]|$)/;
const XGWRAPPER_ID = /xgwrapper-\d+-(\d{15,})/;
const LONG_NUMERIC_ID = /\b(\d{18,20})\b/;
const DURATION_PART = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const SEEKBAR_PAIR = /\d{1,2}:\d{2}(?::\d{2})?\s*\/\s*(\d{1,2}:\d{2}(?::\d{2})?)/;

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

/** Parse chuỗi thời lượng dạng `MM:SS`, `H:MM:SS` hoặc cặp seekbar `00:02 / 07:11` sang số giây. */
export function parseDurationText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const pairTotal = SEEKBAR_PAIR.exec(trimmed)?.[1];
  const target = pairTotal ?? trimmed;
  const match = DURATION_PART.exec(target);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] !== undefined ? Number(match[3]) : null;
  if (third !== null) return first * 3600 + second * 60 + third;
  return first * 60 + second;
}

function readValidVideoDuration(video: HTMLVideoElement | null): number | null {
  if (!video) return null;
  const d = video.duration;
  if (d === Number.POSITIVE_INFINITY) return MAX_CAPTURE_DURATION_SEC + 1;
  return Number.isFinite(d) && d > 0 ? d : null;
}

/** Chọn thẻ `<video>` đang hiển thị lớn nhất trong viewport trong phạm vi `scope`. */
function pickVisibleVideo(scope: ParentNode, viewHeight: number): HTMLVideoElement | null {
  const videos = Array.from(scope.querySelectorAll<HTMLVideoElement>("video"));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0] ?? null;

  let best: HTMLVideoElement | null = null;
  let bestScore = -1;
  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    const visibleH = Math.max(0, Math.min(viewHeight, rect.bottom) - Math.max(0, rect.top));
    const playingBonus = !video.paused && video.readyState >= 2 ? 10_000 : 0;
    const score = playingBonus + visibleH * Math.max(1, rect.width);
    if (score > bestScore) {
      bestScore = score;
      best = video;
    }
  }
  return best ?? videos[0] ?? null;
}

function isYouTubeHost(href: string): boolean {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}

/**
 * Đọc thời lượng (giây) của video đang phát trên YouTube / TikTok / Facebook Reels.
 * Trả `null` nếu là photo slideshow hoặc chưa có metadata (tránh chặn nhầm khi chưa nạp xong).
 */
export function resolveActiveVideoDurationSec(doc: Document, href: string): number | null {
  const viewHeight = doc.defaultView?.innerHeight || 900;

  if (isYouTubeHost(href)) {
    let pathname = "";
    try {
      pathname = new URL(href).pathname;
    } catch {
      /* giữ rỗng */
    }

    // YouTube SPA giữ nguyên #movie_player (đã ẩn) trong DOM khi chuyển từ /watch sang /shorts.
    // Trên /shorts tuyệt đối không fallback sang #movie_player hay .ytp-time-duration của video cũ.
    if (pathname.startsWith("/shorts/")) {
      const shortsVideo =
        doc.querySelector<HTMLVideoElement>("ytd-reel-video-renderer[is-active] video") ??
        doc.querySelector<HTMLVideoElement>("#shorts-player video");
      return readValidVideoDuration(shortsVideo);
    }

    const watchPlayer = doc.querySelector<HTMLElement>("#movie_player");
    const adShowing = watchPlayer?.classList.contains("ad-showing") ?? false;
    if (!adShowing) {
      const mainVideo =
        watchPlayer?.querySelector<HTMLVideoElement>("video.html5-main-video") ??
        pickVisibleVideo(doc, viewHeight);
      const fromVideo = readValidVideoDuration(mainVideo);
      if (fromVideo !== null) return fromVideo;
    }
    const label = (watchPlayer ?? doc).querySelector(".ytp-time-duration")?.textContent;
    return parseDurationText(label);
  }

  if (isTikTokHost(href)) {
    const isDetailPage = /\/@[^/]+\/(?:video|photo)\/\d{10,}/.test(href);
    const scope: ParentNode = isDetailPage ? doc : (pickActiveFeedContainer(doc) ?? doc);
    if (isPhotoPost(scope)) return null;

    const video = pickVisibleVideo(scope, viewHeight);
    const fromVideo = readValidVideoDuration(video);
    if (fromVideo !== null) return fromVideo;

    // Fallback: đọc thanh thời gian TikTok dạng `00:02 / 07:11`.
    const timeNodes = scope.querySelectorAll(
      '[class*="SeekBarTimeContainer"], [class*="TimeContainer"], [data-e2e*="time"]',
    );
    for (const node of timeNodes) {
      const parsed = parseDurationText(node.textContent);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  // Facebook Reels hoặc trang video khác
  return readValidVideoDuration(pickVisibleVideo(doc, viewHeight));
}

export function isDurationTooLong(durationSec: number | null): boolean {
  return durationSec !== null && durationSec > MAX_CAPTURE_DURATION_SEC;
}
