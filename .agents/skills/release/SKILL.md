---
name: release
description: Write the release notes, then trigger and monitor the automated release workflow (verify, bump version in package.json, tag, package Chrome MV3 zip, create GitHub Release). Triggered by /release or when the user asks to release or publish a new extension version.
---

# Release New Extension Version

Kích hoạt và theo dõi quy trình phát hành phiên bản mới của **QuizKard Extension** (`BrainTotHQ/Braintot.Extension`) trên GitHub Actions.

> **QUY TẮC SANDBOX BẮT BUỘC (`BypassSandbox: true`)**:
> Mọi lệnh `git` và `gh` trong skill này **BẮT BUỘC chạy trực tiếp với `BypassSandbox: true` ngay từ lần đầu tiên**, vì:
> - `gh` cần kết nối mạng tới `api.github.com`.
> - `git` và `gh` cần đọc `/Users/taiphan/.gitconfig-personal` ngoài workspace.

## Các bước thực hiện:

1. **Kiểm tra trước khi Release**
   - Đảm bảo đang ở nhánh `main`, cây làm việc sạch sẽ và đã đồng bộ với `origin/main`:
     ```bash
     git checkout main
     git pull origin main
     git status --short
     ```
   - Kiểm tra tài khoản GitHub đang active là `taiphanvan2k3` (`gh auth status`) và remote là SSH `git@github.com:BrainTotHQ/Braintot.Extension.git`.
   - Chạy kiểm tra chất lượng mã nguồn cục bộ:
     ```bash
     pnpm compile
     pnpm lint
     pnpm test
     ```
   - Bắt buộc pass 100% trước khi tiếp tục.

2. **Viết ghi chú phát hành (bắt buộc, không được để trống)**
   - Ghi chú hiển thị trên **GitHub Release**, hướng tới người dùng cài extension.
   - Nếu Tai đã đưa nội dung ghi chú thì dùng đúng nội dung đó. Nếu chưa, tự viết dựa trên các thay đổi kể từ lần phát hành trước:
     ```bash
     git fetch --tags origin
     last_tag=$(git describe --tags --abbrev=0 2>/dev/null || true)
     if [ -n "$last_tag" ]; then
       git log "$last_tag"..HEAD --no-merges --pretty='%s'
     else
       git log --no-merges --pretty='%s'
     fi
     ```
     Bỏ các commit `chore(release)`. Số trong `(#số)` là số PR; khi tiêu đề chưa đủ rõ thì đọc mô tả bằng `gh pr view <số>`.
   - Cách viết:
     - **Viết bằng tiếng Anh** (ghi chú phát hành luôn bằng tiếng Anh, dù Tai chat tiếng Việt).
     - Dùng Markdown gọn gàng với các nhóm (bỏ nhóm nào trống): `## What's New`, `## Fixed`, `## How to Install`.
     - Chỉ nêu thay đổi người dùng nhìn thấy hoặc cảm nhận được; bỏ test, refactor, tài liệu, CI. Không ghi tên file, tên hàm hay thuật ngữ nội bộ.
     - Mục `## How to Install` ngắn gọn 3 bước: tải `quizkard-extension-vX.Y.Z-chrome.zip`, giải nén, mở `chrome://extensions` bật **Developer mode** → **Load unpacked**.
     - Không chép bí mật (khóa, mật khẩu, email) vào ghi chú.
     - Nếu kể từ lần trước chỉ có thay đổi nội bộ, ghi `- Internal improvements and stability updates.` thay vì để trống.
   - Cho Tai xem nội dung ghi chú trong chat (không cần chờ Tai trả lời), rồi ghi nội dung đó vào một file tạm trong thư mục scratch của phiên.

3. **Chọn mức tăng phiên bản (`bump`) & kích hoạt GitHub Actions Release**
   - Nếu Tai nói rõ `patch`, `minor` hoặc `major` thì dùng đúng như Tai nói. Nếu không, tự chọn theo các commit kể từ lần phát hành trước rồi nêu rõ lý do cho Tai:
     - `major`: có thay đổi phá vỡ tương thích (`feat!:` / `BREAKING CHANGE`), đổi hẳn cấu trúc hoặc cần cập nhật backend mới chạy được.
     - `minor`: có ít nhất một tính năng mới người dùng thấy được (`feat`), không phá vỡ tương thích.
     - `patch`: chỉ sửa lỗi, chỉnh nhỏ hoặc thay đổi nội bộ (`fix`, `chore`, `docs`, `refactor`, `test`, `ci`).
     - Có nhiều loại thì lấy loại lớn nhất; còn phân vân giữa hai mức thì hỏi Tai trước khi chạy.
   - Kích hoạt workflow (đọc ghi chú từ file bằng `-F ...=@file` để tránh lỗi dấu nháy và xuống dòng):
     ```bash
     gh workflow run release.yml -f bump=<patch|minor|major> -F release_notes=@<đường dẫn file ghi chú>
     ```

4. **Theo dõi tiến trình**
   - Lấy run mới nhất và chờ chạy xong:
     ```bash
     sleep 3
     run_id=$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
     gh run watch "$run_id" --exit-status
     ```

5. **Đồng bộ local & báo cáo kết quả bằng tiếng Việt**
   - Kéo commit bump và tag mới về local:
     ```bash
     git pull origin main --tags
     ```
   - Báo cáo ngắn gọn cho Tai bằng tiếng Việt gồm:
     - Phiên bản mới (ví dụ `v0.3.0`).
     - Link GitHub Release (kèm file `quizkard-extension-vX.Y.Z-chrome.zip`).
     - Nội dung ghi chú đã dùng (và nhắc có thể sửa lại bất cứ lúc nào bằng `gh release edit <tag> --notes-file <file>`).
