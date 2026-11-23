// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MSG_WEB_SESSION } from "./messages";
import { WEB_SESSION_CHANGED_EVENT } from "./web-session";

const sendMessageMock = vi.hoisted(() => vi.fn(async (_msg: unknown) => ({ ok: true })));

vi.mock("wxt/utils/define-content-script", () => ({
  defineContentScript: (def: { main: () => void }) => def,
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      sendMessage: sendMessageMock,
    },
  },
}));

const VALID_RAW = JSON.stringify({
  accessToken: "tok-1",
  expiresAt: 1_900_000_000_000,
  user: { uid: "u1", email: "a@x.com" },
});

describe("web-session content script", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    sendMessageMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gửi session lúc khởi chạy và gửi session: null ngay lập tức khi web bắn braintot:session-changed", async () => {
    window.localStorage.setItem("braintot.session", VALID_RAW);

    vi.resetModules();
    const mod = await import("../entrypoints/web-session.content");
    (mod.default as unknown as { main: () => void }).main();

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenLastCalledWith({
      type: MSG_WEB_SESSION,
      session: {
        accessToken: "tok-1",
        expiresAt: 1_900_000_000_000,
        email: "a@x.com",
        uid: "u1",
      },
    });

    // Mô phỏng web gọi clearSession(): xoá localStorage và bắn sự kiện trong cùng tab.
    window.localStorage.removeItem("braintot.session");
    window.dispatchEvent(new Event(WEB_SESSION_CHANGED_EVENT));

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(sendMessageMock).toHaveBeenLastCalledWith({
      type: MSG_WEB_SESSION,
      session: null,
    });

    // Nhịp poll sau không gửi trùng khi trạng thái vẫn là null.
    vi.advanceTimersByTime(10_000);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });
});
