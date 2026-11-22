/**
 * Chuẩn hóa URL video ngắn thành dạng canonical phục vụ dedupe và xử lý về sau.
 * Tầng domain: TypeScript thuần, không được import API của browser/extension.
 */

export type VideoPlatform = "youtube" | "tiktok" | "facebook_reel";

export interface CanonicalCapture {
  platform: VideoPlatform;
  videoId: string;
  canonicalUrl: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH_IDS = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;

/** Tham số tracking cần loại khỏi URL TikTok / Facebook (với YouTube chỉ giữ v=). */
const TRACKING_PARAMS = /^(?:utm_\w+|tt_from|fbclid|si|feature|_r|_t|is_from_webapp|sender_device|sender_web_id|web_id)$/;

function firstMatch(pattern: RegExp, url: URL): string | null {
  return pattern.exec(url.pathname)?.[1] ?? null;
}

function canonicalizeYouTube(url: URL): CanonicalCapture | null {
  const fromQuery = url.searchParams.get("v");
  if (fromQuery && YOUTUBE_ID.test(fromQuery)) {
    return {
      platform: "youtube",
      videoId: fromQuery,
      canonicalUrl: `https://www.youtube.com/watch?v=${fromQuery}`,
    };
  }

  if (url.hostname === "youtu.be") {
    const id = url.pathname.slice(1, 12);
    return YOUTUBE_ID.test(id)
      ? { platform: "youtube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` }
      : null;
  }

  const fromPath = firstMatch(YOUTUBE_PATH_IDS, url);
  return fromPath
    ? {
        platform: "youtube",
        videoId: fromPath,
        canonicalUrl: `https://www.youtube.com/watch?v=${fromPath}`,
      }
    : null;
}

function canonicalizeTikTok(url: URL): CanonicalCapture | null {
  // Link rút gọn vm/vt.tiktok.com: client không resolve được videoId — giữ nguyên URL gốc
  // làm canonical, engine (yt-dlp) tự resolve redirect khi xử lý (spec 33).
  if (url.hostname === "vm.tiktok.com" || url.hostname === "vt.tiktok.com") {
    const code = url.pathname.replace(/\//g, "");
    if (!code) return null;
    return {
      platform: "tiktok",
      videoId: `${url.hostname.slice(0, 2)}_${code}`,
      canonicalUrl: url.toString(),
    };
  }

  // Link share dạng tiktok.com/t/<code>: giữ URL sạch, engine tự resolve.
  const shortCode = /^\/t\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(url.pathname)?.[1];
  if (shortCode) {
    return {
      platform: "tiktok",
      videoId: shortCode,
      canonicalUrl: `https://www.tiktok.com/t/${shortCode}`,
    };
  }

  // Hỗ trợ cả video lẫn photo slideshow (khớp backend pending-link-url.ts + ai-engine).
  const fromPath = /^\/@[^/]+\/(?:video|photo)\/(\d{10,})(?:[/?#]|$)/.exec(url.pathname)?.[1];
  if (!fromPath) return null;

  const clean = new URL(`https://www.tiktok.com${url.pathname.replace(/\/$/, "")}`);
  for (const key of [...clean.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) clean.searchParams.delete(key);
  }
  return { platform: "tiktok", videoId: fromPath, canonicalUrl: clean.toString() };
}

function canonicalizeFacebookReel(url: URL): CanonicalCapture | null {
  // fb.watch/<code>: link share rút gọn — giữ URL gốc, engine tự resolve (spec 33).
  if (url.hostname === "fb.watch") {
    const code = url.pathname.replace(/\//g, "");
    if (!code) return null;
    return { platform: "facebook_reel", videoId: `fbw_${code}`, canonicalUrl: url.toString() };
  }

  const fromPath = /^\/(?:reel|reels\/videos)\/(\d+)(?:[/?#]|$)/.exec(url.pathname)?.[1];
  if (fromPath) {
    return {
      platform: "facebook_reel",
      videoId: fromPath,
      canonicalUrl: `https://www.facebook.com/reel/${fromPath}`,
    };
  }

  const shareCode = /^\/share\/(?:r|v|reel)\/([A-Za-z0-9_-]+)(?:[/?#]|$)/.exec(url.pathname)?.[1];
  if (shareCode) {
    return {
      platform: "facebook_reel",
      videoId: `fbw_${shareCode}`,
      canonicalUrl: `https://www.facebook.com${url.pathname.replace(/\/$/, "")}`,
    };
  }

  const watchId =
    /^\/watch\/(\d+)(?:[/?#]|$)/.exec(url.pathname)?.[1] ??
    (url.pathname.replace(/\/$/, "") === "/watch" ? url.searchParams.get("v") : null);
  return watchId && /^\d+$/.test(watchId)
    ? {
        platform: "facebook_reel",
        videoId: watchId,
        canonicalUrl: `https://www.facebook.com/reel/${watchId}`,
      }
    : null;
}

/**
 * Trả về dữ liệu video chuẩn hóa, hoặc null khi URL không phải video ngắn
 * hỗ trợ (kể cả link rút gọn chưa resolve được).
 */
export function normalizeCaptureUrl(raw: string): CanonicalCapture | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be" || host.endsWith("youtube.com")) return canonicalizeYouTube(url);
  if (host.endsWith("tiktok.com")) return canonicalizeTikTok(url);
  if (host.endsWith("facebook.com") || host === "fb.watch") return canonicalizeFacebookReel(url);
  return null;
}
