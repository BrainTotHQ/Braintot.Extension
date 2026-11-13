import { describe, expect, it } from "vitest";

import { canTransition, PENDING_LINK_TRANSITIONS, type PendingLinkStatus } from "./pending-link";

describe("PendingLink state machine", () => {
  it("cho phép luồng chuẩn: pending → processing → succeeded", () => {
    expect(canTransition("pending", "processing")).toBe(true);
    expect(canTransition("processing", "succeeded")).toBe(true);
  });

  it("cho phép thất bại rồi thử lại: processing → failed → pending", () => {
    expect(canTransition("processing", "failed")).toBe(true);
    expect(canTransition("failed", "pending")).toBe(true);
  });

  it("cấm mọi nhảy cóc khác (pending không tự thành succeeded)", () => {
    expect(canTransition("pending", "succeeded")).toBe(false);
    expect(canTransition("pending", "failed")).toBe(false);
    expect(canTransition("succeeded", "pending")).toBe(false);
    expect(canTransition("failed", "succeeded")).toBe(false);
  });

  it("bảng chuyển tiếp không chứa trạng thái lạ", () => {
    const statuses: PendingLinkStatus[] = ["pending", "processing", "succeeded", "failed"];
    for (const [from, targets] of Object.entries(PENDING_LINK_TRANSITIONS)) {
      expect(statuses).toContain(from as PendingLinkStatus);
      for (const to of targets) expect(statuses).toContain(to);
    }
  });

  it("pendingLinkId ổn định và khác nhau giữa 2 URL khác nhau", async () => {
    const { pendingLinkId } = await import("./pending-link");
    const a = await pendingLinkId("https://www.youtube.com/watch?v=xsFgrZdomDQ");
    const b = await pendingLinkId("https://www.youtube.com/watch?v=xsFgrZdomDQ");
    const c = await pendingLinkId("https://www.youtube.com/watch?v=AAAAAAAAAAA");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
