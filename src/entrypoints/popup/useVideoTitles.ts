/**
 * Tên video cho các card trong popup: đọc cache `braintot:video-titles`, tải các tên còn thiếu
 * qua oEmbed (tối đa MAX_LOOKUPS mỗi lần mở popup, tuần tự) rồi lưu cache lại.
 */

import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import type { PendingLink } from "../../domain/pending-link";
import { fetchVideoTitle, oembedUrl, TITLES_KEY } from "../../lib/video-title";

const MAX_LOOKUPS = 20;

async function readCache(): Promise<Record<string, string>> {
  try {
    const bag = await browser.storage.local.get(TITLES_KEY);
    const raw = bag[TITLES_KEY];
    return typeof raw === "object" && raw !== null ? { ...(raw as Record<string, string>) } : {};
  } catch {
    return {};
  }
}

export function useVideoTitles(links: PendingLink[] | null): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  // Chỉ chạy lại khi tập link đổi (không chạy lại mỗi lần status đổi).
  const linkKey = (links ?? []).map((link) => link.id).join(",");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cache = await readCache();
      if (cancelled) return;
      setTitles(cache);
      const missing = (links ?? [])
        .filter((link) => !cache[link.id] && oembedUrl(link) !== null)
        .slice(0, MAX_LOOKUPS);
      for (const link of missing) {
        const title = await fetchVideoTitle(link);
        if (cancelled) return;
        if (!title) continue;
        cache[link.id] = title;
        setTitles({ ...cache });
        await browser.storage.local.set({ [TITLES_KEY]: cache }).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
    // linkKey đại diện cho `links`: effect không phụ thuộc trạng thái từng link.
  }, [linkKey]);

  return titles;
}
