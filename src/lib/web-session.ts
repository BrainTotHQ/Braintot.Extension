/** Đọc session do web lưu (spec/62); dùng bởi content script `web-session`. */

const WEB_SESSION_KEY = "braintot.session";
/** Sự kiện DOM do web bắn trong cùng tab mỗi khi saveSession/clearSession chạy. */
export const WEB_SESSION_CHANGED_EVENT = "braintot:session-changed";

/** Đọc session web ra dạng `{accessToken, expiresAt, email, uid}`; thiếu/hỏng → null. */
export function readWebSession(
  storage: Pick<Storage, "getItem">,
): { raw: string; session: Record<string, unknown> } | null {
  try {
    const raw = storage.getItem(WEB_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      accessToken?: unknown;
      expiresAt?: unknown;
      user?: { uid?: unknown; email?: unknown };
    };
    if (typeof parsed.accessToken !== "string" || typeof parsed.expiresAt !== "number") return null;
    return {
      raw,
      session: {
        accessToken: parsed.accessToken,
        expiresAt: parsed.expiresAt,
        email: parsed.user?.email ?? "",
        uid: parsed.user?.uid,
      },
    };
  } catch {
    return null;
  }
}

