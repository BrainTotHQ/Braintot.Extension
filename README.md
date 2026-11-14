# BrainTot extension (DevFest)

Extension Chrome/Edge (Manifest V3) để lưu nhanh link video ngắn vào hàng đợi học tập của BrainTot, đồng bộ lên backend và theo dõi tiến độ xử lý AI. Xây bằng WXT, React 19 và TypeScript.

Extension không tự đăng nhập: nó **nhận session từ web BrainTot qua handshake** và gọi backend bằng access token đó. Backend (repo `braintot-backend`) chịu trách nhiệm xác thực và xử lý AI.

## Tính năng

| Tính năng | Chi tiết | Mã nguồn |
|---|---|---|
| Nút lưu 1 chạm | Hiện trên YouTube Shorts, TikTok, Facebook Reels, tự gắn/gỡ khi điều hướng SPA; chặn lưu khi chưa đăng nhập | [capture.content](src/entrypoints/capture.content/) |
| Chuẩn hóa URL | `watch?v=`, Shorts, `youtu.be`, embed, TikTok `/@user/video/ID`, Facebook `/reel/ID`; bỏ tham số theo dõi | [url-canonicalizer](src/domain/url-canonicalizer.ts) |
| Hàng đợi cục bộ | `chrome.storage.local`, id là SHA-256 của URL chuẩn hóa nên lưu trùng không tạo bản sao; badge đếm trên icon | [queue-store](src/lib/queue-store.ts), [background](src/entrypoints/background.ts) |
| Đăng nhập qua web | Popup hiện LinkGate nếu chưa có session; mở web `/extension-link?ext=<runtimeId>&nonce=...`, web đã login Google gửi access token về extension qua `externally_connectable` | [LinkGate](src/entrypoints/popup/LinkGate.tsx), [web-link](src/lib/web-link.ts), [web-session.content](src/entrypoints/web-session.content.ts) |
| Đồng bộ backend | Server-first: mọi thay đổi đẩy lên `POST /api/v1/pending-links`; kéo trạng thái mới về; `auto-sync` chạy theo alarm định kỳ; refresh session khi 401 | [queue-api](src/lib/queue-api.ts), [sync-engine](src/lib/sync-engine.ts), [auto-sync](src/lib/auto-sync.ts) |
| Popup + thống kê | Trang chủ (dán link, lưu tab hiện tại) và Hàng đợi (lọc trạng thái, thử lại, xóa, mở video gốc) có số liệu học tập từ backend | [popup](src/entrypoints/popup/), [user-stats](src/lib/user-stats.ts) |

## Đăng nhập hoạt động thế nào

1. Chưa có session: popup hiện **LinkGate**, bấm nút mở web BrainTot.
2. Web (đã đăng nhập Google) mở trang `/extension-link`, nhận `ext=<runtimeId>` + `nonce`, trả access token cho extension.
3. Extension lưu session (expiration rõ ràng) và mọi request sau đó đi qua `authedFetch` (gắn `Authorization: Bearer`).
4. Hết hạn hoặc backend trả 401: session bị xóa, popup quay lại LinkGate.

## Backend

Mặc định: web `https://braintot-web-jsgeeh2ixa-de.a.run.app`, backend `https://braintot.tonythaniel.com`. Đổi được trong `chrome.storage` qua key `WEB_URL` / `BACKEND_URL` (prod backend: `https://braintot.tonythaniel.com`). Muốn demo trọn vẹn cần backend đang chạy (xem repo `braintot-backend`).

## Chạy thử

Yêu cầu: Node `^22.22.2 || ^24.15.0 || >=26.0.0`, pnpm `12.4.2`, Chrome hoặc Edge.

```bash
pnpm install --frozen-lockfile
pnpm prepare
pnpm build
```

Sau đó mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked** và trỏ tới `.output/chrome-mv3`.

Kịch bản demo 2 phút:

1. Mở popup → LinkGate hiện ra → bấm **Đăng nhập qua web** → đăng nhập Google trên web BrainTot → extension tự nhận session.
2. Mở một YouTube Short, TikTok hoặc Facebook Reel. Bấm nút **Lưu vào BrainTot** góc phải dưới.
3. Qua tab **Hàng đợi**: link được đẩy lên backend, trạng thái cập nhật từ server (*Đang chờ* → *Đang xử lý* → *Sẵn sàng*).
4. Ở tab **Trang chủ**, dán thêm một link hoặc bấm **Lưu trang này**; xem thống kê học tập nạp từ backend.

Có thể tạo file zip để cài trực tiếp bằng `pnpm zip` (kết quả ở `.output/`).

## Kiểm tra chất lượng

| Lệnh | Mục đích |
|---|---|
| `pnpm compile` | Kiểm tra kiểu với `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (domain, queue, auth, sync, popup, nút lưu) |
| `pnpm dev` | WXT dev server cho Chrome MV3 |

## Cấu trúc

```
src/
  domain/                pending-link, url-canonicalizer (TypeScript thuần, có test)
  lib/                   backend-config, backend-auth, authed-fetch, web-link,
                         web-session, queue-api, sync-engine, auto-sync,
                         user-stats, queue-store, messages, queue-display
  entrypoints/
    background.ts        nhận lệnh lưu, badge, sync alarms, handshake link web
    capture.content/     nút lưu và toast trên trang video
    web-session.content.ts  nhận session từ trang web BrainTot
    popup/               Trang chủ + Hàng đợi + LinkGate
```

Thuật ngữ miền: *pending link* là một link video đã lưu và chờ biến thành bài học. Danh sách đầy đủ xem ở [GLOSSARY.md](GLOSSARY.md).
