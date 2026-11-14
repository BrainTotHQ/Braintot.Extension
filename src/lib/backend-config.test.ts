/**
 * Test backend-config (spec/57): deep-link "Xem trên Web" mở /flashcards?video=<videoId>
 * (web đã gỡ route /youtube); videoId theo keyspace engine tt_/ttvm_/fb_/fbw_.
 */

import { afterEach, describe, expect, it } from "vitest";

import { engineVideoId, getWebBaseUrl, webFlashcardsUrl } from "./backend-config";

const envBag = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

describe("webFlashcardsUrl", () => {
  afterEach(() => {
    delete envBag.PUBLIC_WEB_URL;
    delete envBag.VITE_WEB_URL;
  });

  it("có env PUBLIC_WEB_URL → /flashcards?video=<id>", () => {
    envBag.PUBLIC_WEB_URL = "https://braintot-web-jsgeeh2ixa-de.a.run.app";
    expect(webFlashcardsUrl("abc123")).toBe(
      "https://braintot-web-jsgeeh2ixa-de.a.run.app/flashcards?video=abc123",
    );
  });

  it("không có env → mặc định prod domain", () => {
    expect(getWebBaseUrl()).toBe("https://braintot-web-jsgeeh2ixa-de.a.run.app");
    expect(webFlashcardsUrl("xYz_-9")).toBe(
      "https://braintot-web-jsgeeh2ixa-de.a.run.app/flashcards?video=xYz_-9",
    );
  });

  it("videoId được encodeURIComponent, base URL bỏ dấu / cuối", () => {
    envBag.VITE_WEB_URL = "https://braintot-web-jsgeeh2ixa-de.a.run.app/";
    expect(webFlashcardsUrl("a&b=c")).toBe(
      "https://braintot-web-jsgeeh2ixa-de.a.run.app/flashcards?video=a%26b%3Dc",
    );
  });
});

describe("engineVideoId (mirror platforms.py resolve_video_id)", () => {
  it("YouTube giữ id thô", () => {
    expect(
      engineVideoId({ platform: "youtube", videoId: "uSjtxnvCacA", url: "https://www.youtube.com/watch?v=uSjtxnvCacA" }),
    ).toBe("uSjtxnvCacA");
  });

  it("TikTok video → tt_<digits>", () => {
    expect(
      engineVideoId({
        platform: "tiktok",
        videoId: "7628629210445204756",
        url: "https://www.tiktok.com/@anhmithoctienganh/video/7628629210445204756",
      }),
    ).toBe("tt_7628629210445204756");
  });

  it("TikTok short link vm/vt → ttvm_<code> (extension lưu vm_<code>)", () => {
    expect(
      engineVideoId({ platform: "tiktok", videoId: "vm_ZS12abc", url: "https://vm.tiktok.com/ZS12abc/" }),
    ).toBe("ttvm_ZS12abc");
  });

  it("Reels → fb_<id>, fb.watch → fbw_<code>", () => {
    expect(
      engineVideoId({ platform: "facebook_reel", videoId: "2431405740998979", url: "https://www.facebook.com/reel/2431405740998979" }),
    ).toBe("fb_2431405740998979");
    expect(
      engineVideoId({ platform: "facebook_reel", videoId: "fbw_AbC", url: "https://fb.watch/AbC/" }),
    ).toBe("fbw_AbC");
  });
});
