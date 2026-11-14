/**
 * Auto-sync nền (spec/24, đổi theo spec/61 server-first): trigger khi hàng đợi có THÊM link
 * mới (guard theo SỐ LINK trong Record storage; write của chính sync giữ nguyên số key nên không
 * tái-kích hoạt, không loop vô hạn qua storage.onChanged). SW dậy lại thì sync nếu còn link
 * `pending` (chưa gửi) hoặc `processing` (cần kéo trạng thái từ server về). In-flight guard gộp
 * trigger liên tiếp, dirty-flag chạy lại sau settle để link lưu giữa chừng không bị rơi;
 * sync-engine còn có single-flight riêng (activeSync) là lớp 2.
 */

/** Số link trong giá trị storage: Record<id, PendingLink> (queue-store.ts:85)
 * — chrome.storage.onChanged giao đúng Record qua oldValue/newValue. Giá trị
 * không phải Record (key bị xoá → undefined, shape lạ) → null = không so được. */
const countLinks = (value: unknown): number | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.keys(value).length
    : null;

export function shouldTriggerSync(oldValue: unknown, newValue: unknown): boolean {
  const before = countLinks(oldValue);
  const after = countLinks(newValue);
  return before !== null && after !== null && after > before;
}

export function shouldDrainOnStartup(items: unknown[]): boolean {
  if (!Array.isArray(items)) return false;
  return items.some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      ["pending", "processing"].includes((item as { status?: string }).status ?? ""),
  );
}

export interface AutoSync {
  onQueueChanged: (oldValue: unknown, newValue: unknown) => void;
  drain: (items: unknown[]) => void;
}

export function createAutoSync(deps: { sync: () => Promise<unknown> }): AutoSync {
  let inFlight = false;
  /** Trigger bị bỏ qua trong lúc sync chạy — chạy lại sau khi settle để link
   * lưu giữa chừng không bị rơi (syncQueue idempotent nên chạy lại an toàn). */
  let droppedWhileBusy = false;

  const runOnce = (): void => {
    if (inFlight) {
      droppedWhileBusy = true;
      return;
    }
    inFlight = true;
    void deps.sync()
      .catch(() => {
        /* sync tự trả SyncNowResponse lỗi — chỉ chặn unhandled rejection */
      })
      .finally(() => {
        inFlight = false;
        if (droppedWhileBusy) {
          droppedWhileBusy = false;
          runOnce();
        }
      });
  };

  return {
    onQueueChanged: (oldValue, newValue) => {
      if (!shouldTriggerSync(oldValue, newValue)) return;
      runOnce();
    },
    drain: (items) => {
      if (!shouldDrainOnStartup(items)) return;
      runOnce();
    },
  };
}
