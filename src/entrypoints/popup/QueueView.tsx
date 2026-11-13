/**
 * Tab "queue" (spec/31, restyle spec/57 theo web QueueItemCard + mobile): header tiêu đề + phụ đề
 * đếm video, chip lọc theo trạng thái (Tất cả / Chờ / Sẵn sàng / Lỗi, Chờ gộp pending +
 * processing), card gồm thumbnail (ảnh YouTube hoặc gradient theo platform), URL một dòng,
 * pill trạng thái + "nền tảng · x phút trước", nút tròn play (mở /flashcards?video=<id>) và
 * nút tròn thử lại cho link lỗi (failed → pending qua canTransition), paste bar cố định dưới
 * danh sách. Giữ auth row (spec/17) và empty state 3 bước. Dữ liệu đọc trực tiếp QueueStore
 * (storage key braintot:pending-links, sort savedAt desc).
 */

import { Play, Plus, RefreshCw, Sparkles, SquarePlay, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import {
  canTransition,
  type PendingLink,
} from "../../domain/pending-link";
import {
  normalizeCaptureUrl,
  type CanonicalCapture,
} from "../../domain/url-canonicalizer";
import { detailText, displayTitle, formatSavedAgo, thumbnailUrl } from "../../lib/queue-display";
import type { QueueStore } from "../../lib/queue-store";
import { useVideoTitles } from "./useVideoTitles";

// Copy verbatim từ plan spec/24 — sạch emoji (design language mobile).
const TITLE_COPY = "Hàng đợi";
const SUBTITLE_SUFFIX_COPY = "video · demo xử lý giả lập";
const PENDING_CHIP_COPY = "Đang chờ";
const EMPTY_TITLE_COPY = "Chưa có gì ở đây";
const EMPTY_CHIP_COPY = "Sẵn sàng cho bài học đầu tiên?";
const EMPTY_HELPER_COPY = "Lưu video hay bạn vừa xem, BrainTot tự tách câu thành bài học:";
const EMPTY_STEPS_COPY = [
  "Mở video YouTube, TikTok hoặc Reels",
  "Bấm extension BrainTot: dán link hoặc Lưu trang này",
  "Chờ xử lý — trạng thái đổi ngay trong hàng đợi",
];
const PASTE_PLACEHOLDER_COPY = "Dán link video để thêm";
const PASTE_ADD_TITLE_COPY = "Thêm link vào hàng đợi";
const RETRY_COPY = "Thử lại";
const PASTE_ERROR_COPY = "Link chưa đúng — chỉ nhận Reels, TikTok, YouTube Shorts";

/** Nhãn trạng thái + reason lỗi (mapping failureReason → tiếng Việt ngắn). */
const STATUS_LABEL: Record<PendingLink["status"], string> = {
  pending: PENDING_CHIP_COPY,
  processing: "Đang xử lý",
  succeeded: "Sẵn sàng",
  failed: "Cần thử lại",
};

const FAILURE_REASON_LABEL: Record<string, string> = {
  INVALID_URL: "Link không hợp lệ / chưa hỗ trợ nền tảng",
  VIDEO_TOO_LONG: "Video dài quá 90s",
  NO_SPEECH: "Không tìm thấy lời thoại",
  UNSUPPORTED_PLATFORM: "Nền tảng chưa hỗ trợ",
  PROCESSING_FAILED: "Lỗi xử lý — thử lại",
};

/** Nhãn chip platform — màu pastel theo Global Constraints (xem popup.css). */
const PLATFORM_LABEL: Record<PendingLink["platform"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook_reel: "Reels",
};

/** Bộ lọc trạng thái — "waiting" gộp pending + processing (chưa có bài học). */
type QueueFilter = "all" | "waiting" | "succeeded" | "failed";

const FILTER_LABEL: Record<QueueFilter, string> = {
  all: "Tất cả",
  waiting: "Chờ",
  succeeded: "Sẵn sàng",
  failed: "Lỗi",
};

function matchesFilter(link: PendingLink, filter: QueueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "waiting") {
    return link.status === "pending" || link.status === "processing";
  }
  return link.status === filter;
}

/** Thumbnail: ảnh thật (YouTube) hoặc ô gradient + icon theo nền tảng; ảnh lỗi thì rơi về icon. */
function QueueThumb({ link }: { link: PendingLink }) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : thumbnailUrl(link);
  return (
    <div className={`queue-thumb thumb-${link.platform}`} aria-hidden="true">
      {src ? (
        <img className="queue-thumb-img" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <SquarePlay size={32} strokeWidth={2} aria-hidden="true" />
      )}
    </div>
  );
}

interface QueueViewProps {
  store: QueueStore;
  onBack: () => void;
  /** Báo App cập nhật badge sau retry / thêm link qua paste bar. */
  onQueueChanged?: (count: number) => void;
}

export function QueueView({ store, onBack, onQueueChanged }: QueueViewProps) {
  const [links, setLinks] = useState<PendingLink[] | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const videoTitles = useVideoTitles(links);

  // Load mỗi lần mở view (null = đang tải, chưa render list lẫn badge).
  useEffect(() => {
    let cancelled = false;
    store
      .listQueue()
      .then((list) => {
        if (!cancelled) setLinks(list);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Bộ xử lý giả lập ở background đổi trạng thái link: popup hỏi lại storage mỗi giây
  // khi còn link chưa xong.
  const hasUnfinished = (links ?? []).some(
    (link) => link.status === "pending" || link.status === "processing",
  );
  useEffect(() => {
    if (!hasUnfinished) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void store
        .listQueue()
        .then((list) => {
          if (cancelled) return;
          setLinks(list);
          onQueueChanged?.(list.length);
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hasUnfinished, store, onQueueChanged]);

  async function refreshQueue(): Promise<void> {
    try {
      const list = await store.listQueue();
      setLinks(list);
      onQueueChanged?.(list.length);
    } catch {
      setLinks([]);
    }
  }

  function addPaste(): void {
    const capture: CanonicalCapture | null = normalizeCaptureUrl(pasteUrl);
    if (!capture) {
      setPasteError(true);
      return;
    }
    void (async () => {
      await store.saveCapture(capture);
      setPasteUrl("");
      setPasteError(false);
      await refreshQueue();
    })();
  }

  /** failed → pending (state machine spec/13); xong refresh list + badge. */
  function retryLink(link: PendingLink): void {
    if (!canTransition(link.status, "pending")) return;
    void (async () => {
      await store.updateLink({ ...link, status: "pending" });
      await refreshQueue();
    })();
  }

  /** Xoá video: đã liên kết thì xoá trên server trước (xong còn xoá cả flashcard), rồi xoá cache. */
  function removeLink(link: PendingLink): void {
    const message =
      link.status === "succeeded"
        ? "Xóa video này khỏi hàng đợi?"
        : "Xóa video này khỏi hàng đợi?";
    if (!window.confirm(message)) return;
    void (async () => {
      await store.removeLink(link.id);
      await refreshQueue();
    })();
  }

  const all = links ?? [];
  const counts: Record<QueueFilter, number> = {
    all: all.length,
    waiting: all.filter(
      (link) => link.status === "pending" || link.status === "processing",
    ).length,
    succeeded: all.filter((link) => link.status === "succeeded").length,
    failed: all.filter((link) => link.status === "failed").length,
  };
  const filtered = all.filter((link) => matchesFilter(link, filter));

  return (
    <>
      <header className="popup-header queue-header">
        <div className="queue-head-text">
          <h2 className="popup-title">{TITLE_COPY}</h2>
          {links !== null && (
            <p className="queue-subtitle" data-testid="queue-subtitle">
              {links.length} {SUBTITLE_SUFFIX_COPY}
            </p>
          )}
        </div>
      </header>

      {links !== null && links.length === 0 ? (
        <div className="empty-content">
          <img
            className="book-mascot"
            src="/mascot/mascot-book.png"
            alt="Linh vật BrainTot cầm sách"
            width={130}
            height={110}
          />
          <span className="empty-chip">
            <Sparkles size={14} strokeWidth={2.4} aria-hidden="true" />
            {EMPTY_CHIP_COPY}
          </span>
          <p className="empty-title">{EMPTY_TITLE_COPY}</p>
          <p className="empty-helper">{EMPTY_HELPER_COPY}</p>
          <ol className="empty-steps" data-testid="queue-empty-steps">
            {EMPTY_STEPS_COPY.map((step, index) => (
              <li key={step} className="empty-step">
                <span className="step-num">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="popup-button save-page back-button" onClick={onBack}>
            Quay lại
          </button>
        </div>
      ) : (
        <>
          {links !== null && links.length > 0 && (
            <div className="queue-filters" role="group" aria-label="Lọc theo trạng thái">
              {(Object.keys(FILTER_LABEL) as QueueFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`filter-${key}`}
                  className={`filter-chip filter-${key}${filter === key ? " active" : ""}`}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {FILTER_LABEL[key]} ({counts[key]})
                </button>
              ))}
            </div>
          )}

          <ol className="queue-list" aria-label="Các link đang chờ xử lý">
            {filtered.map((link) => (
              <li key={link.id} className={`queue-card card-${link.status}`}>
                <div className="queue-card-top">
                  <QueueThumb link={link} />
                  <div className="queue-card-main">
                    <p className="video-url" title={displayTitle(link, videoTitles[link.id])}>
                      {displayTitle(link, videoTitles[link.id])}
                    </p>
                    <div className="queue-card-meta">
                      <span className={`status-chip status-${link.status}`}>
                        {STATUS_LABEL[link.status]}
                      </span>
                    </div>
                    <p
                      className={`queue-card-detail${link.status === "failed" ? " is-error" : ""}`}
                      title={[PLATFORM_LABEL[link.platform], formatSavedAgo(link.savedAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {detailText(link, FAILURE_REASON_LABEL)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="delete-button"
                    data-testid="delete-link"
                    aria-label="Xóa video"
                    title="Xóa video"
                    onClick={() => removeLink(link)}
                  >
                    <Trash2 size={17} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
                {link.status === "succeeded" && (
                  <div className="queue-card-actions">
                    <button
                      type="button"
                      className="action-button action-primary open-web-button"
                      aria-label="Xem video"
                      title="Mở video gốc"
                      onClick={() =>
                        void browser.tabs.create({
                          url: link.url,
                          active: true,
                        })
                      }
                    >
                      <Play size={18} strokeWidth={2.4} fill="currentColor" aria-hidden="true" />
                      Xem video
                    </button>
                  </div>
                )}
                {canTransition(link.status, "pending") && (
                  <div className="queue-card-actions">
                    <button
                      type="button"
                      className="action-button action-retry"
                      data-testid="retry-link"
                      aria-label={RETRY_COPY}
                      title={RETRY_COPY}
                      onClick={() => retryLink(link)}
                    >
                      <RefreshCw size={18} strokeWidth={2.4} aria-hidden="true" />
                      {RETRY_COPY}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <footer className="queue-footer">
              <form
                className="queue-paste"
                aria-label="Thêm link video vào hàng đợi"
                onSubmit={(event) => event.preventDefault()}
              >
                <input
                  data-testid="queue-paste-input"
                  className="queue-paste-input"
                  type="url"
                  placeholder={PASTE_PLACEHOLDER_COPY}
                  value={pasteUrl}
                  onChange={(event) => {
                    setPasteUrl(event.target.value);
                    setPasteError(false);
                  }}
                />
                <button
                  type="button"
                  className="queue-add-button"
                  data-testid="queue-paste-add"
                  title={PASTE_ADD_TITLE_COPY}
                  aria-label={PASTE_ADD_TITLE_COPY}
                  disabled={pasteUrl.trim() === ""}
                  onClick={addPaste}
                >
                  <Plus size={18} strokeWidth={2.8} aria-hidden="true" />
                </button>
              </form>
              {pasteError && (
                <p className="paste-error queue-paste-error" role="alert">
                  {PASTE_ERROR_COPY}
                </p>
              )}
            </footer>
        </>
      )}
    </>
  );
}
