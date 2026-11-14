/**
 * Handshake đăng nhập với web (spec/58, spec/62): extension mở
 * `<web>/extension-link?ext=<runtimeId>&nonce=<random>`, web (đã đăng nhập Google) gửi access token
 * backend về qua `onMessageExternal`.
 *
 * Chống giả mạo: chỉ nhận sender có origin === web origin, nonce dùng một lần và hết hạn sau
 * 10 phút. Nonce nằm ở `storage.session` (không phải biến module) vì service worker MV3 ngủ là
 * mất biến, handshake sẽ hỏng im lặng.
 */

import { browser } from "wxt/browser";

import { parseAuthSession, saveAuthSession } from "./backend-auth";
import { getWebBaseUrl } from "./backend-config";

export const WEB_AUTH_MESSAGE_TYPE = "braintot/auth" as const;

const NONCE_KEY = "braintot:link-nonce";
const NONCE_TTL_MS = 10 * 60_000;

export interface WebAuthMessage {
  type: typeof WEB_AUTH_MESSAGE_TYPE;
  nonce: string;
  accessToken: string;
  expiresAt: number;
  email: string;
}

export type WebAuthResult =
  | { ok: true; email: string }
  | { ok: false; reason: "untrusted-origin" | "invalid-nonce" | "missing-tokens" };

export function buildHandshakeUrl(extId: string, nonce: string): string {
  return `${getWebBaseUrl()}/extension-link?ext=${encodeURIComponent(extId)}&nonce=${encodeURIComponent(nonce)}`;
}

function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface StoredNonce {
  nonce: string;
  expiresAt: number;
}

async function readNonce(now: number): Promise<string | null> {
  const bag = await browser.storage.session.get(NONCE_KEY);
  const stored = bag[NONCE_KEY] as StoredNonce | undefined;
  if (!stored || typeof stored.nonce !== "string" || stored.expiresAt <= now) return null;
  return stored.nonce;
}

export async function isHandshakePending(now: number = Date.now()): Promise<boolean> {
  return (await readNonce(now)) !== null;
}

/** Mở tab trang bắt tay trên web. Gọi từ background (MSG_LINK_WEB). */
export async function openWebLinkHandshake(now: number = Date.now()): Promise<void> {
  const nonce = newNonce();
  const stored: StoredNonce = { nonce, expiresAt: now + NONCE_TTL_MS };
  await browser.storage.session.set({ [NONCE_KEY]: stored });
  await browser.tabs.create({
    url: buildHandshakeUrl(browser.runtime.id, nonce),
    active: true,
  });
}

/** Handler cho `runtime.onMessageExternal`: validate rồi nhận token. */
export async function handleWebAuthMessage(
  message: unknown,
  senderUrl: string | undefined,
  now: number = Date.now(),
): Promise<WebAuthResult> {
  const webOrigin = new URL(getWebBaseUrl()).origin;
  if (!senderUrl) return { ok: false, reason: "untrusted-origin" };
  let senderOrigin: string;
  try {
    senderOrigin = new URL(senderUrl).origin;
  } catch {
    return { ok: false, reason: "untrusted-origin" };
  }
  if (senderOrigin !== webOrigin) return { ok: false, reason: "untrusted-origin" };

  const msg = message as Partial<WebAuthMessage> | null;
  if (!msg || msg.type !== WEB_AUTH_MESSAGE_TYPE || typeof msg.nonce !== "string") {
    return { ok: false, reason: "invalid-nonce" };
  }
  const expected = await readNonce(now);
  if (!expected || msg.nonce !== expected) return { ok: false, reason: "invalid-nonce" };

  const session = parseAuthSession(msg);
  if (!session || session.expiresAt <= now) return { ok: false, reason: "missing-tokens" };

  // Người dùng chủ động bấm "Liên kết" nên ghi đè cả khi đang ở tài khoản khác.
  await saveAuthSession(session);
  await browser.storage.session.remove(NONCE_KEY); // nonce một lần: replay bị chặn.
  return { ok: true, email: session.email };
}
