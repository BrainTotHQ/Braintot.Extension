/**
 * Cấu hình Firebase web SDK cho extension (plan spec/16 Task 3).
 * Giá trị copy từ braintot-web/.env.production (NEXT_PUBLIC_FIREBASE_*) vào
 * .env của extension — chỉ còn dùng cho user-stats (Firestore REST); đăng nhập đi qua backend.
 *
 * WXT (Vite) nạp biến .env vào import.meta.env; đọc cả hai prefix
 * PUBLIC_/VITE_ để không phụ thuộc convention phiên wxt.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

const env = () =>
  (import.meta as unknown as { env: Record<string, string | undefined> }).env;

const pick = (suffix: string): string =>
  env()[`PUBLIC_FIREBASE_${suffix}`] ?? env()[`VITE_FIREBASE_${suffix}`] ?? "";

/** Đọc mỗi lần gọi (lazy) — giúp test gán import.meta.env trực tiếp. */
export const getFirebaseWebConfig = (): FirebaseWebConfig => ({
  apiKey: pick("API_KEY"),
  authDomain: pick("AUTH_DOMAIN"),
  projectId: pick("PROJECT_ID"),
});

export const isFirebaseConfigured = (): boolean => {
  const config = getFirebaseWebConfig();
  return Boolean(config.apiKey && config.projectId);
};

const pickAny = (suffix: string): string =>
  env()[`PUBLIC_${suffix}`] ?? env()[`VITE_${suffix}`] ?? "";

/** Base URL web app — nút "Xem trên Web" mở bài học tại đây. */
export const getWebBaseUrl = (): string =>
  pickAny("WEB_URL").replace(/\/+$/, "") || "https://braintot.tonythaniel.com";

/**
 * VideoId theo keyspace engine/web (platforms.py, web `resolveVideoIdentity`): YouTube raw 11 ký tự,
 * TikTok `tt_<id>` / `ttvm_<code>`, Facebook `fb_<id>` / `fbw_<code>`. Extension lưu `videoId`
 * thô (không prefix) cho TikTok/Reels nên phải suy ra lại từ URL canonical khi mở web.
 */
export function engineVideoId(link: {
  platform: "youtube" | "tiktok" | "facebook_reel";
  videoId: string;
  url: string;
}): string {
  if (link.platform === "youtube") return link.videoId;
  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return link.videoId;
  }
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;
  if (link.platform === "tiktok") {
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
      const code = path.replace(/\//g, "");
      return code ? `ttvm_${code}` : link.videoId;
    }
    const media = /^\/@[^/]+\/(?:video|photo)\/(\d{10,})(?:[/?#]|$)/.exec(path)?.[1];
    if (media) return `tt_${media}`;
    const short = /^\/t\/([^/]+)/.exec(path)?.[1];
    return short ? `tt_${short}` : link.videoId;
  }
  if (host === "fb.watch") {
    const code = /^\/([A-Za-z0-9_-]+)/.exec(path)?.[1];
    return code ? `fbw_${code}` : link.videoId;
  }
  const reel = /^\/(?:reel|reels\/videos)\/(\d+)(?:[/?#]|$)/.exec(path)?.[1];
  if (reel) return `fb_${reel}`;
  const share = /^\/share\/(?:r|v|reel)\/([A-Za-z0-9_-]+)/.exec(path)?.[1];
  if (share) return `fbw_${share}`;
  return link.videoId;
}

/**
 * Deep-link bài học: web chỉ còn `/flashcards?video=<videoId>` (route `/youtube` đã bị gỡ ở
 * PR #4; spec/57). Trang đó lọc đúng bộ thẻ của video và tự mở modal.
 */
export const webFlashcardsUrl = (videoId: string): string =>
  `${getWebBaseUrl()}/flashcards?video=${encodeURIComponent(videoId)}`;

/** Base URL backend NestJS — prod là https://braintot.tonythaniel.com. */
export const backendBaseUrl = (): string =>
  pickAny("BACKEND_URL").replace(/\/+$/, "") || "https://braintot.tonythaniel.com";
