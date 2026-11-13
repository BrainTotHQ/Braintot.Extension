import { describe, expect, it } from "vitest";

import { detailText, displayTitle, formatSavedAgo, thumbnailUrl } from "./queue-display";

describe("queue-display (spec/57)", () => {
  const now = Date.parse("2026-11-13T12:00:00.000Z");

  it("formatSavedAgo theo mốc phút / giờ / ngày", () => {
    expect(formatSavedAgo("2026-11-13T11:59:40.000Z", now)).toBe("vừa xong");
    expect(formatSavedAgo("2026-11-13T11:55:00.000Z", now)).toBe("5 phút trước");
    expect(formatSavedAgo("2026-11-13T09:00:00.000Z", now)).toBe("3 giờ trước");
    expect(formatSavedAgo("2026-11-11T12:00:00.000Z", now)).toBe("2 ngày trước");
    expect(formatSavedAgo("không phải ngày", now)).toBe("");
  });

  it("thumbnailUrl: YouTube có ảnh, TikTok/Reels null", () => {
    expect(thumbnailUrl({ platform: "youtube", videoId: "uSjtxnvCacA" })).toBe(
      "https://i.ytimg.com/vi/uSjtxnvCacA/mqdefault.jpg",
    );
    expect(thumbnailUrl({ platform: "tiktok", videoId: "123" })).toBeNull();
    expect(thumbnailUrl({ platform: "facebook_reel", videoId: "123" })).toBeNull();
  });

  it("displayTitle: @handle, Reel, YouTube, link rút gọn", () => {
    expect(
      displayTitle({ platform: "tiktok", videoId: "1", url: "https://www.tiktok.com/@anhmithoctienganh/video/7628629210445204756" }),
    ).toBe("@anhmithoctienganh");
    expect(displayTitle({ platform: "tiktok", videoId: "vm_x", url: "https://vm.tiktok.com/ZS12abc/" })).toBe("Video TikTok");
    expect(
      displayTitle({ platform: "facebook_reel", videoId: "1", url: "https://www.facebook.com/reel/1384270000001234" }),
    ).toBe("Reel …001234");
    expect(
      displayTitle({ platform: "youtube", videoId: "uSjtxnvCacA", url: "https://www.youtube.com/watch?v=uSjtxnvCacA" }),
    ).toBe("YouTube Short …CacA");
  });

  it("detailText theo trạng thái; lỗi dùng nhãn tiếng Việt, mã lạ giữ nguyên", () => {
    expect(detailText({ status: "succeeded" })).toBe("Đã tạo flashcard");
    expect(detailText({ status: "pending" })).toBe("Chờ xử lý");
    expect(detailText({ status: "processing" })).toBe("Đang tách câu…");
    expect(detailText({ status: "failed", failureReason: "VIDEO_TOO_LONG" }, { VIDEO_TOO_LONG: "Video dài quá 90s" })).toBe(
      "Video dài quá 90s",
    );
    expect(detailText({ status: "failed", failureReason: "X_CODE" })).toBe("X_CODE");
    expect(detailText({ status: "failed" })).toBe("Xử lý thất bại");
  });

  it("displayTitle ưu tiên tên video thật khi đã có", () => {
    expect(
      displayTitle(
        { platform: "youtube", videoId: "uSjtxnvCacA", url: "https://www.youtube.com/watch?v=uSjtxnvCacA" },
        "How to cook",
      ),
    ).toBe("How to cook");
  });
});
