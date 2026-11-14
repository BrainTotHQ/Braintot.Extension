/**
 * Test queue-api (spec/61): GET/POST/DELETE /pending-links, map doc backend → PendingLink.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getIdTokenMock = vi.hoisted(() => vi.fn());
vi.mock("./backend-auth", () => ({ getIdToken: getIdTokenMock }));

import { deleteRemoteLink, fetchRemoteLinks, submitRemoteLink, toPendingLink } from "./queue-api";

const doc = {
  id: "a".repeat(64),
  url: "https://www.tiktok.com/@creator/video/7301234567890123456",
  platform: "tiktok",
  videoId: "tt_7301234567890123456",
  status: "succeeded",
  savedAt: "2026-11-07T04:45:30.842Z",
  processedAt: "2026-11-07T04:46:10.000Z",
  failureReason: null,
  dispatchedAt: "2026-11-07T04:45:31.000Z",
  dispatchNonce: "secret-nonce",
  callbackClaimedAt: null,
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });
const asFetch = (mock: unknown): typeof fetch => mock as typeof fetch;

beforeEach(() => {
  getIdTokenMock.mockReset().mockResolvedValue("tok");
});

describe("toPendingLink", () => {
  it("giữ field của extension, bỏ field nội bộ và null", () => {
    expect(toPendingLink(doc)).toEqual({
      id: doc.id,
      url: doc.url,
      platform: "tiktok",
      videoId: "tt_7301234567890123456",
      status: "succeeded",
      savedAt: doc.savedAt,
      processedAt: doc.processedAt,
    });
  });

  it("doc thiếu field hoặc sai kiểu → null", () => {
    expect(toPendingLink({ ...doc, platform: "instagram" })).toBeNull();
    expect(toPendingLink({ ...doc, status: "weird" })).toBeNull();
    expect(toPendingLink({ id: 1 })).toBeNull();
  });
});

describe("fetchRemoteLinks", () => {
  it("200 → danh sách đã map, doc lạ bị bỏ qua", async () => {
    const fetchMock = vi.fn(async () => json(200, { links: [doc, { id: "x" }, null] }));
    const result = await fetchRemoteLinks(asFetch(fetchMock));
    expect(result.ok && result.value).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/pending-links$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("401 → auth-error; 500 hoặc body lạ → unreachable; mất mạng → unreachable", async () => {
    getIdTokenMock.mockResolvedValue("tok");
    expect(await fetchRemoteLinks(asFetch(vi.fn(async () => json(401, {}))))).toEqual({ ok: false, reason: "auth-error" });
    expect(await fetchRemoteLinks(asFetch(vi.fn(async () => json(500, {}))))).toEqual({ ok: false, reason: "unreachable" });
    expect(await fetchRemoteLinks(asFetch(vi.fn(async () => json(200, { links: "nope" }))))).toEqual({ ok: false, reason: "unreachable" });
    expect(
      await fetchRemoteLinks(
        asFetch(
          vi.fn(async () => {
            throw new TypeError("offline");
          }),
        ),
      ),
    ).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("submitRemoteLink", () => {
  it("202 → doc đã map; body gửi đúng { url }", async () => {
    const fetchMock = vi.fn(async () => json(202, { ...doc, status: "processing" }));
    const result = await submitRemoteLink(doc.url, asFetch(fetchMock));
    expect(result).toMatchObject({ ok: true, value: { status: "processing", id: doc.id } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ url: doc.url });
  });

  it("400 INVALID_URL → rejected kèm errorCode", async () => {
    const result = await submitRemoteLink("x", asFetch(vi.fn(async () => json(400, { detail: { error_code: "INVALID_URL" } }))));
    expect(result).toEqual({ ok: false, reason: "rejected", errorCode: "INVALID_URL" });
  });
});

describe("deleteRemoteLink", () => {
  it("204 và 404 đều coi như đã xoá; 500 → unreachable; 401 → auth-error", async () => {
    expect(await deleteRemoteLink(doc.id, asFetch(vi.fn(async () => new Response(null, { status: 204 }))))).toEqual({ ok: true, value: null });
    expect(await deleteRemoteLink(doc.id, asFetch(vi.fn(async () => json(404, {}))))).toEqual({ ok: true, value: null });
    expect(await deleteRemoteLink(doc.id, asFetch(vi.fn(async () => json(500, {}))))).toEqual({ ok: false, reason: "unreachable" });
    expect(await deleteRemoteLink(doc.id, asFetch(vi.fn(async () => json(401, {}))))).toEqual({ ok: false, reason: "auth-error" });
  });
});
