import { describe, expect, it, vi } from "vitest";

import { fetchVideoTitle, oembedUrl } from "./video-title";

const asFetch = (mock: unknown): typeof fetch => mock as typeof fetch;
const yt = { platform: "youtube" as const, url: "https://www.youtube.com/watch?v=seU3xFo7StQ" };
const tt = { platform: "tiktok" as const, url: "https://www.tiktok.com/@a/video/7628629210445204756" };

describe("video-title", () => {
  it("oembedUrl: YouTube và TikTok có, Reels không", () => {
    expect(oembedUrl(yt)).toBe(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DseU3xFo7StQ&format=json",
    );
    expect(oembedUrl(tt)).toBe(
      "https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40a%2Fvideo%2F7628629210445204756",
    );
    expect(oembedUrl({ platform: "facebook_reel", url: "https://www.facebook.com/reel/1" })).toBeNull();
  });

  it("fetchVideoTitle: trả title đã cắt khoảng trắng", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ title: "  How to cook  " }), { status: 200 }));
    expect(await fetchVideoTitle(yt, asFetch(fetchMock))).toBe("How to cook");
  });

  it("fetchVideoTitle: 404, title rỗng, JSON lỗi, mất mạng, Reels → null", async () => {
    expect(await fetchVideoTitle(yt, asFetch(vi.fn(async () => new Response("{}", { status: 404 }))))).toBeNull();
    expect(await fetchVideoTitle(yt, asFetch(vi.fn(async () => new Response(JSON.stringify({ title: " " })))))).toBeNull();
    expect(await fetchVideoTitle(yt, asFetch(vi.fn(async () => new Response("không phải json"))))).toBeNull();
    expect(
      await fetchVideoTitle(
        yt,
        asFetch(
          vi.fn(async () => {
            throw new TypeError("offline");
          }),
        ),
      ),
    ).toBeNull();
    const reelFetch = vi.fn();
    expect(await fetchVideoTitle({ platform: "facebook_reel", url: "https://www.facebook.com/reel/1" }, asFetch(reelFetch))).toBeNull();
    expect(reelFetch).not.toHaveBeenCalled();
  });
});
