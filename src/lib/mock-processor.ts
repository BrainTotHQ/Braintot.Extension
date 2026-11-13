/**
 * Bộ xử lý giả lập cho bản DevFest: thay backend + AI engine thật.
 * Vòng đời: pending -> processing -> succeeded (hoặc failed với mã lỗi cố định
 * theo videoId, để demo cả hai nhánh). Mỗi bước chờ một khoảng trễ để UI thấy
 * được trạng thái chuyển. Không gọi mạng.
 */

import type { PendingLink } from "../domain/pending-link";

import type { QueueStore } from "./queue-store";

export interface MockProcessorOptions {
  /** Chờ trước khi chuyển pending -> processing (ms). */
  startDelayMs?: number;
  /** Chờ trước khi chuyển processing -> kết quả (ms). */
  finishDelayMs?: number;
  wait?: (ms: number) => Promise<void>;
}

const DEFAULT_START_MS = 1_500;
const DEFAULT_FINISH_MS = 3_500;

/** Quy tắc demo xác định: videoId kết thúc bằng "0" thì thất bại NO_SPEECH. */
export function mockOutcome(link: Pick<PendingLink, "videoId">): "succeeded" | "failed" {
  return link.videoId.endsWith("0") ? "failed" : "succeeded";
}

export function createMockProcessor(store: QueueStore, options: MockProcessorOptions = {}) {
  const startDelay = options.startDelayMs ?? DEFAULT_START_MS;
  const finishDelay = options.finishDelayMs ?? DEFAULT_FINISH_MS;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const inFlight = new Set<string>();

  async function processLink(link: PendingLink): Promise<void> {
    if (inFlight.has(link.id)) return;
    inFlight.add(link.id);
    try {
      let current = link;
      if (current.status === "pending") {
        await wait(startDelay);
        current = { ...current, status: "processing" };
        await store.updateLink(current);
      }
      if (current.status !== "processing") return;
      await wait(finishDelay);
      await store.updateLink(
        mockOutcome(current) === "succeeded"
          ? { ...current, status: "succeeded", processedAt: new Date().toISOString() }
          : { ...current, status: "failed", failureReason: "NO_SPEECH" },
      );
    } finally {
      inFlight.delete(link.id);
    }
  }

  /** Xử lý mọi link chưa xong (pending/processing). Gọi khi SW dậy hoặc khi queue đổi. */
  async function drain(): Promise<void> {
    const items = await store.listQueue();
    await Promise.all(
      items.filter((l) => l.status === "pending" || l.status === "processing").map(processLink),
    );
  }

  return { processLink, drain };
}
