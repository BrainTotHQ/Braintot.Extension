/**
 * Trạng thái liên kết tài khoản web cho popup (spec/62): "loading" tới khi `initBackendAuth()`
 * nạp xong token từ storage, sau đó linked / expired / unlinked.
 */

import { useEffect, useState } from "react";

import { getLinkStatus, initBackendAuth, type LinkStatus } from "../../lib/backend-auth";

export function useLinkStatus(): LinkStatus | "loading" {
  const [status, setStatus] = useState<LinkStatus | "loading">("loading");
  useEffect(() => {
    let cancelled = false;
    void initBackendAuth().finally(() => {
      if (!cancelled) setStatus(getLinkStatus());
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
