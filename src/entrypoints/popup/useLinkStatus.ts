/**
 * Trạng thái liên kết tài khoản web cho popup (spec/62): "loading" tới khi `initBackendAuth()`
 * nạp xong token từ storage, sau đó linked / expired / unlinked.
 */

import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import {
  getLinkStatus,
  initBackendAuth,
  reloadAuth,
  SESSION_KEY,
  type LinkStatus,
} from "../../lib/backend-auth";

export function useLinkStatus(): LinkStatus | "loading" {
  const [status, setStatus] = useState<LinkStatus | "loading">("loading");
  useEffect(() => {
    let cancelled = false;
    void initBackendAuth().finally(() => {
      if (!cancelled) setStatus(getLinkStatus());
    });
    const onStorageChanged = (
      changes: Record<string, unknown>,
      areaName: string,
    ): void => {
      if (areaName !== "local" || !(SESSION_KEY in changes)) return;
      void reloadAuth().finally(() => {
        if (!cancelled) setStatus(getLinkStatus());
      });
    };
    browser.storage?.onChanged?.addListener(onStorageChanged);
    return () => {
      cancelled = true;
      browser.storage?.onChanged?.removeListener(onStorageChanged);
    };
  }, []);
  return status;
}
