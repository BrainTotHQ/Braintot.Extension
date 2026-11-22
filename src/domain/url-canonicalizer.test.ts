import { describe, expect, it } from "vitest";

import { normalizeCaptureUrl } from "./url-canonicalizer";

describe("normalizeCaptureUrl", () => {
  it("chuẩn hóa YouTube Shorts về dạng watch?v=", () => {
    const result = normalizeCaptureUrl(
      "https://www.youtube.com/shorts/xsFgrZdomDQ?feature=share"
    );
    expect(result).toEqual({
      platform: "youtube",
      videoId: "xsFgrZdomDQ",
      canonicalUrl: "https://www.youtube.com/watch?v=xsFgrZdomDQ",
    });
  });

  it("nhận diện các biến thể URL YouTube: youtu.be, m.youtube, embed, live", () => {
    const variants = [
      "https://youtu.be/xsFgrZdomDQ?si=abc123",
      "https://m.youtube.com/shorts/xsFgrZdomDQ",
      "https://www.youtube.com/embed/xsFgrZdomDQ",
      "https://www.youtube.com/live/xsFgrZdomDQ",
      "https://www.youtube.com/watch?v=xsFgrZdomDQ&t=42s&utm_source=tiktok",
    ];
    for (const variant of variants) {
      expect(normalizeCaptureUrl(variant)?.videoId).toBe("xsFgrZdomDQ");
      expect(normalizeCaptureUrl(variant)?.canonicalUrl).toBe(
        "https://www.youtube.com/watch?v=xsFgrZdomDQ"
      );
    }
  });

  it("chuẩn hóa TikTok video và bỏ tracking params", () => {
    const result = normalizeCaptureUrl(
      "https://www.tiktok.com/@creator/video/7301234567890123456?tt_from=share&utm_source=copy"
    );
    expect(result).toEqual({
      platform: "tiktok",
      videoId: "7301234567890123456",
      canonicalUrl: "https://www.tiktok.com/@creator/video/7301234567890123456",
    });
  });

  it("chuẩn hóa TikTok photo slideshow (khớp mobile + AI engine)", () => {
    const result = normalizeCaptureUrl(
      "https://www.tiktok.com/@minhtrn7495/photo/7707470481502342408?is_from_webapp=1"
    );
    expect(result).toEqual({
      platform: "tiktok",
      videoId: "7707470481502342408",
      canonicalUrl: "https://www.tiktok.com/@minhtrn7495/photo/7707470481502342408",
    });
  });

  it("nhận link share tiktok.com/t/<code>", () => {
    const result = normalizeCaptureUrl("https://www.tiktok.com/t/ZTabc123/");
    expect(result).toEqual({
      platform: "tiktok",
      videoId: "ZTabc123",
      canonicalUrl: "https://www.tiktok.com/t/ZTabc123",
    });
  });

  it("nhận link rút gọn vm.tiktok.com — giữ URL gốc, engine tự resolve redirect (spec 33)", () => {
    const result = normalizeCaptureUrl("https://vm.tiktok.com/ZMabcdef/?tt_from=share");
    expect(result).toEqual({
      platform: "tiktok",
      videoId: "vm_ZMabcdef",
      canonicalUrl: "https://vm.tiktok.com/ZMabcdef/?tt_from=share",
    });
  });

  it("nhận link rút gọn vt.tiktok.com tương tự vm.tiktok.com", () => {
    const result = normalizeCaptureUrl("https://vt.tiktok.com/ZSabc123/");
    expect(result).toEqual({
      platform: "tiktok",
      videoId: "vt_ZSabc123",
      canonicalUrl: "https://vt.tiktok.com/ZSabc123/",
    });
  });

  it("từ chối short-link TikTok rỗng code", () => {
    expect(normalizeCaptureUrl("https://vm.tiktok.com/")).toBeNull();
  });

  it("nhận diện Facebook Reel", () => {
    const result = normalizeCaptureUrl("https://www.facebook.com/reel/1234567890");
    expect(result).toEqual({
      platform: "facebook_reel",
      videoId: "1234567890",
      canonicalUrl: "https://www.facebook.com/reel/1234567890",
    });
  });

  it("chuẩn hóa Facebook /reels/videos/ về cùng canonicalUrl với /reel/ cho cùng videoId", () => {
    const fromReel = normalizeCaptureUrl("https://www.facebook.com/reel/9876543210");
    const fromReelsVideos = normalizeCaptureUrl(
      "https://www.facebook.com/reels/videos/9876543210/12345678901234567?utm_source=share"
    );
    expect(fromReel?.videoId).toBe("9876543210");
    expect(fromReelsVideos?.videoId).toBe("9876543210");
    expect(fromReel?.canonicalUrl).toBe("https://www.facebook.com/reel/9876543210");
    expect(fromReelsVideos?.canonicalUrl).toBe("https://www.facebook.com/reel/9876543210");
    expect(fromReelsVideos?.canonicalUrl).toBe(fromReel?.canonicalUrl);
    expect(fromReelsVideos?.platform).toBe("facebook_reel");
  });

  it("nhận link share fb.watch/<code> — giữ URL gốc, engine tự resolve (spec 33)", () => {
    const result = normalizeCaptureUrl("https://fb.watch/XYZ789?utm_source=share");
    expect(result).toEqual({
      platform: "facebook_reel",
      videoId: "fbw_XYZ789",
      canonicalUrl: "https://fb.watch/XYZ789?utm_source=share",
    });
  });

  it("nhận link share facebook.com/share/r/... và facebook.com/watch?v=...", () => {
    expect(normalizeCaptureUrl("https://www.facebook.com/share/r/AbC123/?utm_source=x")).toEqual({
      platform: "facebook_reel",
      videoId: "fbw_AbC123",
      canonicalUrl: "https://www.facebook.com/share/r/AbC123",
    });
    expect(normalizeCaptureUrl("https://www.facebook.com/watch/?v=9876543210")).toEqual({
      platform: "facebook_reel",
      videoId: "9876543210",
      canonicalUrl: "https://www.facebook.com/reel/9876543210",
    });
  });

  it("từ chối fb.watch rỗng code", () => {
    expect(normalizeCaptureUrl("https://fb.watch/")).toBeNull();
  });

  it("từ chối URL không phải video ngắn và URL rác", () => {
    expect(normalizeCaptureUrl("https://www.youtube.com/feed/subscriptions")).toBeNull();
    expect(normalizeCaptureUrl("https://google.com")).toBeNull();
    expect(normalizeCaptureUrl("khong phai url")).toBeNull();
    expect(normalizeCaptureUrl("")).toBeNull();
  });

  it("từ chối YouTube ID sai định dạng (không đủ 11 ký tự bộ cơ sở 64 của YouTube)", () => {
    expect(normalizeCaptureUrl("https://www.youtube.com/shorts/short-id")).toBeNull();
  });
});
