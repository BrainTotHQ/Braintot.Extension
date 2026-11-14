/**
 * Test lib user-stats (spec/31 T2): parse Firestore REST document, tính dải
 * tuần streak, và fetch REST `users/{uid}/stats/current`. Mock firebase +
 * wxt/browser như backend-auth.test.ts; fetch inject qua fetchImpl.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageData = vi.hoisted(() => new Map<string, unknown>());

vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const bag: Record<string, unknown> = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            if (storageData.has(k)) bag[k] = storageData.get(k);
          }
          return bag;
        }),
        set: vi.fn(async (bag: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(bag)) storageData.set(k, v);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const k of Array.isArray(keys) ? keys : [keys]) storageData.delete(k);
        }),
      },
    },
  },
}));

const TEST_CONFIG = {
  apiKey: "test-api-key",
  authDomain: "test.firebaseapp.com",
  projectId: "test-project",
};

/** JWT fixture: payload base64url không padding (như backend-auth.test.ts). */
function fakeJwt(payload: unknown): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(
    Array.from(new TextEncoder().encode(json))
      .map((byte) => String.fromCharCode(byte))
      .join(""),
  );
  return `hdr.${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.sig`;
}

const GOOGLE_TOKENS = {
  idToken: fakeJwt({ user_id: "uid-stats-1" }),
};
const SESSION = {
  accessToken: GOOGLE_TOKENS.idToken,
  email: "minh@gmail.com",
  expiresAt: Date.now() + 3_600_000,
  uid: "uid-stats-1",
};

/** Document Firestore REST đủ trường — số trả về dạng chuỗi như wire format. */
function statsDoc(fields: Record<string, unknown> = {}) {
  const all: Record<string, unknown> = {
    streakDays: { integerValue: "13" },
    lastActiveDate: { stringValue: "2026-11-05" },
    todayReviewedCount: { integerValue: "5" },
    totalPracticedCount: { integerValue: "128" },
    dailyGoal: { integerValue: "20" },
    customChunksCount: { integerValue: "34" },
    totalChunksCount: { integerValue: "40" },
    ...fields,
  };
  return { fields: all, createTime: "2026-11-05T00:00:00Z" };
}

describe("user-stats — parseUserStatsDoc (pure)", () => {
  beforeEach(() => {
    vi.resetModules();
    storageData.clear();
  });

  it("document REST đầy đủ → UserStats đúng số (integerValue là chuỗi)", async () => {
    const { parseUserStatsDoc } = await import("./user-stats");
    expect(parseUserStatsDoc(statsDoc())).toEqual({
      streakDays: 13,
      lastActiveDate: "2026-11-05",
      todayReviewedCount: 5,
      totalPracticedCount: 128,
      dailyGoal: 20,
      customChunksCount: 34,
      totalChunksCount: 40,
    });
  });

  it("thiếu streakDays/lastActiveDate → null; fields rỗng → null; undefined → null", async () => {
    const { parseUserStatsDoc } = await import("./user-stats");
    const noStreak = statsDoc();
    delete (noStreak.fields as Record<string, unknown>).streakDays;
    expect(parseUserStatsDoc(noStreak)).toBeNull();
    expect(parseUserStatsDoc(statsDoc({ lastActiveDate: undefined }))).toBeNull();
    expect(parseUserStatsDoc({ fields: {} })).toBeNull();
    expect(parseUserStatsDoc(undefined)).toBeNull();
  });

  it("thiếu trường phụ → default 0/0/20; doubleValue vẫn parse được", async () => {
    const { parseUserStatsDoc } = await import("./user-stats");
    expect(
      parseUserStatsDoc(
        statsDoc({
          todayReviewedCount: undefined,
          totalPracticedCount: undefined,
          dailyGoal: undefined,
          streakDays: { doubleValue: 7 },
        }),
      ),
    ).toEqual({
      streakDays: 7,
      lastActiveDate: "2026-11-05",
      todayReviewedCount: 0,
      totalPracticedCount: 0,
      dailyGoal: 20,
      customChunksCount: 34,
      totalChunksCount: 40,
    });
  });
});

describe("user-stats — streakWeek (pure, 7 ô T2→CN)", () => {
  beforeEach(() => {
    vi.resetModules();
    storageData.clear();
  });

  it("streak 13 ngày kết thúc thứ 5 (2026-11-05) → T2–T5 active, T6/CN false", async () => {
    const { streakWeek } = await import("./user-stats");
    const today = new Date(2026, 10, 5); // Thứ 5, 05-11-2026
    expect(streakWeek({ streakDays: 13, lastActiveDate: "2026-11-05" }, today)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("streak kết thúc tuần trước → cả tuần false; streak 0/null → false", async () => {
    const { streakWeek } = await import("./user-stats");
    const today = new Date(2026, 10, 5);
    expect(
      streakWeek({ streakDays: 5, lastActiveDate: "2026-10-28" }, today),
    ).toEqual([false, false, false, false, false, false, false]);
    expect(streakWeek({ streakDays: 0, lastActiveDate: "2026-11-05" }, today)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(streakWeek(null, today)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("tuần vắt tháng: streak bắt đầu tháng trước vẫn đếm đúng", async () => {
    const { streakWeek } = await import("./user-stats");
    const today = new Date(2026, 10, 2); // Thứ 2, 02-11-2026
    // streak 10 ngày → bắt đầu 24-10 (tháng trước), chỉ T2 02-11 thuộc tuần này.
    expect(
      streakWeek({ streakDays: 10, lastActiveDate: "2026-11-02" }, today),
    ).toEqual([true, false, false, false, false, false, false]);
  });
});

describe("user-stats — fetchUserStats (Firestore REST)", () => {
  beforeEach(() => {
    vi.resetModules();
    storageData.clear();
  });

  function mockFetch(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
    return vi.fn(async () =>
      new Response(JSON.stringify(payload), { status }) as unknown as Response,
    );
  }

  it("google tokens + config → GET đúng URL, Bearer idToken, parse UserStats", async () => {
    storageData.set("braintot:auth-session", SESSION);
    const fetchImpl = mockFetch(statsDoc());
    const { fetchUserStats } = await import("./user-stats");

    const stats = await fetchUserStats({ config: TEST_CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(stats?.streakDays).toBe(13);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents/users/uid-stats-1/stats/current",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer " + GOOGLE_TOKENS.idToken,
    );
  });

  it("fetch lỗi / !ok / thiếu config / chưa auth → null, không ném", async () => {
    const { fetchUserStats } = await import("./user-stats");

    // Chưa auth (không google token, anon bị tắt vì config rỗng).
    expect(
      await fetchUserStats({
        config: { apiKey: "", authDomain: "", projectId: "p" },
        fetchImpl: mockFetch(statsDoc()) as unknown as typeof fetch,
      }),
    ).toBeNull();

    storageData.set("braintot:auth-session", SESSION);

    // !ok
    expect(
      await fetchUserStats({
        config: TEST_CONFIG,
        fetchImpl: mockFetch({}, 401) as unknown as typeof fetch,
      }),
    ).toBeNull();

    // fetch ném
    expect(
      await fetchUserStats({
        config: TEST_CONFIG,
        fetchImpl: vi.fn(async () => {
          throw new Error("network down");
        }) as unknown as typeof fetch,
      }),
    ).toBeNull();

    // Thiếu projectId
    expect(
      await fetchUserStats({
        config: { apiKey: "k", authDomain: "a", projectId: "" },
        fetchImpl: mockFetch(statsDoc()) as unknown as typeof fetch,
      }),
    ).toBeNull();
  });
});
