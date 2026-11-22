// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { resolveActiveCaptureUrl } from "./active-url";

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
