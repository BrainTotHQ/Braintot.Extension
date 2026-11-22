/**
 * Tab "home" (default của popup, spec/31): dashboard Chào Tai thu gọn —
 * header greeting + nút "Truy cập đến Web", chip streak, card mục tiêu hôm
 * nay, dải tuần streak, lưới "Số liệu của bạn" — rồi phần save giữ nguyên
 * (promo 1 chạm + form dán link + nút lưu trang hiện tại + banner thành công
 * dẫn sang hàng đợi). Chỉ dữ liệu thật: stats đọc Firestore REST qua
 * user-stats (null → "—", không ghim số mẫu); lưu qua QueueStore truyền từ
 * App; URL validate bằng normalizeCaptureUrl.
 */

import {
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  Flame,
  Globe,
  Sparkles,
  SquarePlay,
  Target,
  Timer,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import {
  normalizeCaptureUrl,
  type CanonicalCapture,
} from "../../domain/url-canonicalizer";
import { getAuthEmail, initBackendAuth } from "../../lib/backend-auth";
import { LinkGate } from "./LinkGate";
import { useLinkStatus } from "./useLinkStatus";
import { getWebBaseUrl } from "../../lib/backend-config";
import { MSG_GET_ACTIVE_URL, type ActiveUrlResponse } from "../../lib/messages";
import type { QueueStore } from "../../lib/queue-store";
import {
  fetchUserStats,
  streakWeek,
  type UserStats,
} from "../../lib/user-stats";

// Copy verbatim từ plan — không đổi từng ký tự.
const PROMO_COPY = "Gặp video hay? Lưu 1 chạm về QuizKard!";
const SAVE_PAGE_COPY = "Lưu trang này";
const SAVE_PAGE_HINT_IDLE = "Mở YouTube Shorts, TikTok hoặc Facebook Reels để lưu nhanh.";
const SAVE_PAGE_HINT_READY = "Đã nhận diện video ngắn trên tab hiện tại.";
const SAVE_PAGE_HINT_TOO_LONG = "Video dài quá 3 phút — chỉ hỗ trợ video ngắn tối đa 3 phút.";
const SUCCESS_COPY = "Đã lưu link";
const OPEN_QUEUE_COPY = "Xem hàng đợi";

// Copy dashboard (spec/31) — không emoji, icon là SVG inline.
const SUBTITLE_COPY = "Học từ chính video bạn xem hôm nay";
const OPEN_WEB_COPY = "Truy cập đến Web";
const GOAL_TITLE_COPY = "Hôm nay";
const GOAL_UNIT_COPY = "câu luyện";
const GOAL_CTA_COPY = "Học ngay";
const STATS_TITLE_COPY = "Số liệu của bạn";
const STREAK_UNIT_COPY = "ngày";
const STREAK_HINT_COPY = "Ôn mỗi ngày để giữ chuỗi";
const SAVED_UNIT_COPY = "đã lưu";
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Tooltip khi tab hiện tại không phải video ngắn hỗ trợ (nút vẫn hiện, disabled). */
const PAGE_DISABLED_TITLE = "Tab hiện tại không phải video Reels, TikTok hoặc YouTube Shorts";
const PAGE_ENABLED_TITLE = "Lưu tab đang mở vào QuizKard";

/** Tên chào: segment đầu của local-part email, viết hoa chữ cái đầu. */
export function displayNameFromEmail(email: string | null): string {
  const localPart = email?.split("@")[0] ?? "";
  const first = localPart.split(/[._\-+]/, 1)[0] ?? "";
  if (first === "") return "bạn";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

interface HomeViewProps {
  store: QueueStore;
  onOpenQueue: () => void;
  /** Đếm link hiện hành từ App (badge tab Hàng đợi + ô "Video đã lưu"). */
  queueCount?: number | null;
  /** Báo App cập nhật badge sau mỗi lần lưu link. */
  onQueueChanged?: (count: number) => void;
}

export function HomeView({
  store,
  onOpenQueue,
  queueCount,
  onQueueChanged,
}: HomeViewProps) {
  const [saved, setSaved] = useState(false);
  const [pageCapture, setPageCapture] = useState<CanonicalCapture | null>(null);
  const [pageTooLong, setPageTooLong] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const linkStatus = useLinkStatus();

  // Đọc tab hiện tại 1 lần (hợp lệ nhờ activeTab): URL chuẩn hóa được → enabled.
  // Đồng thời hỏi content script để lấy URL TikTok For You và kiểm tra giới hạn thời lượng (> 3 phút).
  useEffect(() => {
    let cancelled = false;
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(async (tabs) => {
        if (cancelled) return;
        const tab = tabs[0];
        const direct = normalizeCaptureUrl(tab?.url ?? "");
        let resolved: CanonicalCapture | null = direct;
        let tooLong = false;

        if (tab?.id !== undefined && typeof browser.tabs.sendMessage === "function") {
          try {
            const response = (await browser.tabs.sendMessage(tab.id, {
              type: MSG_GET_ACTIVE_URL,
            })) as ActiveUrlResponse | undefined;
            if (!resolved && response?.url) {
              resolved = normalizeCaptureUrl(response.url);
            }
            if (response?.tooLong) tooLong = true;
          } catch {
            /* tab không có content script — dùng kết quả từ tab.url */
          }
        }
        if (!cancelled) {
          setPageCapture(resolved);
          setPageTooLong(tooLong);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPageCapture(null);
        setPageTooLong(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Greeting + stats (spec/31): auth xong mới có email; stats fetch 1 lần,
  // lỗi → null (UI hiển thị "—").
  useEffect(() => {
    let cancelled = false;
    void initBackendAuth().finally(() => {
      if (!cancelled) setAuthEmail(getAuthEmail());
    });
    fetchUserStats()
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openWeb(): void {
    void browser.tabs.create({ url: getWebBaseUrl(), active: true });
  }

  async function save(capture: CanonicalCapture): Promise<void> {
    if (linkStatus !== "linked") return; // chưa liên kết tài khoản web: không lưu (spec/62)
    await store.saveCapture(capture);
    if (onQueueChanged) {
      const list = await store.listQueue();
      onQueueChanged(list.length);
    }
    setSaved(true);
  }

  const week = streakWeek(
    stats ? { streakDays: stats.streakDays, lastActiveDate: stats.lastActiveDate } : null,
    new Date(),
  );
  const goalPercent =
    stats && stats.dailyGoal > 0
      ? Math.min(100, Math.round((stats.todayReviewedCount / stats.dailyGoal) * 100))
      : 0;

  return (
    <>
      <header className="popup-header home-header">
        <img
          className="popup-logo"
          src="/icons/icon-128.png"
          alt="QuizKard"
          width={40}
          height={40}
        />
        <div className="home-greeting">
          <p className="home-title">Chào {displayNameFromEmail(authEmail)}</p>
          <p className="home-subtitle">{SUBTITLE_COPY}</p>
        </div>
        <button
          type="button"
          className="home-web-button"
          data-testid="open-web"
          title={OPEN_WEB_COPY}
          aria-label={OPEN_WEB_COPY}
          onClick={openWeb}
        >
          <Globe size={18} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </header>

      <div className="popup-body">
        <div className="home-chips">
          {stats && (
            <span className="stat-chip streak-chip" data-testid="streak-chip">
              <Flame size={14} fill="currentColor" aria-hidden="true" />
              {stats.streakDays} {STREAK_UNIT_COPY}
            </span>
          )}
          <span className="stat-chip saved-chip">
            <Video size={14} strokeWidth={2.4} aria-hidden="true" />
            {queueCount ?? "—"} {SAVED_UNIT_COPY}
          </span>
        </div>

        {/* Chưa có số liệu thật (chưa có endpoint stats) thì ẩn cả dashboard, tránh màn hình toàn dấu "—". */}
        {stats && (
          <>
        <section className="goal-card" data-testid="goal-card">
          <span className="goal-badge" aria-hidden="true">
            {stats ? Math.max(0, stats.dailyGoal - stats.todayReviewedCount) : "—"}
          </span>
          <div className="goal-text">
            <p className="goal-title">{GOAL_TITLE_COPY}</p>
            <p className="goal-progress" data-testid="goal-progress">
              {stats ? stats.todayReviewedCount : "—"}/{stats ? stats.dailyGoal : "—"}{" "}
              {GOAL_UNIT_COPY}
            </p>
            <div className="goal-track">
              <div className="goal-fill" style={{ width: `${goalPercent}%` }} />
            </div>
          </div>
          <button type="button" className="goal-cta" onClick={openWeb}>
            {GOAL_CTA_COPY}
          </button>
        </section>

        <section
          className="streak-week"
          data-testid="streak-week"
          aria-label="Chuỗi ngày học liên tiếp"
        >
          <div className="streak-head">
            <span className="streak-flame" aria-hidden="true">
              <Flame size={24} fill="currentColor" />
            </span>
            <div>
              <p className="streak-count">
                {stats ? stats.streakDays : "—"} {STREAK_UNIT_COPY} liên tiếp
              </p>
              <p className="streak-hint">{STREAK_HINT_COPY}</p>
            </div>
          </div>
          <div className="streak-days">
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={label} className={`week-day${week[index] ? " active" : ""}`}>
                <span className="week-dot" aria-hidden="true">
                  {week[index] && <Flame size={14} fill="currentColor" aria-hidden="true" />}
                </span>
                <span className="week-label">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-section">
          <h3 className="stats-title">{STATS_TITLE_COPY}</h3>
          <div className="stats-grid" data-testid="stats-grid">
            <div className="stat-card stat-blue">
              <span className="stat-icon-tile" aria-hidden="true">
                <Target size={18} strokeWidth={2.2} />
              </span>
              <span className="stat-value">
                {stats ? stats.totalPracticedCount : "—"}
              </span>
              <span className="stat-label">Từ vựng đã luyện</span>
            </div>
            <div className="stat-card stat-yellow">
              <span className="stat-icon-tile" aria-hidden="true">
                <BookOpen size={18} strokeWidth={2.2} />
              </span>
              <span className="stat-value">
                {stats?.customChunksCount ?? "—"}
              </span>
              <span className="stat-label">Cụm từ đã lưu</span>
            </div>
            <div className="stat-card stat-mint">
              <span className="stat-icon-tile" aria-hidden="true">
                <SquarePlay size={18} strokeWidth={2.2} />
              </span>
              <span className="stat-value">{queueCount ?? "—"}</span>
              <span className="stat-label">Video đã lưu</span>
            </div>
            <div className="stat-card stat-white">
              <span className="stat-icon-tile" aria-hidden="true">
                <Timer size={18} strokeWidth={2.2} />
              </span>
              <span className="stat-value">
                {stats ? stats.todayReviewedCount : "—"}
              </span>
              <span className="stat-label">Câu hôm nay</span>
            </div>
          </div>
        </section>
          </>
        )}

        {linkStatus === "linked" ? (
          <>
            <section className="promo">
              <span className="promo-icon" aria-hidden="true">
                <Sparkles size={22} strokeWidth={2.4} />
              </span>
              <p className="promo-text">{PROMO_COPY}</p>
            </section>

            {saved && (
              <section className="save-banner" role="status">
                <span className="save-banner-icon" aria-hidden="true">
                  <CheckCircle2 size={22} strokeWidth={2.4} />
                </span>
                <div className="save-banner-text">
                  <p>{SUCCESS_COPY}</p>
                  <button type="button" className="link-button" onClick={onOpenQueue}>
                    {OPEN_QUEUE_COPY}
                  </button>
                </div>
              </section>
            )}

            <section className="save-page-card">
              <p className={`save-page-hint${pageCapture && !pageTooLong ? " is-ready" : ""}`}>
                {pageTooLong
                  ? SAVE_PAGE_HINT_TOO_LONG
                  : pageCapture
                    ? SAVE_PAGE_HINT_READY
                    : SAVE_PAGE_HINT_IDLE}
              </p>
              <button
                type="button"
                className="popup-button save-link save-page"
                disabled={!pageCapture || pageTooLong}
                title={
                  pageTooLong
                    ? SAVE_PAGE_HINT_TOO_LONG
                    : pageCapture
                      ? PAGE_ENABLED_TITLE
                      : PAGE_DISABLED_TITLE
                }
                onClick={() => {
                  if (pageCapture && !pageTooLong) void save(pageCapture);
                }}
              >
                <BookmarkPlus size={16} strokeWidth={2.2} aria-hidden="true" />
                {SAVE_PAGE_COPY}
              </button>
            </section>
          </>
        ) : linkStatus === "loading" ? null : (
          <LinkGate expired={linkStatus === "expired"} />
        )}
      </div>
    </>
  );
}
