/**
 * Phiên đăng nhập của extension (spec/62, giai đoạn 1).
 *
 * Extension KHÔNG tự đăng nhập: chỉ cầm access token do backend cấp (HS256, 12 giờ) mà trang web
 * trao qua `/extension-link` hoặc content script `web-session`. Không còn Anonymous và Firebase
 * SDK, nên uid của extension luôn trùng uid trên web.
 *
 * Token sống qua restart service worker trong `storage.local`. Hết hạn thì trạng thái chuyển
 * `expired` và người dùng phải liên kết lại (refresh token là giai đoạn 2).
 */

import { browser } from "wxt/browser";

const SESSION_KEY = "braintot:auth-session";
/** Khoá cũ (spec/17: Firebase ID token + refresh token): không dùng được nữa, xoá khi gặp. */
const LEGACY_AUTH_KEY = "braintot:auth-google";

export interface AuthSession {
  /** Bearer gửi backend. */
  accessToken: string;
  email: string;
  /** Mili-giây kể từ epoch. */
  expiresAt: number;
  uid: string | null;
}

/** Token sắp hết hạn trong khoảng này coi như đã hết, tránh gửi token chết. */
const EXPIRY_MARGIN_MS = 60_000;

let session: AuthSession | null = null;
let initPromise: Promise<void> | null = null;

/** Kiểm tra dữ liệu đọc từ storage hoặc message; sai hình thì null. */
export function parseAuthSession(value: unknown): AuthSession | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.accessToken !== "string" || raw.accessToken === "") return null;
  if (typeof raw.expiresAt !== "number" || !Number.isFinite(raw.expiresAt)) return null;
  const email = typeof raw.email === "string" ? raw.email : "";
  const uid =
    typeof raw.uid === "string" && raw.uid !== "" ? raw.uid : uidFromIdToken(raw.accessToken);
  return { accessToken: raw.accessToken, email, expiresAt: raw.expiresAt, uid };
}

/**
 * Decode payload JWT (base64url, không padding) và trả uid từ claim `user_id` hoặc `sub`.
 * Token rác / JSON lỗi → null, không ném.
 */
export function uidFromIdToken(token: string): string | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const b64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const json = new TextDecoder().decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
    const claims = JSON.parse(json) as { user_id?: string; sub?: string };
    return claims.user_id ?? claims.sub ?? null;
  } catch {
    return null;
  }
}

/** Nạp phiên từ storage (idempotent). Gọi trước mọi hàm đọc trạng thái. */
export function initBackendAuth(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const bag = await browser.storage.local.get([SESSION_KEY, LEGACY_AUTH_KEY]);
    session = parseAuthSession(bag[SESSION_KEY]);
    if (LEGACY_AUTH_KEY in bag) {
      await browser.storage.local.remove(LEGACY_AUTH_KEY);
    }
  })().catch((error: unknown) => {
    initPromise = null; // lỗi storage tạm thời: cho lần gọi sau thử lại.
    throw error;
  });
  return initPromise;
}

/** Nạp lại phiên từ storage (content script gọi khi storage đổi ở context khác). */
export function reloadAuth(): Promise<void> {
  initPromise = null;
  return initBackendAuth();
}

/** Lưu phiên mới nhận từ web (ghi đè phiên hiện tại). */
export async function saveAuthSession(next: AuthSession): Promise<void> {
  session = next;
  await browser.storage.local.set({ [SESSION_KEY]: next });
}

/** Đăng xuất: xoá phiên cục bộ. Hàng đợi local được giữ nguyên. */
export async function signOut(): Promise<void> {
  session = null;
  await browser.storage.local.remove([SESSION_KEY, LEGACY_AUTH_KEY]);
}

export type LinkStatus = "linked" | "expired" | "unlinked";

/** Đã liên kết nhưng token hết hạn: cần liên kết lại. */
export function isAuthExpired(now: number = Date.now()): boolean {
  return session !== null && session.expiresAt - EXPIRY_MARGIN_MS <= now;
}

/** Trạng thái liên kết với tài khoản web. Gọi sau `initBackendAuth()`. */
export function getLinkStatus(now: number = Date.now()): LinkStatus {
  if (!session) return "unlinked";
  return isAuthExpired(now) ? "expired" : "linked";
}

export function isLinked(): boolean {
  return getLinkStatus() === "linked";
}

/** Có phiên (kể cả hết hạn) để thử đồng bộ không. */
export function isSyncAvailable(): boolean {
  return session !== null;
}

export function getAuthEmail(): string | null {
  return session?.email || null;
}

export function getAuthUid(): string | null {
  return session?.uid ?? null;
}

/**
 * Access token cho `Authorization: Bearer`. Hết hạn → null. Không có refresh ở giai đoạn 1,
 * nên `forceRefresh` (server vừa trả 401) cũng trả null và caller báo `auth-error`.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (!session || isAuthExpired() || forceRefresh) return null;
  return session.accessToken;
}

/**
 * Nhận phiên do web gửi (handshake hoặc content script). `adopt`: chỉ nhận khi chưa liên kết,
 * đã hết hạn hoặc cùng uid; đang liên kết tài khoản KHÁC thì bỏ qua, tránh tự đổi tài khoản
 * (và đẩy hàng đợi local sang uid khác) mà người dùng không biết.
 */
export async function adoptAuthSession(next: AuthSession, now: number = Date.now()): Promise<boolean> {
  if (next.expiresAt - EXPIRY_MARGIN_MS <= now) return false;
  await initBackendAuth();
  const sameAccount = session?.uid != null && session.uid === next.uid;
  if (session && !isAuthExpired(now) && !sameAccount) return false;
  if (sameAccount && session && session.expiresAt >= next.expiresAt) return true;
  await saveAuthSession(next);
  return true;
}
