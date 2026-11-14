/**
 * Background service worker: nhận MSG_CAPTURE_SAVE từ content script/popup,
 * re-validate URL bằng domain (KHÔNG tin sender), lưu qua QueueStore
 * (idempotent theo canonical URL) rồi cập nhật badge theo số link trong hàng
 * đợi. Badge đồng bộ với MỌI nguồn ghi (popup ghi storage trực tiếp không qua
 * message) qua storage.onChanged; khởi động SW cũng set lại badge từ storage.
 * Auto-sync nền (spec/24) cắm vào cùng listener + drain lúc startup — thay nút
 * "Đồng bộ & tách câu" của popup. Lỗi storage → { ok: false, "storage-error" }.
 */

import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import {
  adoptAuthSession,
  initBackendAuth,
  isLinked,
  parseAuthSession,
} from "../lib/backend-auth";
import { getWebBaseUrl } from "../lib/backend-config";
import { createAutoSync } from "../lib/auto-sync";
import { normalizeCaptureUrl } from "../domain/url-canonicalizer";
import {
  MSG_CAPTURE_SAVE,
  MSG_LINK_WEB,
  MSG_SYNC_NOW,
  MSG_WEB_SESSION,
  type CaptureSaveRequest,
  type CaptureSaveResponse,
  type LinkWebResponse,
  type SyncNowResponse,
} from "../lib/messages";
import { QueueStore, STORAGE_KEY, type KV } from "../lib/queue-store";
import { syncQueue } from "../lib/sync-engine";
import {
  handleWebAuthMessage,
  openWebLinkHandshake,
  type WebAuthResult,
} from "../lib/web-link";

/**
 * Runtime với onMessageExternal — chỉ trang web trong `externally_connectable`
 * gọi được; validate origin + nonce nằm trong handleWebAuthMessage.
 */
type RuntimeWithExternal = typeof browser.runtime & {
  onMessageExternal: {
    addListener: (
      cb: (
        message: unknown,
        sender: { url?: string },
      ) => Promise<WebAuthResult>,
    ) => void;
  };
};

/**
 * Adapter KV bọc chrome.storage.local — MV3 get/set vốn promise-based, chỉ
 * cần map về interface KV (get phải trả giá trị, không trả cả bag).
 */
const storageKV: KV = {
  async get(key: string): Promise<unknown> {
    const bag = await browser.storage.local.get(key);
    return bag[key];
  },
  async set(key: string, value: unknown): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
};

/** Tên alarm poll trạng thái hàng đợi (spec/61). */
const SYNC_ALARM = "braintot-sync";

/** Màu badge thương hiệu BrainTot. */
const BADGE_COLOR = "#1591F5";

/** Badge hiện số link trong hàng đợi; 0 → text rỗng (ẩn badge). */
async function updateBadge(count: number): Promise<void> {
  await browser.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await browser.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

/**
 * Đếm link từ giá trị mới của key queue (Record<id, link>) — storage rỗng/méo
 * hình hoặc đã bị xóa (newValue undefined) → 0 (badge text rỗng).
 */
function countFromQueueValue(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

/**
 * Xử lý một CaptureSaveRequest: re-validate → save idempotent → badge →
 * response. Mọi exception (kể cả message méo hình) → "storage-error".
 */
async function handleCaptureSave(
  req: CaptureSaveRequest,
  store: QueueStore
): Promise<CaptureSaveResponse> {
  try {
    // 1. Re-validate — nguồn sự thật là domain, không phải content script.
    const capture = normalizeCaptureUrl(req.url);
    if (!capture) return { ok: false, reason: "invalid-url" };

    // 1.5 Chưa liên kết tài khoản web (hoặc phiên hết hạn): không lưu, mở trang đăng nhập (spec/62).
    await initBackendAuth();
    if (!isLinked()) {
      void openWebLinkHandshake().catch(() => {
        /* mở tab lỗi: toast vẫn nhắc người dùng liên kết */
      });
      return { ok: false, reason: "not-linked" };
    }

    // 2. Save (lỗi storage ném exception → nhánh catch bên dưới).
    const { saved, link } = await store.saveCapture(capture);

    // 3. Badge theo count sau save (saved true hay false cũng cập nhật).
    const count = await store.queueCount();
    await updateBadge(count);

    // 3.5 Sync nền sau khi LƯU THÀNH CÔNG (spec 16 T4, server-first spec/61) —
    // fire-and-forget: không chặn response, lỗi sync không bao giờ ảnh hưởng luồng capture.
    // Sync chỉ là vài request ngắn (gửi link + kéo danh sách), AI chạy phía server.
    if (saved) {
      void syncQueue({ store }).catch(() => {
        /* noop — sync lỗi không ảnh hưởng capture */
      });
    }

    // 4. Response đúng contract E2.
    return { ok: true, saved, link };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

/** Nhận session từ content script `web-session`; sai origin / sai hình / hết hạn thì bỏ qua. */
async function handleWebSession(message: unknown, senderUrl: string | undefined): Promise<{ ok: boolean }> {
  try {
    if (!senderUrl || new URL(senderUrl).origin !== new URL(getWebBaseUrl()).origin) {
      return { ok: false };
    }
    const session = parseAuthSession((message as { session?: unknown }).session);
    if (!session) return { ok: false };
    return { ok: await adoptAuthSession(session) };
  } catch {
    return { ok: false };
  }
}

export default defineBackground(() => {
  const store = new QueueStore(storageKV);

  // Auto-sync nền (spec/24) — thay nút "Đồng bộ & tách câu" trong popup: khi
  // hàng đợi có link MỚI và khi SW dậy lại còn link pending/processing kẹt.
  const autoSync = createAutoSync({ sync: () => syncQueue({ store }) });

  // Nạp phiên đăng nhập từ storage — lỗi chỉ tắt sync, không ảnh hưởng capture/badge.
  void initBackendAuth().catch(() => {
    /* noop */
  });

  // Badge init khi SW khởi động — SW mới dậy không giữ text badge cũ, set lại
  // từ số link hiện có trong storage. Không await: không chặn start; lỗi badge
  // init không được để thành unhandled rejection (noop, luồng lưu không phụ thuộc).
  void store
    .queueCount()
    .then(updateBadge)
    .catch(() => {
      /* noop — badge init lỗi không ảnh hưởng handler message */
    });

  // Drain khi SW dậy lại: link PENDING (chưa gửi) và PROCESSING (cần kéo trạng thái
  // từ server) được sync tiếp — xem auto-sync header. Lỗi drain không ảnh hưởng luồng ghi.
  void store
    .listQueue()
    .then((items) => autoSync.drain(items))
    .catch(() => {
      /* noop */
    });

  // Popup ghi QueueStore TRỰC TIẾP vào storage (không qua message — DECIDE
  // E5), nên badge phải theo dõi storage thay vì chỉ luồng message: mỗi lần
  // key queue đổi (từ nguồn nào cũng được), đếm lại từ newValue. Auto-sync
  // cũng cắm vào đây — trigger chỉ khi có link MỚI (guard độ dài trong
  // createAutoSync, write trạng thái của chính sync không kích hoạt).
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(STORAGE_KEY in changes)) return;
    const change = changes[STORAGE_KEY];
    void updateBadge(countFromQueueValue(change.newValue)).catch(() => {
      /* noop — badge update lỗi không ảnh hưởng luồng ghi */
    });
    autoSync.onQueueChanged(change.oldValue, change.newValue);
  });

  // Poll nền (spec/61): link do AI xử lý xong trên server thì extension kéo trạng thái về,
  // badge/popup cập nhật dù popup đang đóng. Chỉ chạy khi còn link chưa xong.
  void browser.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SYNC_ALARM) return;
    void store
      .listQueue()
      .then((items) => {
        if (items.some((item) => item.status === "pending" || item.status === "processing")) {
          return syncQueue({ store });
        }
        return undefined;
      })
      .catch(() => {
        /* noop — poll nền lỗi không ảnh hưởng gì */
      });
  });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: { url?: string },
    ): Promise<CaptureSaveResponse | SyncNowResponse | LinkWebResponse | { ok: boolean }> | undefined => {
      // Message khác (hoặc méo hình) → không phản hồi, nhường listener khác.
      if (
        typeof message !== "object" ||
        message === null
      ) {
        return undefined;
      }
      const typed = message as { type?: unknown };
      if (typed.type === MSG_CAPTURE_SAVE) {
        return handleCaptureSave(message as CaptureSaveRequest, store);
      }
      if (typed.type === MSG_SYNC_NOW) {
        // Popup chủ động yêu cầu sync — chạy và trả kết quả.
        return syncQueue({ store }).catch<SyncNowResponse>(() => ({
          ok: false,
          reason: "unreachable",
        }));
      }
      if (typed.type === MSG_WEB_SESSION) {
        // Content script trên web báo session mới nhất (spec/62). Chỉ tin sender đúng origin web.
        return handleWebSession(message, sender.url);
      }
      if (typed.type === MSG_LINK_WEB) {
        // Mở tab trang bắt tay trên web (spec/17).
        return openWebLinkHandshake().then<LinkWebResponse>(() => ({
          ok: true,
        }));
      }
      return undefined;
    }
  );

  // Trang bắt tay web gửi Google tokens về (spec/17) — handleWebAuthMessage
  // tự validate origin + nonce một-lần trước khi nhận.
  (browser.runtime as RuntimeWithExternal).onMessageExternal.addListener(
    (message: unknown, sender: { url?: string }) =>
      handleWebAuthMessage(message, sender.url)
  );
});
