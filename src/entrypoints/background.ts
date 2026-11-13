/**
 * Background service worker (bản DevFest): nhận MSG_CAPTURE_SAVE từ content
 * script, re-validate URL bằng domain (không tin sender), lưu qua QueueStore
 * (idempotent theo canonical URL), cập nhật badge, rồi để bộ xử lý giả lập
 * chuyển trạng thái link. Không có đăng nhập hay backend.
 */

import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { normalizeCaptureUrl } from "../domain/url-canonicalizer";
import {
  MSG_CAPTURE_SAVE,
  type CaptureSaveRequest,
  type CaptureSaveResponse,
} from "../lib/messages";
import { createMockProcessor } from "../lib/mock-processor";
import { QueueStore, STORAGE_KEY, type KV } from "../lib/queue-store";

const storageKV: KV = {
  async get(key: string): Promise<unknown> {
    const bag = await browser.storage.local.get(key);
    return bag[key];
  },
  async set(key: string, value: unknown): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
};

const BADGE_COLOR = "#1591F5";

async function updateBadge(count: number): Promise<void> {
  await browser.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await browser.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

function countFromQueueValue(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

async function handleCaptureSave(
  req: CaptureSaveRequest,
  store: QueueStore,
): Promise<CaptureSaveResponse> {
  try {
    const capture = normalizeCaptureUrl(req.url);
    if (!capture) return { ok: false, reason: "invalid-url" };
    const { saved, link } = await store.saveCapture(capture);
    await updateBadge(await store.queueCount());
    return { ok: true, saved, link };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

export default defineBackground(() => {
  const store = new QueueStore(storageKV);
  const processor = createMockProcessor(store);
  const kick = (): void => {
    void processor.drain().catch(() => {
      /* noop: lỗi giả lập không ảnh hưởng capture */
    });
  };

  void store
    .queueCount()
    .then(updateBadge)
    .catch(() => {});
  kick(); // SW dậy lại: xử lý tiếp link còn dở

  // Popup ghi storage trực tiếp nên badge và bộ xử lý theo dõi storage.
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(STORAGE_KEY in changes)) return;
    const change = changes[STORAGE_KEY];
    void updateBadge(countFromQueueValue(change.newValue)).catch(() => {});
    kick(); // idempotent: link dang xu ly duoc bo qua
  });

  browser.runtime.onMessage.addListener(
    (message: unknown): Promise<CaptureSaveResponse> | undefined => {
      if (typeof message !== "object" || message === null) return undefined;
      if ((message as { type?: unknown }).type === MSG_CAPTURE_SAVE) {
        return handleCaptureSave(message as CaptureSaveRequest, store);
      }
      return undefined;
    },
  );
});
