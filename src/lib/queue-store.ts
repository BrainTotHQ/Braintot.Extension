/**
 * Hàng đợi pending link trên chrome.storage.local — inject KV để test chạy với
 * KV in-memory, không cần browser. Idempotent theo canonical URL: key là
 * pendingLinkId(canonicalUrl), lưu 2 lần cùng link → saved:false và trả link
 * CŨ (savedAt không đổi). Queue v1 chỉ tạo link "pending", không chuyển trạng
 * thái nên không đụng canTransition.
 */

import { pendingLinkId, type PendingLink } from "../domain/pending-link";
import type { CanonicalCapture } from "../domain/url-canonicalizer";

/** Key storage duy nhất của queue: Record<pendingLinkId, PendingLink>. */
export const STORAGE_KEY = "braintot:pending-links";

/** Trừu tượng storage tối giản (runtime: chrome.storage.local bọc trong background). */
export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export class QueueStore {
  private readonly kv: KV;

  /**
   * Đuôi chuỗi promise tuần tự hóa phần ghi của saveCapture TRONG instance —
   * chặn race read-then-write khi 2 lệnh save chạy song song (2 lần gọi không
   * await). MV3 event loop vẫn interleaved giữa các context (background ↔
   * popup dùng 2 instance), chấp nhận cho v1 (backlog: route popup qua
   * background).
   */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(kv: KV) {
    this.kv = kv;
  }

  /** Đọc toàn bộ record — storage rỗng/méo hình (queue là writer duy nhất) → rỗng. */
  private async readAll(): Promise<Record<string, PendingLink>> {
    const raw = await this.kv.get(STORAGE_KEY);
    if (typeof raw !== "object" || raw === null) return {};
    return raw as Record<string, PendingLink>;
  }

  /** Danh sách link, mới nhất trước (savedAt desc — ISO string so được bằng string). */
  async listQueue(): Promise<PendingLink[]> {
    return Object.values(await this.readAll()).sort((a, b) =>
      b.savedAt.localeCompare(a.savedAt)
    );
  }

  /** Số link hiện có trong hàng đợi. */
  async queueCount(): Promise<number> {
    return Object.keys(await this.readAll()).length;
  }

  /**
   * Lưu một capture — idempotent: id = pendingLinkId(canonicalUrl) làm key;
   * đã tồn tại → saved:false + link cũ giữ nguyên savedAt. Link mới luôn
   * status "pending", savedAt = now.toISOString() (mặc định bây giờ).
   *
   * Phần read-then-write chạy qua chuỗi `tail` (mutex promise trong instance):
   * mỗi lệnh gọi nối vào đuôi, cả nhánh thành công lẫn lỗi đều nhường nhiệm vụ
   * sau chạy tiếp (chuẩn catch-chain — 1 lỗi không kẹt vĩnh viễn các lệnh sau).
   */
  saveCapture(
    c: CanonicalCapture,
    now: Date = new Date()
  ): Promise<{ saved: boolean; link: PendingLink }> {
    const doWork = async (): Promise<{ saved: boolean; link: PendingLink }> => {
      const id = await pendingLinkId(c.canonicalUrl);
      const record = await this.readAll();

      const existing = record[id];
      if (existing) return { saved: false, link: existing };

      const link: PendingLink = {
        id,
        url: c.canonicalUrl,
        platform: c.platform,
        videoId: c.videoId,
        status: "pending",
        savedAt: now.toISOString(),
      };
      record[id] = link;
      await this.kv.set(STORAGE_KEY, record);
      return { saved: true, link };
    };

    const run = this.tail.then(doWork, doWork);
    this.tail = run;
    return run;
  }

  /**
   * Gộp danh sách từ server vào cache (spec/61): SERVER THẮNG. Link có trên server lấy bản
   * server (trạng thái từ AI, link tạo trên web); link local KHÔNG còn trên server bị bỏ (đã xoá
   * trên web) trừ link chưa kịp gửi (`pending`) và link bị backend từ chối INVALID_URL
   * (chỉ tồn tại local để người dùng thấy lỗi).
   */
  async replaceFromServer(remote: PendingLink[]): Promise<void> {
    const doWork = async (): Promise<void> => {
      const local = await this.readAll();
      const next: Record<string, PendingLink> = {};
      for (const link of remote) next[link.id] = link;
      for (const link of Object.values(local)) {
        if (link.id in next) continue;
        const keep =
          link.status === "pending" ||
          (link.status === "failed" && link.failureReason === "INVALID_URL");
        if (keep) next[link.id] = link;
      }
      await this.kv.set(STORAGE_KEY, next);
    };
    const run = this.tail.then(doWork, doWork);
    this.tail = run;
    return run;
  }

  /** Xoá một link khỏi cache (sau khi xoá thành công trên server, hoặc link chỉ có local). */
  async removeLink(id: string): Promise<void> {
    const doWork = async (): Promise<void> => {
      const record = await this.readAll();
      if (!(id in record)) return;
      delete record[id];
      await this.kv.set(STORAGE_KEY, record);
    };
    const run = this.tail.then(doWork, doWork);
    this.tail = run;
    return run;
  }

  /**
   * Cập nhật một link có sẵn (status/processedAt/failureReason sau sync) —
   * dùng cùng hàng đợi tail với saveCapture để hai nguồn ghi không đè nhau.
   */
  async updateLink(updated: PendingLink): Promise<void> {
    const doWork = async (): Promise<void> => {
      const record = await this.readAll();
      if (!(updated.id in record)) return; // đã bị xóa ở nơi khác — bỏ qua
      record[updated.id] = updated;
      await this.kv.set(STORAGE_KEY, record);
    };
    const run = this.tail.then(doWork, doWork);
    this.tail = run;
    return run;
  }
}
