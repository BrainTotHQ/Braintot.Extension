/**
 * Test sync-engine (spec/61, server-first): đẩy link `pending` bằng POST /pending-links,
 * rồi GET /pending-links và gộp vào cache, server thắng.
 * Mock: backend-auth (token) + fetch. QueueStore dùng THẬT với KV in-memory.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KV } from "./queue-store";
import { QueueStore } from "./queue-store";
import { syncQueue } from "./sync-engine";

const getIdTokenMock = vi.hoisted(() => vi.fn());
const isSyncAvailableMock = vi.hoisted(() => vi.fn(() => true));
const initBackendAuthMock = vi.hoisted(() => vi.fn(async () => {}));
const isAuthExpiredMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("./backend-auth", () => ({
  getIdToken: getIdTokenMock,
  isSyncAvailable: isSyncAvailableMock,
  initBackendAuth: initBackendAuthMock,
  isAuthExpired: isAuthExpiredMock,
}));

const KEY = "braintot:pending-links";

const memKV = (initial: Record<string, unknown> = {}): KV & { bag: Record<string, unknown> } => {
  const bag: Record<string, unknown> = { ...initial };
  return {
    bag,
    get: async (key: string) => bag[key],
    set: async (key: string, value: unknown) => {
      bag[key] = value;
    },
  };
};

const hex = (n: number): string => n.toString(16).padStart(64, "0");

const link = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: hex(n),
  url: `https://www.youtube.com/watch?v=aaaaaaaaa${String(n).padStart(2, "0")}`,
  platform: "youtube",
  videoId: `aaaaaaaaa${String(n).padStart(2, "0")}`,
  status: "pending",
  savedAt: "2026-11-07T04:45:30.842Z",
  ...overrides,
});

const queueOf = (...links: Array<ReturnType<typeof link>>) => ({
  [KEY]: Object.fromEntries(links.map((item) => [item.id, item])),
});

interface RecordedCall {
  method: string;
  url: string;
  auth: string | null;
  body: unknown;
}

function makeFetch(
  routes: Array<{
    method: string;
    match: RegExp;
    reply: (call: RecordedCall) => { status: number; body?: unknown };
  }>,
) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    const call: RecordedCall = {
      method,
      url: String(input),
      auth,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    for (const route of routes) {
      if (route.method === method && route.match.test(call.url)) {
        const reply = route.reply(call);
        return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
      }
    }
    return new Response("{}", { status: 404 });
  });
  return { fetchMock: fetchMock as unknown as typeof fetch, calls };
}

const asFetch = (mock: unknown): typeof fetch => mock as typeof fetch;

describe("sync-engine (server-first)", () => {
  beforeEach(() => {
    getIdTokenMock.mockReset().mockResolvedValue("token-1");
    isSyncAvailableMock.mockReturnValue(true);
    isAuthExpiredMock.mockReturnValue(false);
  });

  it("(a) đẩy link pending bằng POST rồi GET, doc server thay bản local", async () => {
    const kv = memKV(queueOf(link(1), link(2)));
    const store = new QueueStore(kv);
    const serverDocs = new Map<string, Record<string, unknown>>();
    const { fetchMock, calls } = makeFetch([
      {
        method: "POST",
        match: /\/api\/v1\/pending-links$/,
        reply: (call) => {
          const url = (call.body as { url: string }).url;
          const found = [link(1), link(2)].find((item) => item.url === url)!;
          const doc = { ...found, status: "processing", dispatchedAt: "x", dispatchNonce: "n" };
          serverDocs.set(found.id, doc);
          return { status: 202, body: doc };
        },
      },
      {
        method: "GET",
        match: /\/api\/v1\/pending-links$/,
        reply: () => ({
          status: 200,
          body: {
            links: [...serverDocs.values()].map((doc) => ({ ...doc, status: "succeeded", processedAt: "2026-11-07T05:00:00.000Z" })),
          },
        }),
      },
    ]);

    const result = await syncQueue({ store, fetchImpl: fetchMock });

    expect(result).toEqual({ ok: true, pushed: 2, processed: 2, failed: 0 });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    expect(calls.every((c) => c.auth === "Bearer token-1")).toBe(true);
    const stored = await store.listQueue();
    expect(stored.map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
    // Field nội bộ của backend không rò vào cache.
    expect(JSON.stringify(stored)).not.toContain("dispatchNonce");
  });

  it("(b) link tạo trên web (không có local) được kéo về", async () => {
    const store = new QueueStore(memKV({}));
    const webLink = link(7, { status: "succeeded", processedAt: "2026-11-07T05:00:00.000Z" });
    const { fetchMock, calls } = makeFetch([
      { method: "GET", match: /\/pending-links$/, reply: () => ({ status: 200, body: { links: [webLink] } }) },
    ]);

    const result = await syncQueue({ store, fetchImpl: fetchMock });

    expect(result).toEqual({ ok: true, pushed: 0, processed: 1, failed: 0 });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect((await store.listQueue()).map((item) => item.id)).toEqual([hex(7)]);
  });

  it("(c) link đã xoá trên web bị bỏ khỏi cache; link pending chưa gửi và INVALID_URL được giữ", async () => {
    const gone = link(1, { status: "succeeded" });
    const keepPending = link(2);
    const invalid = link(3, { status: "failed", failureReason: "INVALID_URL" });
    const store = new QueueStore(memKV(queueOf(gone, keepPending, invalid)));
    const { fetchMock } = makeFetch([
      { method: "POST", match: /\/pending-links$/, reply: () => ({ status: 503 }) },
      { method: "GET", match: /\/pending-links$/, reply: () => ({ status: 200, body: { links: [] } }) },
    ]);

    // POST lỗi 503 → unreachable, không đụng cache.
    expect(await syncQueue({ store, fetchImpl: fetchMock })).toEqual({ ok: false, reason: "unreachable" });
    expect((await store.listQueue()).length).toBe(3);

    // Không còn link pending để gửi → kéo về: link succeeded bị bỏ, còn lại giữ.
    const store2 = new QueueStore(memKV(queueOf(gone, invalid)));
    expect(await syncQueue({ store: store2, fetchImpl: fetchMock })).toEqual({ ok: true, pushed: 0, processed: 0, failed: 0 });
    expect((await store2.listQueue()).map((item) => item.id)).toEqual([hex(3)]);
  });

  it("(d) backend từ chối link (400 INVALID_URL) → đánh dấu failed local, không gửi lại", async () => {
    const store = new QueueStore(memKV(queueOf(link(1))));
    const { fetchMock, calls } = makeFetch([
      {
        method: "POST",
        match: /\/pending-links$/,
        reply: () => ({ status: 400, body: { detail: { error_code: "INVALID_URL", message: "x" } } }),
      },
      { method: "GET", match: /\/pending-links$/, reply: () => ({ status: 200, body: { links: [] } }) },
    ]);

    const result = await syncQueue({ store, fetchImpl: fetchMock });

    expect(result).toEqual({ ok: true, pushed: 0, processed: 0, failed: 1 });
    const [stored] = await store.listQueue();
    expect(stored).toMatchObject({ status: "failed", failureReason: "INVALID_URL" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("(e) 401 → refresh token đúng 1 lần rồi thử lại; hết phiên → auth-error", async () => {
    getIdTokenMock.mockImplementation(async (force?: boolean) => (force ? "token-2" : "token-1"));
    const store = new QueueStore(memKV(queueOf(link(1))));
    const { fetchMock, calls } = makeFetch([
      {
        method: "POST",
        match: /\/pending-links$/,
        reply: (call) =>
          call.auth === "Bearer token-2"
            ? { status: 202, body: { ...link(1), status: "processing" } }
            : { status: 401 },
      },
      { method: "GET", match: /\/pending-links$/, reply: () => ({ status: 200, body: { links: [{ ...link(1), status: "processing" }] } }) },
    ]);
    expect(await syncQueue({ store, fetchImpl: fetchMock })).toMatchObject({ ok: true, pushed: 1 });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.auth)).toEqual(["Bearer token-1", "Bearer token-2"]);

    // Access token backend không refresh được (null) → 401 giữ nguyên → auth-error.
    getIdTokenMock.mockImplementation(async (force?: boolean) => (force ? null : "token-1"));
    const store2 = new QueueStore(memKV(queueOf(link(1))));
    const always401 = makeFetch([{ method: "POST", match: /\/pending-links$/, reply: () => ({ status: 401 }) }]);
    expect(await syncQueue({ store: store2, fetchImpl: always401.fetchMock })).toEqual({ ok: false, reason: "auth-error" });
  });

  it("(f) mất mạng → unreachable, cache không đổi", async () => {
    const kv = memKV(queueOf(link(1)));
    const store = new QueueStore(kv);
    const before = JSON.stringify(kv.bag[KEY]);
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    expect(await syncQueue({ store, fetchImpl: asFetch(fetchMock) })).toEqual({ ok: false, reason: "unreachable" });
    expect(JSON.stringify(kv.bag[KEY])).toBe(before);
  });

  it("(g) token backend hết hạn → auth-error, không gọi mạng", async () => {
    isAuthExpiredMock.mockReturnValue(true);
    const store = new QueueStore(memKV(queueOf(link(1))));
    const fetchMock = vi.fn();

    expect(await syncQueue({ store, fetchImpl: asFetch(fetchMock) })).toEqual({ ok: false, reason: "auth-error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("(h) chưa có phiên (isSyncAvailable false) → sync-unavailable", async () => {
    isSyncAvailableMock.mockReturnValue(false);
    const store = new QueueStore(memKV({}));
    expect(await syncQueue({ store, fetchImpl: asFetch(vi.fn()) })).toEqual({ ok: false, reason: "sync-unavailable" });
  });

  it("(i) 2 syncQueue chạy đồng thời → dồn về 1 chu trình (single-flight)", async () => {
    const store = new QueueStore(memKV({}));
    const { fetchMock, calls } = makeFetch([
      { method: "GET", match: /\/pending-links$/, reply: () => ({ status: 200, body: { links: [] } }) },
    ]);

    const [first, second] = await Promise.all([
      syncQueue({ store, fetchImpl: fetchMock }),
      syncQueue({ store, fetchImpl: fetchMock }),
    ]);

    expect(first).toEqual(second);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });
});
