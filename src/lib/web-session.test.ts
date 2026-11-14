import { describe, expect, it } from "vitest";

import { readWebSession } from "./web-session";

const store = (value: string | null) => ({ getItem: () => value });

describe("readWebSession", () => {
  it("đọc đúng token, hạn, email, uid", () => {
    const raw = JSON.stringify({
      accessToken: "tok",
      expiresAt: 123,
      user: { uid: "u1", email: "a@x.com" },
    });
    expect(readWebSession(store(raw))?.session).toEqual({
      accessToken: "tok",
      expiresAt: 123,
      email: "a@x.com",
      uid: "u1",
    });
  });

  it("thiếu / JSON hỏng / sai hình → null", () => {
    expect(readWebSession(store(null))).toBeNull();
    expect(readWebSession(store("{oops"))).toBeNull();
    expect(readWebSession(store(JSON.stringify({ accessToken: 1, expiresAt: 1 })))).toBeNull();
  });
});
