/**
 * Test handshake web-link (spec/58, spec/62): extension mở trang bắt tay trên web,
 * web gửi access token backend về qua onMessageExternal. Nonce nằm ở storage.session.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const saveAuthSessionMock = vi.hoisted(() => vi.fn(async (_s: unknown) => {}));
const tabsCreateMock = vi.hoisted(() => vi.fn(async (_props: { url: string; active?: boolean }) => undefined));
const sessionStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock("./backend-auth", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, saveAuthSession: saveAuthSessionMock };
});

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: { id: "test-ext-id" },
    tabs: { create: tabsCreateMock },
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      session: {
        get: vi.fn(async (key: string) => ({ [key]: sessionStore.get(key) })),
        set: vi.fn(async (bag: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(bag)) sessionStore.set(k, v);
        }),
        remove: vi.fn(async (key: string) => {
          sessionStore.delete(key);
        }),
      },
    },
  },
}));

import {
  buildHandshakeUrl,
  handleWebAuthMessage,
  isHandshakePending,
  openWebLinkHandshake,
} from "./web-link";

const WEB_ORIGIN = "https://braintot-web-jsgeeh2ixa-de.a.run.app";
const NOW = 1_700_000_000_000;

const message = (nonce: string, extra: Record<string, unknown> = {}) => ({
  type: "braintot/auth",
  nonce,
  accessToken: "backend-access",
  expiresAt: NOW + 12 * 3_600_000,
  email: "user@gmail.com",
  ...extra,
});

async function openAndGetNonce(): Promise<string> {
  await openWebLinkHandshake(NOW);
  return new URL(String(tabsCreateMock.mock.calls[0]?.[0]?.url)).searchParams.get("nonce")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStore.clear();
});

describe("web-link handshake", () => {
  it("buildHandshakeUrl đúng format", () => {
    expect(buildHandshakeUrl("ext-123", "nonce-abc")).toBe(
      `${WEB_ORIGIN}/extension-link?ext=ext-123&nonce=nonce-abc`,
    );
  });

  it("mở tab với runtime.id + nonce, nonce lưu ở storage.session (sống qua SW restart)", async () => {
    await openWebLinkHandshake(NOW);
    expect(String(tabsCreateMock.mock.calls[0]?.[0]?.url)).toContain(
      `${WEB_ORIGIN}/extension-link?ext=test-ext-id&nonce=`,
    );
    expect(await isHandshakePending(NOW)).toBe(true);
  });

  it("nonce hết hạn sau 10 phút", async () => {
    const nonce = await openAndGetNonce();
    expect(await isHandshakePending(NOW + 11 * 60_000)).toBe(false);
    const result = await handleWebAuthMessage(message(nonce), `${WEB_ORIGIN}/extension-link`, NOW + 11 * 60_000);
    expect(result).toEqual({ ok: false, reason: "invalid-nonce" });
  });

  it("origin lạ → từ chối, không lưu", async () => {
    const nonce = await openAndGetNonce();
    const result = await handleWebAuthMessage(message(nonce), "https://evil.example.com/x", NOW);
    expect(result).toEqual({ ok: false, reason: "untrusted-origin" });
    expect(saveAuthSessionMock).not.toHaveBeenCalled();
  });

  it("nonce sai → từ chối", async () => {
    await openAndGetNonce();
    const result = await handleWebAuthMessage(message("sai-nonce"), `${WEB_ORIGIN}/extension-link`, NOW);
    expect(result).toEqual({ ok: false, reason: "invalid-nonce" });
    expect(saveAuthSessionMock).not.toHaveBeenCalled();
  });

  it("hợp lệ → lưu session, đóng nonce (replay bị chặn)", async () => {
    const nonce = await openAndGetNonce();
    const result = await handleWebAuthMessage(message(nonce), `${WEB_ORIGIN}/extension-link`, NOW);

    expect(result).toEqual({ ok: true, email: "user@gmail.com" });
    expect(saveAuthSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "backend-access", email: "user@gmail.com" }),
    );
    expect(await isHandshakePending(NOW)).toBe(false);
    const replay = await handleWebAuthMessage(message(nonce), `${WEB_ORIGIN}/extension-link`, NOW);
    expect(replay).toEqual({ ok: false, reason: "invalid-nonce" });
  });

  it("thiếu accessToken hoặc token đã hết hạn → missing-tokens", async () => {
    const nonce = await openAndGetNonce();
    const origin = `${WEB_ORIGIN}/extension-link`;
    expect(await handleWebAuthMessage(message(nonce, { accessToken: undefined }), origin, NOW)).toEqual({
      ok: false,
      reason: "missing-tokens",
    });
    expect(await handleWebAuthMessage(message(nonce, { expiresAt: NOW - 1 }), origin, NOW)).toEqual({
      ok: false,
      reason: "missing-tokens",
    });
    expect(saveAuthSessionMock).not.toHaveBeenCalled();
  });
});
