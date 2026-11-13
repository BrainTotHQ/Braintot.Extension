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
});

describe("App — popup paste link + hàng đợi (Playful 3D)", () => {
  it("(a) dán link TikTok hợp lệ → QueueStore lưu vào storage + banner thành công, sang queue thấy card", async () => {
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Dán link video vừa xem"), {
      target: { value: "https://www.tiktok.com/@creator/video/1234567890123456789?utm_source=x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào BrainTot" }));

    expect(await screen.findByText("✓ Đã lưu link")).toBeTruthy();
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

    // Về trang chủ qua tab (không còn nút Quay lại — tab bar là điều hướng).
    fireEvent.click(await screen.findByTestId("tab-home"));
    expect(await screen.findByLabelText("Dán link video vừa xem")).toBeTruthy();
    await act(async () => {});
  });

  it("(b) dán link rút gọn vm.tiktok.com → lưu ngay với URL gốc (engine tự resolve — spec 33)", async () => {
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Dán link video vừa xem"), {
      target: { value: "https://vm.tiktok.com/abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu vào BrainTot" }));

    expect(await screen.findByText("✓ Đã lưu link")).toBeTruthy();
    await waitFor(() => {
      const links = storedLinks();
      expect(links).toHaveLength(1);
      expect(links[0]?.platform).toBe("tiktok");
      expect(links[0]?.url).toBe("https://vm.tiktok.com/abc");
      expect(links[0]?.status).toBe("pending");
    });
  });

  it("(c) hàng đợi rỗng → empty state kiểu mobile: mascot + 'Chưa có gì ở đây' + thẻ 3 bước", async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId("tab-queue"));

    expect(await screen.findByAltText("Linh vật BrainTot cầm sách")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Hàng đợi" })).toBeTruthy();
    expect(screen.getByText("Chưa có gì ở đây")).toBeTruthy();
    const steps = screen.getByTestId("queue-empty-steps");
    expect(steps.textContent).toContain("Mở video YouTube, TikTok hoặc Reels");
    expect(steps.textContent).toContain("Bấm extension BrainTot: dán link hoặc Lưu trang này");
    expect(steps.textContent).toContain("Chờ xử lý — trạng thái đổi ngay trong hàng đợi");

    fireEvent.click(await screen.findByTestId("tab-home"));
    expect(await screen.findByLabelText("Dán link video vừa xem")).toBeTruthy();
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
    expect(await screen.findByText("✓ Đã lưu link")).toBeTruthy();
    expect(storedLinks()[0]?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("(f) CTA 'Lưu vào BrainTot' disabled khi input rỗng, có link thì bật", async () => {
    render(<App />);
    const cta = await screen.findByRole("button", { name: "Lưu vào BrainTot" });
    expect((cta as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Dán link video vừa xem"), {
      target: { value: "https://www.facebook.com/reel/9876543210" },
    });
    expect((cta as HTMLButtonElement).disabled).toBe(false);

    // Chờ promise tabs.query (useEffect) kết thúc trong act — output pristine.
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
    expect(await screen.findByLabelText("Dán link video vừa xem")).toBeTruthy();
    await act(async () => {});
  });

  it("(m) hàng đợi trống → badge ẩn trên tab", async () => {
    render(<App />);
    await act(async () => {});
    expect(screen.queryByTestId("queue-badge")).toBeNull();
  });

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

    expect(await screen.findByText("4 video · demo xử lý giả lập")).toBeTruthy();
    expect(screen.getByTestId("filter-all").textContent).toContain("4");
    expect(screen.getByTestId("filter-waiting").textContent).toContain("2");
    expect(screen.getByTestId("filter-succeeded").textContent).toContain("1");
    expect(screen.getByTestId("filter-failed").textContent).toContain("1");

    fireEvent.click(screen.getByTestId("filter-failed"));
    expect(screen.getByText("@other")).toBeTruthy();
    expect(screen.queryByText("@creator")).toBeNull();
    await act(async () => {});
  });
});
