import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  storageData,
  storageListeners,
  messageListeners,
  setBadgeTextMock,
  setBadgeBackgroundColorMock,
  syncQueueMock,
} = vi.hoisted(() => ({
  storageData: new Map<string, unknown>(),
  storageListeners: new Set<
    (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
  >(),
  messageListeners: new Set<
    (
      message: unknown,
      sender: { url?: string; tab?: { incognito?: boolean } },
    ) => Promise<unknown> | undefined
  >(),
  setBadgeTextMock: vi.fn(async (_details: { text: string }) => {}),
  setBadgeBackgroundColorMock: vi.fn(async (_details: { color: string }) => {}),
  syncQueueMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (cb: () => void) => cb,
}));

vi.mock("wxt/browser", () => ({
  browser: {
    action: {
      setBadgeText: setBadgeTextMock,
      setBadgeBackgroundColor: setBadgeBackgroundColorMock,
    },
    alarms: {
      create: vi.fn(async () => {}),
      onAlarm: { addListener: vi.fn() },
    },
    runtime: {
      onMessage: {
        addListener: vi.fn(
          (
            cb: (
              message: unknown,
              sender: { url?: string; tab?: { incognito?: boolean } },
            ) => Promise<unknown> | undefined,
          ) => {
            messageListeners.add(cb);
          },
        ),
      },
      onMessageExternal: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const bag: Record<string, unknown> = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (storageData.has(key)) bag[key] = storageData.get(key);
          }
          return bag;
        }),
        set: vi.fn(async (bag: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(bag)) storageData.set(k, v);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) storageData.delete(key);
        }),
      },
      onChanged: {
        addListener: vi.fn(
          (
            cb: (
              changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
              areaName: string,
            ) => void,
          ) => {
            storageListeners.add(cb);
          },
        ),
      },
    },
  },
}));

vi.mock("./sync-engine", () => ({
  syncQueue: syncQueueMock,
}));

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const VALID_SESSION = {
  accessToken: "token-u1",
  email: "u1@gmail.com",
  expiresAt: Date.now() + 3_600_000,
  uid: "u1",
};

const SAMPLE_QUEUE = {
  a: { id: "a", status: "succeeded", savedAt: "2026-11-23T00:00:00.000Z" },
  b: { id: "b", status: "succeeded", savedAt: "2026-11-23T00:01:00.000Z" },
};

async function startBackground(): Promise<void> {
  vi.resetModules();
  const mod = await import("../entrypoints/background");
  (mod.default as unknown as () => void)();
  await flushMicrotasks();
}

beforeEach(() => {
  storageData.clear();
  storageListeners.clear();
  messageListeners.clear();
  setBadgeTextMock.mockClear();
  setBadgeBackgroundColorMock.mockClear();
  syncQueueMock.mockClear();
});

describe("background badge theo trạng thái đăng nhập", () => {
  it("khởi động khi chưa đăng nhập → xoá badge dù storage vẫn còn queue cũ", async () => {
    storageData.set("braintot:pending-links", SAMPLE_QUEUE);

    await startBackground();

    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "" });
  });

  it("khởi động khi đã đăng nhập → hiện đúng số link trong hàng đợi", async () => {
    storageData.set("braintot:auth-session", VALID_SESSION);
    storageData.set("braintot:pending-links", SAMPLE_QUEUE);

    await startBackground();

    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "2" });
  });

  it("đăng xuất (xoá braintot:auth-session từ popup) → xoá badge ngay lập tức", async () => {
    storageData.set("braintot:auth-session", VALID_SESSION);
    storageData.set("braintot:pending-links", SAMPLE_QUEUE);
    await startBackground();
    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "2" });

    storageData.delete("braintot:auth-session");
    for (const listener of storageListeners) {
      listener({ "braintot:auth-session": { oldValue: VALID_SESSION, newValue: undefined } }, "local");
    }
    await flushMicrotasks();

    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "" });
  });

  it("liên kết tài khoản mới (ghi braintot:auth-session) → kéo syncQueue cho tài khoản mới", async () => {
    await startBackground();
    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "" });

    storageData.set("braintot:auth-session", VALID_SESSION);
    for (const listener of storageListeners) {
      listener({ "braintot:auth-session": { oldValue: undefined, newValue: VALID_SESSION } }, "local");
    }
    await flushMicrotasks();

    expect(syncQueueMock).toHaveBeenCalledTimes(1);
  });

  it("web đăng xuất (MSG_WEB_SESSION với session: null) → đăng xuất extension, xoá queue và badge", async () => {
    storageData.set("braintot:auth-session", VALID_SESSION);
    storageData.set("braintot:pending-links", SAMPLE_QUEUE);
    await startBackground();
    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "2" });

    const [onMessage] = Array.from(messageListeners);
    const res = await onMessage!(
      { type: "braintot/web-session", session: null },
      { url: "https://quizkard.tonythaniel.com/flashcards", tab: { incognito: false } },
    );

    expect(res).toEqual({ ok: true });
    expect(storageData.has("braintot:auth-session")).toBe(false);
    expect(storageData.has("braintot:pending-links")).toBe(false);
    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "" });
  });

  it("tab ẩn danh (Incognito) hoặc origin lạ gửi session: null → bỏ qua, giữ nguyên phiên", async () => {
    storageData.set("braintot:auth-session", VALID_SESSION);
    storageData.set("braintot:pending-links", SAMPLE_QUEUE);
    await startBackground();
    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "2" });

    const [onMessage] = Array.from(messageListeners);
    const incognitoRes = await onMessage!(
      { type: "braintot/web-session", session: null },
      { url: "https://quizkard.tonythaniel.com/flashcards", tab: { incognito: true } },
    );
    const evilRes = await onMessage!(
      { type: "braintot/web-session", session: null },
      { url: "https://evil.example.com/", tab: { incognito: false } },
    );

    expect(incognitoRes).toEqual({ ok: false });
    expect(evilRes).toEqual({ ok: false });
    expect(storageData.has("braintot:auth-session")).toBe(true);
    expect(storageData.has("braintot:pending-links")).toBe(true);
    expect(setBadgeTextMock).toHaveBeenLastCalledWith({ text: "2" });
  });
});
