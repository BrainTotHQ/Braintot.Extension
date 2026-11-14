/**
 * Chặn lưu video khi chưa liên kết tài khoản web (spec/62): video lưu phải nằm cùng một tài khoản
 * với web, nên chưa đăng nhập thì chỉ hiện nút đăng nhập, không cho dán hay lưu link.
 */

import { LogIn } from "lucide-react";
import { browser } from "wxt/browser";

import { MSG_LINK_WEB } from "../../lib/messages";

interface LinkGateProps {
  /** true khi đã từng liên kết nhưng phiên hết hạn. */
  expired: boolean;
  /** Bản gọn đặt dưới danh sách hàng đợi. */
  compact?: boolean;
}

export function LinkGate({ expired, compact = false }: LinkGateProps) {
  const title = expired ? "Phiên liên kết đã hết hạn" : "Đăng nhập để lưu video";
  const hint = expired
    ? "Liên kết lại tài khoản BrainTot Web để tiếp tục lưu và đồng bộ."
    : "Liên kết tài khoản BrainTot Web để video lưu cùng một chỗ trên web và extension.";
  return (
    <section className={`link-gate${compact ? " compact" : ""}`} data-testid="link-gate">
      {!compact && (
        <img
          className="link-gate-mascot"
          src="/mascot/mascot-share.png"
          alt="Linh vật BrainTot"
          width={78}
          height={72}
        />
      )}
      <div className="link-gate-text">
        <p className="link-gate-title">{title}</p>
        {!compact && <p className="link-gate-hint">{hint}</p>}
      </div>
      <button
        type="button"
        className="link-gate-button"
        data-testid="link-gate-button"
        onClick={() => {
          void browser.runtime.sendMessage({ type: MSG_LINK_WEB }).catch(() => {
            /* mở tab lỗi: giữ nguyên */
          });
        }}
      >
        <LogIn size={16} strokeWidth={2.4} aria-hidden="true" />
        {expired ? "Liên kết lại" : "Đăng nhập"}
      </button>
    </section>
  );
}
