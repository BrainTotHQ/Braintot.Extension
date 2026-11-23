/**
 * Test backend-auth (spec/62): phiên access token backend, không còn Anonymous/Firebase.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageData = vi.hoisted(() => new Map<string, unknown>());

vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const bag: Record<string, unknown> = {};
          for (const k of list) if (storageData.has(k)) bag[k] = storageData.get(k);
          return bag;
        }),
        set: vi.fn(async (bag: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(bag)) storageData.set(k, v);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) storageData.delete(k);
        }),
      },
    },
  },
}));

const HOUR = 3_600_000;

/** JWT giả chỉ cần payload có `sub`. */
function jwtFor(uid: string): string {
  const payload = btoa(JSON.stringify({ sub: uid })).replace(/=+$/, "");
  return `h.${payload}.s`;
}

const session = (uid: string, expiresAt = Date.now() + 12 * HOUR) => ({
  accessToken: jwtFor(uid),
  email: `${uid}@gmail.com`,
  expiresAt,
  uid,
});

async function load() {
  vi.resetModules();
  return import("./backend-auth");
}

beforeEach(() => storageData.clear());

describe("backend-auth", () => {
  it("chưa có phiên → unlinked, getIdToken null, không sync", async () => {
    const auth = await load();
    await auth.initBackendAuth();
    expect(auth.getLinkStatus()).toBe("unlinked");
    expect(auth.isSyncAvailable()).toBe(false);
    expect(await auth.getIdToken()).toBeNull();
  });

  it("nạp phiên từ storage (sống qua restart SW) → linked, trả token, email, uid", async () => {
    const s = session("u1");
    storageData.set("braintot:auth-session", s);
    const auth = await load();
    await auth.initBackendAuth();
    expect(auth.getLinkStatus()).toBe("linked");
    expect(await auth.getIdToken()).toBe(s.accessToken);
    expect(auth.getAuthEmail()).toBe("u1@gmail.com");
    expect(auth.getAuthUid()).toBe("u1");
  });

  it("token hết hạn → expired, getIdToken null; forceRefresh cũng null (chưa có refresh)", async () => {
    storageData.set("braintot:auth-session", session("u1", Date.now() - 1000));
    const auth = await load();
    await auth.initBackendAuth();
    expect(auth.getLinkStatus()).toBe("expired");
    expect(auth.isAuthExpired()).toBe(true);
    expect(await auth.getIdToken()).toBeNull();
    expect(await auth.getIdToken(true)).toBeNull();
  });

  it("khoá cũ braintot:auth-google (Firebase token) bị xoá, coi như chưa liên kết", async () => {
    storageData.set("braintot:auth-google", { idToken: "x", refreshToken: "y", email: "a@b.c" });
    const auth = await load();
    await auth.initBackendAuth();
    expect(auth.getLinkStatus()).toBe("unlinked");
    expect(storageData.has("braintot:auth-google")).toBe(false);
  });

  it("dữ liệu storage sai hình → unlinked, không ném", async () => {
    storageData.set("braintot:auth-session", { accessToken: 5 });
    const auth = await load();
    await auth.initBackendAuth();
    expect(auth.getLinkStatus()).toBe("unlinked");
  });

  it("uid suy ra từ claim sub khi message không kèm uid", async () => {
    const auth = await load();
    const parsed = auth.parseAuthSession({ accessToken: jwtFor("u9"), expiresAt: 1 });
    expect(parsed?.uid).toBe("u9");
    expect(auth.uidFromIdToken("rác")).toBeNull();
  });

  it("signOut xoá phiên và cache hàng đợi local của tài khoản cũ", async () => {
    storageData.set("braintot:auth-session", session("u1"));
    storageData.set("braintot:pending-links", { a: { id: "a" } });
    const auth = await load();
    await auth.initBackendAuth();
    await auth.signOut();
    expect(auth.getLinkStatus()).toBe("unlinked");
    expect(storageData.has("braintot:auth-session")).toBe(false);
    expect(storageData.has("braintot:pending-links")).toBe(false);
  });

  it("saveAuthSession đổi sang uid khác thì xoá cache hàng đợi cũ, cùng uid thì giữ nguyên", async () => {
    storageData.set("braintot:auth-session", session("u1"));
    storageData.set("braintot:pending-links", { a: { id: "a" } });
    const auth = await load();
    await auth.initBackendAuth();

    await auth.saveAuthSession(session("u1", Date.now() + 24 * HOUR));
    expect(storageData.has("braintot:pending-links")).toBe(true);

    await auth.saveAuthSession(session("u2"));
    expect(storageData.has("braintot:pending-links")).toBe(false);
  });
});

describe("adoptAuthSession (content script web-session)", () => {
  it("chưa liên kết → nhận và lưu", async () => {
    const auth = await load();
    expect(await auth.adoptAuthSession(session("u1"))).toBe(true);
    expect(auth.getLinkStatus()).toBe("linked");
    expect(storageData.has("braintot:auth-session")).toBe(true);
  });

  it("token đã hết hạn → bỏ qua", async () => {
    const auth = await load();
    expect(await auth.adoptAuthSession(session("u1", Date.now() - 1))).toBe(false);
    expect(auth.getLinkStatus()).toBe("unlinked");
  });

  it("cùng uid, token mới hơn → gia hạn", async () => {
    storageData.set("braintot:auth-session", session("u1", Date.now() + 2 * HOUR));
    const auth = await load();
    const fresh = session("u1", Date.now() + 12 * HOUR);
    expect(await auth.adoptAuthSession(fresh)).toBe(true);
    expect((storageData.get("braintot:auth-session") as { accessToken: string }).accessToken).toBe(
      fresh.accessToken,
    );
  });

  it("đang liên kết tài khoản KHÁC → không tự đổi", async () => {
    storageData.set("braintot:auth-session", session("u1"));
    const auth = await load();
    expect(await auth.adoptAuthSession(session("u2"))).toBe(false);
    expect(auth.getAuthUid()).toBe("u1");
  });

  it("phiên cũ đã hết hạn + web đang ở tài khoản khác → nhận tài khoản mới", async () => {
    storageData.set("braintot:auth-session", session("u1", Date.now() - 1000));
    const auth = await load();
    expect(await auth.adoptAuthSession(session("u2"))).toBe(true);
    expect(auth.getAuthUid()).toBe("u2");
  });
});
