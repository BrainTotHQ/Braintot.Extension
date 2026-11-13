import { describe, expect, it } from "vitest";

import { pendingLinkId } from "../domain/pending-link";
import { normalizeCaptureUrl, type CanonicalCapture } from "../domain/url-canonicalizer";

import { QueueStore, type KV } from "./queue-store";

/** KV in-memory tối giản — thay chrome.storage.local trong test, không mock browser. */
function createMemoryKV(): KV {
  const data = new Map<string, unknown>();
  return {
    async get(key: string): Promise<unknown> {
      return data.get(key);
    },
    async set(key: string, value: unknown): Promise<void> {
      data.set(key, value);
    },
  };
}

/** Chuẩn hóa URL fixture — fail ngay khi URL test sai. */
function capture(url: string): CanonicalCapture {
  const result = normalizeCaptureUrl(url);
  if (!result) throw new Error(`Fixture URL không hợp lệ: ${url}`);
  return result;
}

describe("QueueStore", () => {
  it("lưu link mới → saved:true, status pending, count = 1", async () => {
    const store = new QueueStore(createMemoryKV());

    const { saved, link } = await store.saveCapture(
      capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      new Date("2026-01-01T00:00:00Z")
    );

    expect(saved).toBe(true);
    expect(link.status).toBe("pending");
    expect(link.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link.platform).toBe("youtube");
    expect(link.videoId).toBe("dQw4w9WgXcQ");
    expect(link.savedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(link.id).toBe(
      await pendingLinkId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    );
    expect(await store.queueCount()).toBe(1);
  });

  it("lưu trùng canonicalUrl (URL thô khác, now khác) → saved:false, savedAt giữ nguyên", async () => {
    const store = new QueueStore(createMemoryKV());
    const first = await store.saveCapture(
      capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      new Date("2026-01-01T00:00:00Z")
    );

    // Cùng video, URL thô khác + time khác → canonical URL trùng → idempotent.
    const second = await store.saveCapture(
      capture("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=spam"),
      new Date("2026-06-15T12:00:00Z")
    );

    expect(second.saved).toBe(false);
    expect(second.link).toEqual(first.link);
    expect(second.link.savedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(await store.queueCount()).toBe(1);
  });

  it("listQueue sort savedAt desc — lưu 3 link với now tăng dần, thứ tự đảo", async () => {
    const store = new QueueStore(createMemoryKV());
    await store.saveCapture(
      capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      new Date("2026-01-01T00:00:00Z")
    );
    await store.saveCapture(
      capture("https://www.tiktok.com/@creator/video/1234567890123456789"),
      new Date("2026-01-02T00:00:00Z")
    );
    await store.saveCapture(
      capture("https://www.facebook.com/reel/9876543210"),
      new Date("2026-01-03T00:00:00Z")
    );

    const list = await store.listQueue();
    expect(list.map((link) => link.platform)).toEqual([
      "facebook_reel",
      "tiktok",
      "youtube",
    ]);
  });

  it("2 link khác nhau → count 2, listQueue đủ 2", async () => {
    const store = new QueueStore(createMemoryKV());
    await store.saveCapture(
      capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      new Date("2026-01-01T00:00:00Z")
    );
    await store.saveCapture(
      capture("https://www.tiktok.com/@creator/video/1234567890123456789"),
      new Date("2026-01-02T00:00:00Z")
    );

    expect(await store.queueCount()).toBe(2);
    const list = await store.listQueue();
    expect(list).toHaveLength(2);
    expect(new Set(list.map((link) => link.id)).size).toBe(2);
  });

  it("ghi đúng storage key braintot:pending-links với shape Record<id, link>", async () => {
    const kv = createMemoryKV();
    const store = new QueueStore(kv);

    const { link } = await store.saveCapture(
      capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      new Date("2026-01-01T00:00:00Z")
    );

    expect(await kv.get("braintot:pending-links")).toEqual({ [link.id]: link });
  });

  it("2 saveCapture chạy song song (không await) — mutex serialize: cả 2 link vào queue, count 2", async () => {
    const store = new QueueStore(createMemoryKV());

    // Không await từng lệnh — cả hai vào cùng lúc, phần ghi tuần tự qua mutex.
    const [first, second] = await Promise.all([
      store.saveCapture(
        capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
        new Date("2026-01-01T00:00:00Z")
      ),
      store.saveCapture(
        capture("https://www.tiktok.com/@creator/video/1234567890123456789"),
        new Date("2026-01-02T00:00:00Z")
      ),
    ]);

    expect(first.saved).toBe(true);
    expect(second.saved).toBe(true);
    expect(await store.queueCount()).toBe(2);
    const list = await store.listQueue();
    expect(new Set(list.map((link) => link.id)).size).toBe(2);
  });

  it("replaceFromServer: server thắng; link đã xoá trên web bị bỏ; pending chưa gửi và INVALID_URL được giữ (spec/61)", async () => {
    const base = { platform: "youtube" as const, videoId: "dQw4w9WgXcQ", savedAt: "2026-01-01T00:00:00.000Z" };
    const kept = { ...base, id: "k".repeat(64), url: "https://a", status: "pending" as const };
    const invalid = { ...base, id: "i".repeat(64), url: "https://b", status: "failed" as const, failureReason: "INVALID_URL" };
    const gone = { ...base, id: "g".repeat(64), url: "https://c", status: "succeeded" as const };
    const stale = { ...base, id: "s".repeat(64), url: "https://d", status: "processing" as const };
    const kv = createMemoryKV();
    await kv.set("braintot:pending-links", Object.fromEntries([kept, invalid, gone, stale].map((link) => [link.id, link])));
    const store = new QueueStore(kv);
    await store.replaceFromServer([
      { ...stale, status: "succeeded", processedAt: "2026-01-01T00:05:00.000Z" },
      { ...base, id: "w".repeat(64), url: "https://web", status: "processing" },
    ]);

    const byId = Object.fromEntries((await store.listQueue()).map((link) => [link.id, link]));
    expect(Object.keys(byId).sort()).toEqual(["i".repeat(64), "k".repeat(64), "s".repeat(64), "w".repeat(64)].sort());
    expect(byId["s".repeat(64)]?.status).toBe("succeeded");
    expect(byId["g".repeat(64)]).toBeUndefined();
  });

  it("removeLink xoá đúng một link và bỏ qua id không tồn tại", async () => {
    const store = new QueueStore(createMemoryKV());
    const { link } = await store.saveCapture(capture("https://www.youtube.com/shorts/dQw4w9WgXcQ"));
    await store.removeLink("không-có");
    expect(await store.queueCount()).toBe(1);
    await store.removeLink(link.id);
    expect(await store.queueCount()).toBe(0);
  });
});
