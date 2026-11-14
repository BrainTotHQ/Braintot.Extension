/**
 * Test auto-sync (plan spec/24 Task 1): sync nền kích hoạt khi hàng đợi CÓ
 * THÊM link mới (guard theo độ dài — write trạng thái của chính sync không
 * được tái-kích hoạt), drain khi SW dậy lại còn link pending, và in-flight
 * guard gộp các trigger liên tiếp. Thuần logic — không mock wxt/browser.
 */

import { describe, expect, it, vi } from "vitest";

import { createAutoSync, shouldDrainOnStartup, shouldTriggerSync } from "./auto-sync";

const link = (status: string) => ({ id: status, status });
/** Shape thật của storage key braintot:pending-links: Record<id, PendingLink>
 * (queue-store.ts:85) — KHÔNG phải mảng; chrome.storage.onChanged giao đúng
 * Record qua oldValue/newValue (Finding review #1). */
const record = (...links: Array<{ id: string; status: string }>) =>
  // Key theo index — id thật trong production là hash duy nhất, fixture không
  // được tự trùng key (link(status) dùng status làm id sẽ gộp entry).
  Object.fromEntries(links.map((l, i) => [`link-${i}`, l]));

describe("shouldTriggerSync", () => {
  it("trigger khi có link mới được thêm (Record 2→3)", () => {
    expect(
      shouldTriggerSync(record(link("pending"), link("pending")), record(link("pending"), link("pending"), link("pending"))),
    ).toBe(true);
  });

  it("KHÔNG trigger khi cùng số link (write trạng thái của sync)", () => {
    expect(
      shouldTriggerSync(record(link("pending"), link("pending")), record(link("processing"), link("pending"))),
    ).toBe(false);
  });

  it("KHÔNG trigger khi hàng đợi rút gọn (3→2)", () => {
    expect(
      shouldTriggerSync(record(link("pending"), link("pending"), link("pending")), record(link("pending"), link("pending"))),
    ).toBe(false);
  });

  it("KHÔNG trigger khi giá trị không phải Record (xoá key/null)", () => {
    expect(shouldTriggerSync(undefined, record(link("pending")))).toBe(false);
    expect(shouldTriggerSync(record(link("pending")), undefined)).toBe(false);
    expect(shouldTriggerSync([link("pending")], [link("pending"), link("pending")])).toBe(false);
  });
});

describe("shouldTriggerSync qua onQueueChanged (shape Record end-to-end)", () => {
  it("Record 1→2 qua onQueueChanged → sync chạy", async () => {
    const sync = vi.fn(async () => undefined);
    const auto = createAutoSync({ sync });

    auto.onQueueChanged(record(link("pending")), record(link("pending"), link("pending")));
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
  });

  it("write trạng thái (Record 2→2) qua onQueueChanged → KHÔNG chạy", () => {
    const sync = vi.fn(async () => undefined);
    const auto = createAutoSync({ sync });

    auto.onQueueChanged(record(link("pending"), link("pending")), record(link("processing"), link("pending")));
    expect(sync).not.toHaveBeenCalled();
  });
});

describe("shouldDrainOnStartup", () => {
  it("true khi còn link pending kẹt từ phiên trước", () => {
    expect(shouldDrainOnStartup([link("pending"), link("succeeded")])).toBe(true);
  });

  it("false khi hàng đợi rỗng hoặc mọi link đã xong/lỗi", () => {
    expect(shouldDrainOnStartup([])).toBe(false);
    expect(shouldDrainOnStartup([link("succeeded"), link("failed")])).toBe(false);
    // Ruling review #3: runSync chỉ drive link pending — link kẹt processing
    // cần reset phía backend (extract idempotency chưa verify) → KHÔNG drain
    // để tránh upsert ghi đè status backend mà không xử lý được gì.
    expect(shouldDrainOnStartup([link("processing")])).toBe(true);
  });
});

describe("createAutoSync", () => {
  it("3 trigger liên tiếp trong lúc sync chạy → 1 run + 1 dirty-flag re-run sau settle = 2 lần", async () => {
    let resolveSync!: () => void;
    const sync = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSync = () => resolve(undefined);
        }),
    );
    const auto = createAutoSync({ sync });

    auto.onQueueChanged(record(link("pending")), record(link("pending"), link("pending")));
    auto.onQueueChanged(record(), record(link("pending")));
    auto.onQueueChanged(record(), record(link("pending")));
    expect(sync).toHaveBeenCalledTimes(1);

    resolveSync();
    // Sau settle: 1 lần chạy đầu + 1 lần re-run dirty-flag (trigger bị drop
    // giữa chừng được phục hồi — link lưu giữa chừng không rơi).
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it("sync xong thì trigger tiếp theo chạy được lần nữa", async () => {
    const sync = vi.fn(async () => undefined);
    const auto = createAutoSync({ sync });
    const before = record(link("pending"));
    const after = record(link("pending"), link("pending"));

    auto.onQueueChanged(before, after);
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    auto.onQueueChanged(after, record(link("pending"), link("pending"), link("pending")));
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
  });

  it("drain với mảng không có link pending → 0 lời gọi sync", () => {
    const sync = vi.fn(async () => undefined);
    const auto = createAutoSync({ sync });

    auto.drain([link("succeeded"), link("failed")]);
    expect(sync).not.toHaveBeenCalled();
  });

  it("drain khi còn link pending → gọi sync 1 lần", async () => {
    const sync = vi.fn(async () => undefined);
    const auto = createAutoSync({ sync });

    auto.drain([link("pending"), link("succeeded")]);
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
  });
});
