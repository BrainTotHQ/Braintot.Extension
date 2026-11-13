# BrainTot extension (DevFest)

Extension Chrome/Edge (Manifest V3) để lưu nhanh link video ngắn vào hàng đợi học tập của BrainTot. Xây bằng WXT, React 19 và TypeScript.

Đây là bản gọn dành cho ban giám khảo DevFest. Mọi thứ chạy trong trình duyệt, **không cần backend, tài khoản hay file `.env`**. Bản đầy đủ (đăng nhập qua web, đồng bộ server, AI tách câu) nằm ở repo `braintot-extension`.

## Tính năng có trong repo này

| Tính năng | Chi tiết | Mã nguồn |
|---|---|---|
| Nút lưu 1 chạm | Hiện trên YouTube Shorts, TikTok, Facebook Reels, tự gắn/gỡ khi điều hướng SPA | [capture.content](src/entrypoints/capture.content/) |
| Chuẩn hóa URL | `watch?v=`, Shorts, `youtu.be`, embed, TikTok `/@user/video/ID`, Facebook `/reel/ID`; bỏ tham số theo dõi | [url-canonicalizer](src/domain/url-canonicalizer.ts) |
| Hàng đợi cục bộ | `chrome.storage.local`, id là SHA-256 của URL chuẩn hóa nên lưu trùng không tạo bản sao; badge đếm trên icon | [queue-store](src/lib/queue-store.ts), [background](src/entrypoints/background.ts) |
| Popup | Trang chủ (dán link, lưu tab hiện tại) và Hàng đợi (lọc theo trạng thái, thử lại, xóa, mở video gốc) | [popup](src/entrypoints/popup/) |
| Xử lý giả lập | Link đi `pending` → `processing` → `succeeded`/`failed` để minh họa vòng đời | [mock-processor](src/lib/mock-processor.ts) |

## Khác với bản đầy đủ

Bản này **không** có: đăng nhập Google/Firebase, handshake với web app, đồng bộ server, gọi AI engine, nút "Xem trên Web", thống kê học tập. Trạng thái `processing`/`succeeded`/`failed` ở đây do bộ xử lý giả lập tạo ra, không phải kết quả AI thật. Quy tắc demo: link có `videoId` kết thúc bằng `0` sẽ thất bại với mã `NO_SPEECH`, các link còn lại thành công sau khoảng 5 giây.

## Chạy thử

Yêu cầu: Node `^22.22.2 || ^24.15.0 || >=26.0.0`, pnpm `12.4.2`, Chrome hoặc Edge.

```bash
pnpm install --frozen-lockfile
pnpm prepare
pnpm build
```

Sau đó mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked** và trỏ tới `.output/chrome-mv3`.

Kịch bản demo 2 phút:

1. Mở một YouTube Short, TikTok hoặc Facebook Reel. Bấm nút **Lưu vào BrainTot** góc phải dưới.
2. Mở popup từ thanh công cụ, qua tab **Hàng đợi**. Quan sát link đổi từ *Đang chờ* sang *Đang xử lý* rồi *Sẵn sàng*.
3. Ở tab **Trang chủ**, dán thêm một link, hoặc bấm **Lưu trang này**. Thử link sai để thấy thông báo lỗi.
4. Thử retry với link có `videoId` kết thúc bằng `0`.

Có thể tạo file zip để cài trực tiếp bằng `pnpm zip` (kết quả ở `.output/`).

## Kiểm tra chất lượng

| Lệnh | Mục đích |
|---|---|
| `pnpm compile` | Kiểm tra kiểu với `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (domain, queue, popup, nút lưu, bộ xử lý giả lập) |
| `pnpm dev` | WXT dev server cho Chrome MV3 |

## Cấu trúc

```
src/
  domain/        pending-link, url-canonicalizer (TypeScript thuần, có test)
  lib/           queue-store, mock-processor, messages, queue-display
  entrypoints/
    background.ts        nhận lệnh lưu, badge, kích bộ xử lý giả lập
    capture.content/     nút lưu và toast trên trang video
    popup/               Trang chủ + Hàng đợi
```

Thuật ngữ miền: *pending link* là một link video đã lưu và chờ biến thành bài học.
