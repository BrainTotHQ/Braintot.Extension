/**
 * Chặn lưu video khi chưa liên kết tài khoản web (spec/62): video lưu phải nằm cùng một tài khoản
 * với web, nên chưa đăng nhập thì chỉ hiện màn liên kết, không cho dán hay lưu link.
 */

import { ArrowUpRight, Bookmark, Layers, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { browser } from "wxt/browser";

import { getWebBaseUrl } from "../../lib/backend-config";
import { MSG_LINK_WEB } from "../../lib/messages";

interface LinkGateProps {
  /** true khi đã từng liên kết nhưng phiên hết hạn. */
  expired: boolean;
  /** Bản gọn đặt dưới danh sách hàng đợi. */
  compact?: boolean;
}

const HIGHLIGHTS = [
  { icon: Bookmark, text: "Lưu nhanh từ Shorts, TikTok & Reels" },
  { icon: Layers, text: "Tự động tách câu hội thoại thành flashcard" },
  { icon: RefreshCw, text: "Đồng bộ tức thì với tài khoản QuizKard Web" },
] as const;

export function LinkGate({ expired, compact = false }: LinkGateProps) {
  const title = expired ? "Phiên liên kết đã hết hạn" : "Đăng nhập để lưu video";
  const hint = expired
    ? "Liên kết lại tài khoản QuizKard Web để tiếp tục lưu video và đồng bộ hàng đợi."
    : "Liên kết tài khoản QuizKard Web để video lưu cùng một chỗ trên web và extension.";

  const handleLink = (): void => {
    void browser.runtime.sendMessage({ type: MSG_LINK_WEB }).catch(() => {
      /* mở tab lỗi: giữ nguyên */
    });
  };

  if (compact) {
    return (
      <section className="link-gate compact" data-testid="link-gate">
        <div className="link-gate-text">
          <p className="link-gate-title">{title}</p>
        </div>
        <button
          type="button"
          className="link-gate-button"
          data-testid="link-gate-button"
          onClick={handleLink}
        >
          <LogIn size={15} strokeWidth={2.2} aria-hidden="true" />
          {expired ? "Liên kết lại" : "Đăng nhập"}
        </button>
      </section>
    );
  }

  return (
    <section className="auth-gate" data-testid="link-gate">
      <header className="auth-gate-header">
        <div className="auth-gate-brand">
          <img
            className="auth-gate-brand-icon"
            src="/icons/icon-128.png"
            alt="QuizKard"
            width={26}
            height={26}
          />
          <span className="auth-gate-brand-name">QuizKard</span>
        </div>
        <button
          type="button"
          className="auth-gate-web-link"
          onClick={() => {
            void browser.tabs.create({ url: getWebBaseUrl(), active: true });
          }}
        >
          Mở Web
          <ArrowUpRight size={13} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </header>

      <div className="auth-gate-body">
        <div className="auth-gate-hero">
          <div className="auth-gate-emblem">
            <img
              className="auth-gate-logo"
              src="/icons/icon-128.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
            />
          </div>

          <span className={`auth-gate-pill${expired ? " is-expired" : ""}`}>
            {expired ? "Cần xác thực lại" : "Chrome Extension"}
          </span>

          <h1 className="auth-gate-title">{title}</h1>
          <p className="auth-gate-hint">{hint}</p>
        </div>

        <ul className="auth-gate-features" aria-label="Tính năng chính">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <li key={text} className="auth-gate-feature">
              <span className="auth-gate-feature-icon" aria-hidden="true">
                <Icon size={15} strokeWidth={2.2} />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="auth-gate-cta">
          <button
            type="button"
            className="auth-gate-button"
            data-testid="link-gate-button"
            onClick={handleLink}
          >
            <LogIn size={16} strokeWidth={2.3} aria-hidden="true" />
            {expired ? "Liên kết lại" : "Đăng nhập"}
          </button>
          <p className="auth-gate-footnote">
            <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
            <span>Xác thực an toàn qua trang QuizKard Web</span>
          </p>
        </div>
      </div>
    </section>
  );
}
