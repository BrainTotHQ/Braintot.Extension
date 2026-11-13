import { describe, expect, it } from "vitest";

import { createMockProcessor, mockOutcome } from "./mock-processor";
import { QueueStore, type KV } from "./queue-store";

// jsdom không cần: Node có crypto.subtle toàn cục.
function memoryKV(): KV {
  const data = new Map<string, unknown>();
  return {
    get: async (k) => data.get(k),
    set: async (k, v) => void data.set(k, v),
  };
}

const capture = (videoId: string) => ({
  platform: "youtube" as const,
  videoId,
  canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
});

describe("mock processor", () => {
  it("mockOutcome: videoId kết thúc 0 thì failed", () => {
    expect(mockOutcome({ videoId: "abc0" })).toBe("failed");
    expect(mockOutcome({ videoId: "abc1" })).toBe("succeeded");
  });

  it("pending -> processing -> succeeded", async () => {
    const store = new QueueStore(memoryKV());
    const { link } = await store.saveCapture(capture("dQw4w9WgXcQ"));
    const seen: string[] = [];
    const proc = createMockProcessor(store, {
      wait: async () => {
        seen.push((await store.listQueue())[0]!.status);
      },
    });
    await proc.processLink(link);
    expect(seen).toEqual(["pending", "processing"]);
    const [final] = await store.listQueue();
    expect(final?.status).toBe("succeeded");
    expect(final?.processedAt).toBeTruthy();
  });

  it("videoId kết thúc 0 thì failed NO_SPEECH", async () => {
    const store = new QueueStore(memoryKV());
    const { link } = await store.saveCapture(capture("abcdefghij0"));
    await createMockProcessor(store, { wait: async () => {} }).processLink(link);
    const [final] = await store.listQueue();
    expect(final?.status).toBe("failed");
    expect(final?.failureReason).toBe("NO_SPEECH");
  });

  it("drain xử lý mọi link chưa xong", async () => {
    const store = new QueueStore(memoryKV());
    await store.saveCapture(capture("aaaaaaaaaa1"));
    await store.saveCapture(capture("bbbbbbbbbb2"));
    await createMockProcessor(store, { wait: async () => {} }).drain();
    const list = await store.listQueue();
    expect(list.map((l) => l.status)).toEqual(["succeeded", "succeeded"]);
  });
});
