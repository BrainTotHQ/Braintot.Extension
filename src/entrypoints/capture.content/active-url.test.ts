// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  isDurationTooLong,
  parseDurationText,
  resolveActiveCaptureUrl,
  resolveActiveVideoDurationSec,
} from "./active-url";

function mockRect(el: Element, top: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 400,
      width: 400,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

beforeEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
});

describe("resolveActiveCaptureUrl", () => {
  it("trả nguyên href khi URL đã là video/photo hợp lệ", () => {
    expect(resolveActiveCaptureUrl(document, "https://www.youtube.com/shorts/xsFgrZdomDQ")).toBe(
      "https://www.youtube.com/shorts/xsFgrZdomDQ",
    );
    expect(
      resolveActiveCaptureUrl(
        document,
        "https://www.tiktok.com/@minhtrn7495/photo/7707470481502342408",
      ),
    ).toBe("https://www.tiktok.com/@minhtrn7495/photo/7707470481502342408");
  });

  it("TikTok For You: lấy link trực tiếp từ bài đăng đang ở giữa viewport", () => {
    document.body.innerHTML = `
      <article data-e2e="recommend-list-item-container" id="first">
        <a href="/@user1/video/7300000000000000001">video 1</a>
      </article>
      <article data-e2e="recommend-list-item-container" id="second">
        <a href="/@user2/video/7300000000000000002?is_from_webapp=1">video 2</a>
      </article>
    `;
    mockRect(document.getElementById("first")!, -850, 800);
    mockRect(document.getElementById("second")!, 40, 800);

    expect(resolveActiveCaptureUrl(document, "https://www.tiktok.com/")).toBe(
      "https://www.tiktok.com/@user2/video/7300000000000000002",
    );
  });

  it("TikTok For You: trích ID từ xgwrapper + handle tác giả khi DOM không có link video trực tiếp", () => {
    document.body.innerHTML = `
      <article data-e2e="recommend-list-item-container">
        <a href="/@kheoannoi">Khéo Ăn Nói</a>
        <div id="xgwrapper-0-7710187722907929863"><video></video></div>
      </article>
    `;
    mockRect(document.querySelector("article")!, 20, 820);

    expect(resolveActiveCaptureUrl(document, "https://www.tiktok.com/foryou")).toBe(
      "https://www.tiktok.com/@kheoannoi/video/7710187722907929863",
    );
  });

  it("TikTok For You photo slideshow: dùng /photo/<id> khi có photo-mode và không có thẻ video", () => {
    document.body.innerHTML = `
      <article data-e2e="recommend-list-item-container">
        <a href="/@thaoquynh">Thảo Quỳnh</a>
        <div data-e2e="photo-mode" id="xgwrapper-0-7707470481502342408"></div>
      </article>
    `;
    mockRect(document.querySelector("article")!, 20, 820);

    expect(resolveActiveCaptureUrl(document, "https://www.tiktok.com/")).toBe(
      "https://www.tiktok.com/@thaoquynh/photo/7707470481502342408",
    );
  });

  it("trang không có video nào → trả null", () => {
    expect(resolveActiveCaptureUrl(document, "https://www.tiktok.com/")).toBeNull();
    expect(resolveActiveCaptureUrl(document, "https://www.youtube.com/")).toBeNull();
  });
});

describe("parseDurationText & resolveActiveVideoDurationSec (> 3 phút)", () => {
  it("parse MM:SS, H:MM:SS và cặp seekbar 00:02 / 07:11", () => {
    expect(parseDurationText("02:59")).toBe(179);
    expect(parseDurationText("03:00")).toBe(180);
    expect(parseDurationText("03:01")).toBe(181);
    expect(parseDurationText("00:02 / 07:11")).toBe(431);
    expect(parseDurationText("1:02:05")).toBe(3725);
    expect(parseDurationText("abc")).toBeNull();
  });

  it("isDurationTooLong chỉ true khi vượt quá 180 giây (3 phút)", () => {
    expect(isDurationTooLong(null)).toBe(false);
    expect(isDurationTooLong(180)).toBe(false);
    expect(isDurationTooLong(180.5)).toBe(true);
    expect(isDurationTooLong(431)).toBe(true);
  });

  it("YouTube watch: đọc duration từ thẻ video chính và bỏ qua ad-showing", () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player">
        <video class="html5-main-video"></video>
        <span class="ytp-time-duration">10:25</span>
      </div>
    `;
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 625, configurable: true });
    expect(resolveActiveVideoDurationSec(document, "https://www.youtube.com/watch?v=xsFgrZdomDQ")).toBe(625);

    // Khi đang chiếu quảng cáo 15s → không lấy 15s của ad mà đọc thời lượng gốc từ .ytp-time-duration.
    document.getElementById("movie_player")!.classList.add("ad-showing");
    Object.defineProperty(video, "duration", { value: 15, configurable: true });
    expect(resolveActiveVideoDurationSec(document, "https://www.youtube.com/watch?v=xsFgrZdomDQ")).toBe(625);
  });

  it("YouTube SPA Watch → Shorts: không lấy nhầm duration từ #movie_player cũ còn sót trong DOM", () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player" hidden>
        <video class="html5-main-video"></video>
        <span class="ytp-time-duration">10:25</span>
      </div>
      <div id="shorts-player">
        <video></video>
      </div>
    `;
    const oldWatchVideo = document.querySelector("#movie_player video")!;
    Object.defineProperty(oldWatchVideo, "duration", { value: 625, configurable: true });
    const shortsVideo = document.querySelector("#shorts-player video")!;
    Object.defineProperty(shortsVideo, "duration", { value: 42, configurable: true });

    expect(resolveActiveVideoDurationSec(document, "https://www.youtube.com/shorts/xsFgrZdomDQ")).toBe(42);

    // Kể cả khi Shorts video chưa load xong duration (NaN) → trả null, không lấy 10:25 của trang Watch cũ.
    Object.defineProperty(shortsVideo, "duration", { value: Number.NaN, configurable: true });
    expect(resolveActiveVideoDurationSec(document, "https://www.youtube.com/shorts/xsFgrZdomDQ")).toBeNull();
  });

  it("TikTok For You: đọc seekbar 00:02 / 07:11 trong bài active; photo slideshow → null", () => {
    document.body.innerHTML = `
      <article data-e2e="recommend-list-item-container">
        <div class="SeekBarTimeContainer">00:02 / 07:11</div>
        <video></video>
      </article>
    `;
    mockRect(document.querySelector("article")!, 20, 800);
    expect(resolveActiveVideoDurationSec(document, "https://www.tiktok.com/")).toBe(431);

    document.body.innerHTML = `
      <article data-e2e="recommend-list-item-container">
        <div data-e2e="photo-mode"></div>
      </article>
    `;
    mockRect(document.querySelector("article")!, 20, 800);
    expect(resolveActiveVideoDurationSec(document, "https://www.tiktok.com/")).toBeNull();
  });
});
