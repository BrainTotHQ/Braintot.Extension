/**
 * Popup BrainTot — shell 2 tab trong 1 App (spec/31): "home" (trang chủ:
 * dashboard + dán link / lưu trang hiện tại) và "queue" (hàng đợi link chờ
 * xử lý). Tab bar cố định đáy với badge đếm link; App tự load count 1 lần
 * mount và các view báo lại qua onQueueChanged sau mỗi lần lưu/retry. Popup
 * gọi QueueStore TRỰC TIẾP qua chrome.storage.local (DECIDE của plan — không
 * message background, popup có quyền storage); badge icon tự cập nhật lần mở
 * popup sau, chấp nhận cho v1.
 */

import { Hourglass, House } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { QueueStore, type KV } from "../../lib/queue-store";

import { HomeView } from "./HomeView";
import { LinkGate } from "./LinkGate";
import { useLinkStatus } from "./useLinkStatus";
import { QueueView } from "./QueueView";
import "./popup.css";

/**
 * Adapter KV bọc chrome.storage.local (như background) — MV3 get/set vốn
 * promise-based, chỉ cần map về interface KV (get phải trả giá trị, không
 * trả cả bag).
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

const queueStore = new QueueStore(storageKV);

export type PopupView = "home" | "queue";

export function App() {
  const [view, setView] = useState<PopupView>("home");
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const linkStatus = useLinkStatus();

  // Badge đếm link lần mở popup — view tự báo onQueueChanged khi đổi dữ liệu.
  useEffect(() => {
    let cancelled = false;
    queueStore
      .listQueue()
      .then((list) => {
        if (!cancelled) setQueueCount(list.length);
      })
      .catch(() => {
        if (!cancelled) setQueueCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Chưa đăng nhập (hoặc phiên hết hạn): chỉ hiện màn đăng nhập, không cho dùng app (spec/62).
  if (linkStatus === "loading") return <main className="popup" aria-busy="true" />;
  if (linkStatus !== "linked") {
    return (
      <main className="popup popup-gated">
        <LinkGate expired={linkStatus === "expired"} />
      </main>
    );
  }

  return (
    <main className="popup">
      {view === "home" ? (
        <HomeView
          store={queueStore}
          onOpenQueue={() => setView("queue")}
          queueCount={queueCount}
          onQueueChanged={setQueueCount}
        />
      ) : (
        <QueueView
          store={queueStore}
          onBack={() => setView("home")}
          onQueueChanged={setQueueCount}
        />
      )}

      <nav className="tab-bar" aria-label="Điều hướng chính">
        <button
          type="button"
          data-testid="tab-home"
          className={`tab-item${view === "home" ? " active" : ""}`}
          aria-current={view === "home" ? "page" : undefined}
          onClick={() => setView("home")}
        >
          <House size={20} strokeWidth={2.3} aria-hidden="true" />
          <span>Trang chủ</span>
        </button>
        <button
          type="button"
          data-testid="tab-queue"
          className={`tab-item${view === "queue" ? " active" : ""}`}
          aria-current={view === "queue" ? "page" : undefined}
          onClick={() => setView("queue")}
        >
          <Hourglass size={20} strokeWidth={2.3} aria-hidden="true" />
          <span>Hàng đợi</span>
          {queueCount !== null && queueCount > 0 && (
            <span className="tab-badge" data-testid="queue-badge">
              {queueCount}
            </span>
          )}
        </button>
      </nav>
    </main>
  );
}
