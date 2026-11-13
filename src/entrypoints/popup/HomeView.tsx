/**
 * Tab "home" của popup (bản DevFest): header, chip số video đã lưu, promo,
 * form dán link, nút lưu trang hiện tại và banner thành công dẫn sang hàng đợi.
 * Chỉ dữ liệu thật từ QueueStore; URL validate bằng normalizeCaptureUrl.
 */

import { Video } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { normalizeCaptureUrl, type CanonicalCapture } from "../../domain/url-canonicalizer";
import type { QueueStore } from "../../lib/queue-store";

const TITLE_COPY = "Chào bạn";
const SUBTITLE_COPY = "Học từ chính video bạn xem hôm nay";
const PROMO_COPY = "Gặp video hay? Lưu 1 chạm về BrainTot!";
const LABEL_COPY = "Dán link video vừa xem";
const CTA_COPY = "Lưu vào BrainTot";
const SAVE_PAGE_COPY = "Lưu trang này";
const ERROR_COPY = "Link chưa đúng — chỉ nhận Reels, TikTok, YouTube Shorts";
const SUCCESS_COPY = "✓ Đã lưu link";
const OPEN_QUEUE_COPY = "Xem hàng đợi";
const SAVED_UNIT_COPY = "đã lưu";

const PAGE_DISABLED_TITLE = "Tab hiện tại không phải video Reels, TikTok hoặc YouTube Shorts";
const PAGE_ENABLED_TITLE = "Lưu tab đang mở vào BrainTot";

interface HomeViewProps {
  store: QueueStore;
  onOpenQueue: () => void;
  queueCount?: number | null;
  onQueueChanged?: (count: number) => void;
}

export function HomeView({ store, onOpenQueue, queueCount, onQueueChanged }: HomeViewProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pageCapture, setPageCapture] = useState<CanonicalCapture | null>(null);

  // Đọc tab hiện tại 1 lần (hợp lệ nhờ activeTab): URL chuẩn hóa được thì nút bật.
  useEffect(() => {
    let cancelled = false;
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (!cancelled) setPageCapture(normalizeCaptureUrl(tabs[0]?.url ?? ""));
      })
      .catch(() => {
        if (!cancelled) setPageCapture(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(capture: CanonicalCapture): Promise<void> {
    await store.saveCapture(capture);
    if (onQueueChanged) onQueueChanged((await store.listQueue()).length);
    setSaved(true);
  }

  return (
    <>
      <header className="popup-header home-header">
        <img
          className="popup-logo"
          src="/mascot/mascot-book.png"
          alt="BrainTot"
          width={40}
          height={40}
        />
        <div className="home-greeting">
          <p className="home-title">{TITLE_COPY}</p>
          <p className="home-subtitle">{SUBTITLE_COPY}</p>
        </div>
      </header>

      <div className="popup-body">
        <div className="home-chips">
          <span className="stat-chip saved-chip">
            <Video size={14} strokeWidth={2.4} aria-hidden="true" />
            {queueCount ?? "—"} {SAVED_UNIT_COPY}
          </span>
        </div>

        <section className="promo">
          <img
            className="promo-mascot"
            src="/mascot/mascot-share.png"
            alt="Linh vật BrainTot chia sẻ video"
            width={78}
            height={72}
          />
          <p className="promo-text">{PROMO_COPY}</p>
        </section>

        {saved && (
          <section className="save-banner" role="status">
            <img
              className="save-banner-mascot"
              src="/mascot/mascot-cheer-up.png"
              alt="Linh vật BrainTot ăn mừng"
              width={56}
              height={52}
            />
            <div className="save-banner-text">
              <p>{SUCCESS_COPY}</p>
              <button type="button" className="link-button" onClick={onOpenQueue}>
                {OPEN_QUEUE_COPY}
              </button>
            </div>
          </section>
        )}

        <form
          className="paste-form"
          aria-label="Lưu bằng đường dẫn video"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="paste-label" htmlFor="video-link">
            {LABEL_COPY}
          </label>
          <input
            id="video-link"
            className="paste-input"
            type="url"
            placeholder="https://www.tiktok.com/@user/video/..."
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(false);
              setSaved(false);
            }}
          />
          {error && (
            <p className="paste-error" role="alert">
              {ERROR_COPY}
            </p>
          )}
          <button
            type="button"
            className="popup-button save-link"
            disabled={url.trim() === ""}
            onClick={() => {
              const capture = normalizeCaptureUrl(url);
              if (!capture) {
                setError(true);
                return;
              }
              void save(capture);
            }}
          >
            {CTA_COPY}
          </button>
        </form>

        <button
          type="button"
          className="popup-button save-page"
          disabled={!pageCapture}
          title={pageCapture ? PAGE_ENABLED_TITLE : PAGE_DISABLED_TITLE}
          onClick={() => {
            if (pageCapture) void save(pageCapture);
          }}
        >
          {SAVE_PAGE_COPY}
        </button>

        <footer className="paste-footer">
          <button type="button" className="link-button" onClick={onOpenQueue}>
            {OPEN_QUEUE_COPY}
          </button>
        </footer>
      </div>
    </>
  );
}
