import { describe, expect, it } from "vitest";

import { buildCapturePayload } from "./capture-payload";
import { MSG_CAPTURE_SAVE, type CaptureSaveSource } from "./messages";

const SOURCES: readonly CaptureSaveSource[] = [
  "content-button",
  "popup-paste",
  "popup-current-tab",
];

describe("buildCapturePayload", () => {
  it("chuẩn hóa YouTube Shorts thành payload 3 field với từng nguồn capture", () => {
    for (const source of SOURCES) {
      expect(
        buildCapturePayload("https://www.youtube.com/shorts/dQw4w9WgXcQ?si=xyz", source)
      ).toEqual({
        type: MSG_CAPTURE_SAVE,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        source,
      });
    }
  });

  it("payload chỉ gồm đúng 3 field: type, url, source", () => {
    const payload = buildCapturePayload(
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "content-button"
    );
    expect(Object.keys(payload ?? {})).toEqual(["type", "url", "source"]);
    expect(payload?.type).toBe("braintot/capture-save");
  });

  it("nhận link rút gọn TikTok — payload giữ URL gốc làm canonical (engine tự resolve, spec 33)", () => {
    const payload = buildCapturePayload("https://vm.tiktok.com/abc123", "popup-paste");
    expect(payload).not.toBeNull();
    expect(payload?.url).toBe("https://vm.tiktok.com/abc123");
    expect(payload?.source).toBe("popup-paste");
  });

  it("từ chối chuỗi rác không phải URL", () => {
    expect(buildCapturePayload("khong phai url", "popup-current-tab")).toBeNull();
  });

  it("chuẩn hóa Facebook /reels/videos/ về canonical /reel/<id>", () => {
    expect(
      buildCapturePayload(
        "https://www.facebook.com/reels/videos/9876543210/12345678901234567?utm_source=share",
        "content-button"
      )
    ).toEqual({
      type: MSG_CAPTURE_SAVE,
      url: "https://www.facebook.com/reel/9876543210",
      source: "content-button",
    });
  });
});
