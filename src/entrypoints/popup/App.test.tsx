// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PendingLink } from "../../domain/pending-link";

import { App } from "./App";

// jsdom không có crypto.subtle — QueueStore thật (pendingLinkId SHA-256) cần
// nó khi lưu, nên inject webcrypto của Node runtime khi còn thiếu (khai báo
// type "node:crypto" xem node-crypto.d.ts).
if (!globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

/** chrome.storage.local + tabs.query giả lập — QueueStore/normalizeCaptureUrl chạy THẬT trên đó. */
const { storageData, tabsQuery, tabsCreate } = vi.hoisted(() => {
  const storageData = new Map<string, unknown>();
  const tabsQuery = vi.fn<() => Promise<Array<{ url?: string }>>>();
  const tabsCreate = vi.fn<(props: { url: string; active?: boolean }) => void>();
  return { storageData, tabsQuery, tabsCreate };
});

vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const bag: Record<string, unknown> = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (storageData.has(key)) bag[key] = storageData.get(key);
          }
          return bag;
        }),
        set: vi.fn(async (bag: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(bag)) storageData.set(key, value);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) storageData.delete(key);
        }),
      },
    },
    tabs: { query: tabsQuery, create: tabsCreate },
  },
}));

// fetchUserStats mock được (stats dashboard) — streakWeek giữ bản thật.
const fetchUserStatsMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/user-stats", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchUserStats: fetchUserStatsMock };
});

// Trạng thái liên kết (spec/62): mặc định đã liên kết để các test lưu link chạy; test gate tự đổi.
const getLinkStatusMock = vi.hoisted(() => vi.fn(() => "linked" as "linked" | "expired" | "unlinked"));
vi.mock("../../lib/backend-auth", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getLinkStatus: getLinkStatusMock };
});

// Xoá trên server (spec/61): module backend-auth giữ state giữa các test nên một số test chạy
// ở chế độ đã liên kết; mock để test xoá không gọi mạng thật.
const deleteRemoteLinkMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/queue-api", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, deleteRemoteLink: deleteRemoteLinkMock };
});

// Tên video qua oEmbed: không gọi mạng thật trong test.
vi.mock("../../lib/video-title", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchVideoTitle: vi.fn(async () => null) };
});

/** Link trong storage key của queue — đọc trực tiếp từ chrome.storage.local giả lập. */
function storedLinks(): PendingLink[] {
  const record = storageData.get("braintot:pending-links");
  return record ? Object.values(record as Record<string, PendingLink>) : [];
}

beforeEach(() => {
  storageData.clear();
  tabsQuery.mockReset();
  // Tab mặc định: trang thường (không phải video) — các test lưu bằng paste.
  tabsQuery.mockResolvedValue([{ url: "https://example.com/tin-tuc" }]);
  // Mặc định không có stats (popup hiển thị "—"); test stats tự ghi đè.
  fetchUserStatsMock.mockReset().mockResolvedValue(null);
  deleteRemoteLinkMock.mockReset().mockResolvedValue({ ok: true, value: null });
  getLinkStatusMock.mockReset().mockReturnValue("linked");
});

describe("App — popup lưu trang hiện tại + hàng đợi", () => {
  it("(a) tab TikTok hợp lệ → bấm Lưu trang này lưu vào storage + banner thành công, sang queue thấy card", async () => {
    tabsQuery.mockResolvedValue([
      { url: "https://www.tiktok.com/@creator/video/1234567890123456789?utm_source=x" },
    ]);
    render(<App />);
    const button = await screen.findByRole("button", { name: "Lưu trang này" });
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(button);

    expect(await screen.findByText("Đã lưu link")).toBeTruthy();
    await waitFor(() => {
      const links = storedLinks();
      expect(links).toHaveLength(1);
      expect(links[0]?.platform).toBe("tiktok");
      expect(links[0]?.url).toBe("https://www.tiktok.com/@creator/video/1234567890123456789");
      expect(links[0]?.status).toBe("pending");
    });

    // Sang hàng đợi qua tab — card TikTok + status chip pending + URL rút gọn.
    fireEvent.click(await screen.findByTestId("tab-queue"));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Hàng đợi" })
    ).toBeTruthy();
    expect(screen.getByText("Chờ xử lý")).toBeTruthy();
    expect(screen.getByText("Đang chờ")).toBeTruthy();
    expect(screen.getByText("@creator")).toBeTruthy();

    // Về trang chủ qua tab.
    fireEvent.click(await screen.findByTestId("tab-home"));
    expect(await screen.findByRole("button", { name: "Lưu trang này" })).toBeTruthy();
    await act(async () => {});
  });

  it("(b) tab link rút gọn vm.tiktok.com → lưu ngay với URL gốc (engine tự resolve — spec 33)", async () => {
    tabsQuery.mockResolvedValue([{ url: "https://vm.tiktok.com/abc" }]);
    render(<App />);
    const button = await screen.findByRole("button", { name: "Lưu trang này" });
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(button);

    expect(await screen.findByText("Đã lưu link")).toBeTruthy();
    await waitFor(() => {
      const links = storedLinks();
      expect(links).toHaveLength(1);
      expect(links[0]?.platform).toBe("tiktok");
      expect(links[0]?.url).toBe("https://vm.tiktok.com/abc");
      expect(links[0]?.status).toBe("pending");
    });
  });

  it("(c) hàng đợi rỗng → empty state kiểu mobile: 'Chưa có gì ở đây' + thẻ 3 bước", async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    expect(await screen.findByRole("heading", { level: 2, name: "Hàng đợi" })).toBeTruthy();
    expect(screen.getByText("Chưa có gì ở đây")).toBeTruthy();
    const steps = screen.getByTestId("queue-empty-steps");
    expect(steps.textContent).toContain("Mở video YouTube, TikTok hoặc Reels");
    expect(steps.textContent).toContain("Bấm extension QuizKard rồi chọn Lưu trang này");
    expect(steps.textContent).toContain("Chờ tách câu — bài học xuất hiện trên Web");

    fireEvent.click(await screen.findByTestId("tab-home"));
    expect(await screen.findByRole("button", { name: "Lưu trang này" })).toBeTruthy();
    await act(async () => {});
  });

  it("(d) tab hiện tại không phải video → 'Lưu trang này' disabled kèm tooltip giải thích", async () => {
    tabsQuery.mockResolvedValue([{ url: "https://news.example.com/bai-viet-chi-tiet" }]);
    render(<App />);

    const button = await screen.findByRole("button", { name: "Lưu trang này" });
    await waitFor(() => {
      expect(tabsQuery).toHaveBeenCalled();
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
    expect(button.getAttribute("title")).toBeTruthy();
  });

  it("(e) tab hiện tại là video ngắn → 'Lưu trang này' enabled và lưu được trang đó", async () => {
    tabsQuery.mockResolvedValue([{ url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" }]);
    render(<App />);

    const button = await screen.findByRole("button", { name: "Lưu trang này" });
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(button);
    expect(await screen.findByText("Đã lưu link")).toBeTruthy();
    expect(storedLinks()[0]?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("(f) trang chủ chỉ có nút 'Lưu trang này', không còn ô dán link hay nút 'Xem hàng đợi' ở footer", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Lưu trang này" })).toBeTruthy();
    expect(screen.queryByLabelText("Dán link video vừa xem")).toBeNull();
    expect(screen.queryByRole("button", { name: "Xem hàng đợi" })).toBeNull();

    // Chờ promise tabs.query (useEffect) kết thúc trong act — output pristine.
    await act(async () => {});
  });

  it("(g) view home hiện header greeting + promo với copy verbatim", async () => {
    render(<App />);
    expect(await screen.findByAltText("QuizKard")).toBeTruthy();
    expect(screen.getByText("Học từ chính video bạn xem hôm nay")).toBeTruthy();
    expect(await screen.findByText("Gặp video hay? Lưu 1 chạm về QuizKard!")).toBeTruthy();

    // Chờ promise tabs.query (useEffect) kết thúc trong act — output pristine.
    await act(async () => {});
  });

  it("(h) YouTube + TikTok/Reels succeeded → nút Xem trên Web đúng deep-link theo nền tảng; pending không có nút", async () => {
    storageData.set("braintot:pending-links", {
      done: {
        id: "a".repeat(64),
        url: "https://www.youtube.com/watch?v=uSjtxnvCacA",
        platform: "youtube",
        videoId: "uSjtxnvCacA",
        status: "succeeded",
        savedAt: "2026-11-07T04:45:30.842Z",
        processedAt: "2026-11-07T04:46:10.000Z",
      },
      doneTikTok: {
        id: "d".repeat(64),
        url: "https://www.tiktok.com/@anhmithoctienganh/video/7628629210445204756",
        platform: "tiktok",
        videoId: "7628629210445204756",
        status: "succeeded",
        savedAt: "2026-11-07T04:45:50.842Z",
        processedAt: "2026-11-07T04:46:20.000Z",
      },
      waiting: {
        id: "b".repeat(64),
        url: "https://www.tiktok.com/@creator/video/1234567890123456789",
        platform: "tiktok",
        videoId: "1234567890123456789",
        status: "pending",
        savedAt: "2026-11-07T04:45:40.842Z",
      },
      doneReel: {
        id: "c".repeat(64),
        url: "https://www.facebook.com/reel/2431405740998979",
        platform: "facebook_reel",
        videoId: "2431405740998979",
        status: "succeeded",
        savedAt: "2026-11-07T04:46:00.842Z",
        processedAt: "2026-11-07T04:46:30.000Z",
      },
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    const openButtons = await screen.findAllByRole("button", { name: "Xem trên Web" });
    expect(openButtons).toHaveLength(3); // YouTube + TikTok + Reels succeeded

    const openedUrls: string[] = [];
    for (const button of openButtons) {
      fireEvent.click(button);
      await waitFor(() => {
        expect(tabsCreate).toHaveBeenCalledTimes(openedUrls.length + 1);
      });
      openedUrls.push(tabsCreate.mock.calls[openedUrls.length]?.[0]?.url ?? "");
    }

    // Mọi nền tảng mở /flashcards?video=<videoId theo engine> (spec/57)
    expect(openedUrls).toContain("https://braintot.tonythaniel.com/flashcards?video=uSjtxnvCacA");
    expect(openedUrls).toContain(
      "https://braintot.tonythaniel.com/flashcards?video=tt_7628629210445204756",
    );
    expect(openedUrls).toContain(
      "https://braintot.tonythaniel.com/flashcards?video=fb_2431405740998979",
    );

    // Link pending: chỉ chip chờ, không có nút web cho link chưa xử lý.
    expect(screen.getByText("Đang chờ")).toBeTruthy();

    await act(async () => {});
  });

  it("(i) đã liên kết Google → chip email + Đăng xuất trong hàng đợi", async () => {
    const { saveAuthSession } = await import("../../lib/backend-auth");
    await saveAuthSession({
      accessToken: "g",
      email: "user@gmail.com",
      expiresAt: Date.now() + 3_600_000,
      uid: "u1",
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    expect(await screen.findByText(/user@gmail.com/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeTruthy();
    // Chưa liên kết thì có nút liên kết — đã liên kết thì không còn.
    expect(screen.queryByRole("button", { name: "Liên kết QuizKard Web" })).toBeNull();

    await act(async () => {});
  });

  it("(j) queue với card → KHÔNG còn ký tự emoji/AI-slop nào trong copy", async () => {
    storageData.set("braintot:pending-links", {
      done: {
        id: "a".repeat(64),
        url: "https://www.youtube.com/watch?v=uSjtxnvCacA",
        platform: "youtube",
        videoId: "uSjtxnvCacA",
        status: "succeeded",
        savedAt: "2026-11-08T04:45:30.842Z",
        processedAt: "2026-11-08T04:46:10.000Z",
      },
      waiting: {
        id: "b".repeat(64),
        url: "https://www.tiktok.com/@creator/video/1234567890123456789",
        platform: "tiktok",
        videoId: "1234567890123456789",
        status: "pending",
        savedAt: "2026-11-08T04:45:40.842Z",
      },
    });
    const { container } = render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));
    await screen.findByRole("heading", { level: 2, name: "Hàng đợi" });

    // Emoji + arrow + symbol blocks (2190-2BFF, 1F000-1FAFF) — copy sạch.
    expect(container.textContent).not.toMatch(/[\u2190-\u2BFF]|[\u{1F000}-\u{1FAFF}]/u);

    await act(async () => {});
  });

  it("(k) không còn nút/kết quả 'Đồng bộ' nào trong hàng đợi (sync nền spec/24)", async () => {
    storageData.set("braintot:pending-links", {
      done: {
        id: "a".repeat(64),
        url: "https://www.youtube.com/watch?v=uSjtxnvCacA",
        platform: "youtube",
        videoId: "uSjtxnvCacA",
        status: "succeeded",
        savedAt: "2026-11-08T04:45:30.842Z",
        processedAt: "2026-11-08T04:46:10.000Z",
      },
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    expect(await screen.findByText("Sẵn sàng")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Đồng bộ/ })).toBeNull();
    expect(screen.queryByText(/Đang đồng bộ/)).toBeNull();

    await act(async () => {});
  });

  it("(l) tab bar: Trang chủ active mặc định, tab sang Hàng đợi rồi về lại, badge đếm link", async () => {
    storageData.set("braintot:pending-links", {
      one: {
        id: "a".repeat(64),
        url: "https://www.tiktok.com/@creator/video/1234567890123456789",
        platform: "tiktok",
        videoId: "1234567890123456789",
        status: "pending",
        savedAt: "2026-11-08T04:45:30.842Z",
      },
      two: {
        id: "b".repeat(64),
        url: "https://www.youtube.com/watch?v=uSjtxnvCacA",
        platform: "youtube",
        videoId: "uSjtxnvCacA",
        status: "succeeded",
        savedAt: "2026-11-08T04:45:40.842Z",
      },
    });
    render(<App />);

    const tabHome = await screen.findByTestId("tab-home");
    const tabQueue = await screen.findByTestId("tab-queue");
    expect(tabHome.getAttribute("aria-current")).toBe("page");
    expect(tabQueue.getAttribute("aria-current")).toBeNull();

    // Badge hiện sau khi App load xong hàng đợi, đúng số link.
    expect((await screen.findByTestId("queue-badge")).textContent).toBe("2");

    fireEvent.click(tabQueue);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Hàng đợi" })
    ).toBeTruthy();
    expect(tabQueue.getAttribute("aria-current")).toBe("page");

    fireEvent.click(tabHome);
    expect(await screen.findByRole("button", { name: "Lưu trang này" })).toBeTruthy();
    await act(async () => {});
  });

  it("(m) hàng đợi trống → badge ẩn trên tab", async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.queryByTestId("queue-badge")).toBeNull();
  });

  // --- spec/31 T4: dashboard trang chủ (chỉ dữ liệu thật) ---

  it("(n) greeting từ email Google + nút Truy cập đến Web mở web root", async () => {
    const { saveAuthSession } = await import("../../lib/backend-auth");
    await saveAuthSession({
      accessToken: "g",
      email: "minh.nguyen@gmail.com",
      expiresAt: Date.now() + 3_600_000,
      uid: "u1",
    });
    render(<App />);

    // Tên = segment đầu của local-part, viết hoa chữ cái đầu.
    expect(await screen.findByText("Chào Minh")).toBeTruthy();

    fireEvent.click(screen.getByTestId("open-web"));
    expect(tabsCreate).toHaveBeenCalledTimes(1);
    expect(tabsCreate.mock.calls[0]?.[0]).toEqual({
      url: "https://braintot.tonythaniel.com",
      active: true,
    });
    await act(async () => {});
  });

  it("(n2) chưa liên kết → greeting 'Chào bạn'", async () => {
    render(<App />);
    expect(await screen.findByText("Chào bạn")).toBeTruthy();
    await act(async () => {});
  });

  it("(o) stats thật → chip streak, goal X/Y, strip tuần, grid số liệu + video đã lưu", async () => {
    storageData.set("braintot:pending-links", {
      one: {
        id: "a".repeat(64),
        url: "https://www.tiktok.com/@creator/video/1234567890123456789",
        platform: "tiktok",
        videoId: "1234567890123456789",
        status: "pending",
        savedAt: "2026-11-08T04:45:30.842Z",
      },
      two: {
        id: "b".repeat(64),
        url: "https://www.youtube.com/watch?v=uSjtxnvCacA",
        platform: "youtube",
        videoId: "uSjtxnvCacA",
        status: "succeeded",
        savedAt: "2026-11-08T04:45:40.842Z",
      },
    });
    fetchUserStatsMock.mockResolvedValue({
      streakDays: 13,
      lastActiveDate: "2026-11-05",
      todayReviewedCount: 5,
      totalPracticedCount: 128,
      dailyGoal: 20,
      customChunksCount: 34,
      totalChunksCount: 40,
    });
    render(<App />);

    expect(await screen.findByTestId("streak-chip")).toBeTruthy();
    expect(screen.getByTestId("streak-chip").textContent).toContain("13");

    // Card mục tiêu: 5/20 câu luyện.
    expect(screen.getByTestId("goal-progress").textContent).toContain("5");
    expect(screen.getByTestId("goal-progress").textContent).toContain("20");

    // Grid "Số liệu của bạn": 128 luyện / 34 cụm từ / 2 video đã lưu / 5 hôm nay.
    const grid = screen.getByTestId("stats-grid");
    expect(grid.textContent).toContain("Từ vựng đã luyện");
    expect(grid.textContent).toContain("Cụm từ đã lưu");
    expect(grid.textContent).toContain("Video đã lưu");
    expect(grid.textContent).toContain("128");
    expect(grid.textContent).toContain("34");
    expect(grid.textContent).toContain("5");

    // Dải tuần 7 ô ngày T2→CN.
    const week = screen.getByTestId("streak-week");
    expect(week.textContent).toContain("T2");
    expect(week.textContent).toContain("CN");
    expect(week.querySelectorAll(".week-day").length).toBe(7);
    await act(async () => {});
  });

  it("(p) không có stats → ẩn cả dashboard (không có ô '—'), chip streak ẩn, vẫn có nút Lưu trang này và số video đã lưu", async () => {
    storageData.set("braintot:pending-links", {
      one: {
        id: "a".repeat(64),
        url: "https://www.tiktok.com/@creator/video/1234567890123456789",
        platform: "tiktok",
        videoId: "1234567890123456789",
        status: "pending",
        savedAt: "2026-11-08T04:45:30.842Z",
      },
    });
    render(<App />);

    expect(await screen.findByRole("button", { name: "Lưu trang này" })).toBeTruthy();
    expect(screen.queryByTestId("stats-grid")).toBeNull();
    expect(screen.queryByTestId("goal-card")).toBeNull();
    expect(screen.queryByTestId("streak-week")).toBeNull();
    expect(screen.queryByTestId("streak-chip")).toBeNull();
    // Video đã lưu vẫn hiện số thật từ hàng đợi (đếm async sau render đầu).
    await waitFor(() => {
      expect(document.querySelector(".saved-chip")?.textContent).toContain("1");
    });
    await act(async () => {});
  });

  // --- spec/31 T5: hàng đợi restyle (chip lọc + retry + paste bar) ---

  /** Seed 4 link đủ 4 trạng thái (spec/31 T5) — record key = link.id như production. */
  function seedFourLinks(): void {
    storageData.set("braintot:pending-links", {
      ["a".repeat(64)]: {
        id: "a".repeat(64),
        url: "https://www.tiktok.com/@creator/video/1234567890123456789",
        platform: "tiktok",
        videoId: "1234567890123456789",
        status: "pending",
        savedAt: "2026-11-08T04:45:30.842Z",
      },
      ["b".repeat(64)]: {
        id: "b".repeat(64),
        url: "https://www.youtube.com/watch?v=uSjtxnvCacA",
        platform: "youtube",
        videoId: "uSjtxnvCacA",
        status: "processing",
        savedAt: "2026-11-08T04:45:35.842Z",
      },
      ["c".repeat(64)]: {
        id: "c".repeat(64),
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        platform: "youtube",
        videoId: "dQw4w9WgXcQ",
        status: "succeeded",
        savedAt: "2026-11-08T04:45:40.842Z",
        processedAt: "2026-11-08T04:46:10.000Z",
      },
      ["d".repeat(64)]: {
        id: "d".repeat(64),
        url: "https://www.tiktok.com/@other/video/9999999999999999999",
        platform: "tiktok",
        videoId: "9999999999999999999",
        status: "failed",
        savedAt: "2026-11-08T04:45:45.842Z",
        failureReason: "VIDEO_TOO_LONG",
      },
    });
  }

  it("(q) chip lọc đếm đúng + bấm Lỗi chỉ còn card failed + subtitle số video", async () => {
    seedFourLinks();
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    expect(await screen.findByText("4 video · chưa bật nhắc ôn")).toBeTruthy();
    expect(screen.getByTestId("filter-all").textContent).toContain("4");
    expect(screen.getByTestId("filter-waiting").textContent).toContain("2");
    expect(screen.getByTestId("filter-succeeded").textContent).toContain("1");
    expect(screen.getByTestId("filter-failed").textContent).toContain("1");

    fireEvent.click(screen.getByTestId("filter-failed"));
    expect(screen.getByText("@other")).toBeTruthy();
    expect(screen.queryByText("@creator")).toBeNull();
    await act(async () => {});
  });

  it("(r2) nút xoá: xác nhận rồi xoá link khỏi hàng đợi (chưa liên kết → chỉ xoá local)", async () => {
    seedFourLinks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    const buttons = await screen.findAllByTestId("delete-link");
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[0]!);

    await waitFor(() => {
      expect(storedLinks()).toHaveLength(3);
    });
    vi.restoreAllMocks();
    await act(async () => {});
  });

  it("(r3) huỷ xác nhận → không xoá gì", async () => {
    seedFourLinks();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    fireEvent.click((await screen.findAllByTestId("delete-link"))[0]!);

    expect(storedLinks()).toHaveLength(4);
    vi.restoreAllMocks();
    await act(async () => {});
  });

  it("(gate-1) chưa liên kết → Trang chủ không có ô dán link hay nút lưu, chỉ có nút đăng nhập", async () => {
    getLinkStatusMock.mockReturnValue("unlinked");
    render(<App />);

    expect(await screen.findByTestId("link-gate")).toBeTruthy();
    expect(screen.getByText("Đăng nhập để lưu video")).toBeTruthy();
    expect(screen.queryByLabelText("Lưu bằng đường dẫn video")).toBeNull();
    expect(screen.queryByText("Lưu vào QuizKard")).toBeNull();
    expect(screen.queryByText("Lưu trang này")).toBeNull();
    // Cả dashboard và tab bar đều ẩn: chưa đăng nhập thì không dùng được app.
    expect(screen.queryByTestId("tab-queue")).toBeNull();
    expect(screen.queryByText("Số liệu của bạn")).toBeNull();
    await act(async () => {});
  });

  it("(gate-2) phiên hết hạn → chỉ còn màn liên kết lại, không có tab bar, hàng đợi hay ô dán", async () => {
    getLinkStatusMock.mockReturnValue("expired");
    seedFourLinks();
    render(<App />);
    expect(await screen.findByText("Phiên liên kết đã hết hạn")).toBeTruthy();
    expect(screen.getByText("Liên kết lại")).toBeTruthy();
    expect(screen.queryByTestId("tab-queue")).toBeNull();
    expect(screen.queryByTestId("tab-home")).toBeNull();
    expect(screen.queryByTestId("delete-link")).toBeNull();
    expect(screen.queryByTestId("queue-paste-input")).toBeNull();
    await act(async () => {});
  });

  it("(gate-3) đã liên kết → có nút Lưu trang này và không có gate", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Lưu trang này" })).toBeTruthy();
    expect(screen.queryByTestId("link-gate")).toBeNull();
    await act(async () => {});
  });

  it("(r) card failed có nút Thử lại → updateLink về pending + chip cập nhật", async () => {
    seedFourLinks();
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    fireEvent.click(await screen.findByTestId("retry-link"));
    await waitFor(() => {
      const failed = storedLinks().find((link) => link.status === "failed");
      expect(failed).toBeUndefined();
    });
    // Chip lọc cập nhật: Chờ (3), Lỗi (0).
    expect(screen.getByTestId("filter-waiting").textContent).toContain("3");
    expect(screen.getByTestId("filter-failed").textContent).toContain("0");
    await act(async () => {});
  });

  it("(s) hàng đợi không còn ô dán link ở footer", async () => {
    seedFourLinks();
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));
    await screen.findByText("4 video · chưa bật nhắc ôn");

    expect(screen.queryByTestId("queue-paste-input")).toBeNull();
    expect(screen.queryByTestId("queue-paste-add")).toBeNull();
    await act(async () => {});
  });
});
