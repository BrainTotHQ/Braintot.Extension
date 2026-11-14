/**
 * fetch kèm `Authorization: Bearer` cho backend. 401 → xin token mới đúng 1 lần
 * rồi thử lại (access token backend không refresh được: getIdToken(true) trả
 * null thì giữ nguyên response 401 để người gọi báo `auth-error`).
 */

import { getIdToken } from "./backend-auth";

export async function authedFetch(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const doFetch = async (token: string): Promise<Response> =>
    fetchImpl(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await doFetch((await getIdToken()) ?? "");
  if (response.status === 401) {
    const fresh = await getIdToken(true);
    if (fresh) response = await doFetch(fresh);
  }
  return response;
}
