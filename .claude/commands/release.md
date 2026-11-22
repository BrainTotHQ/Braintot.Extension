---
description: Kích hoạt quy trình phát hành phiên bản mới cho QuizKard Extension (kiểm tra code, tự viết ghi chú phát hành, tăng version, tag, đóng gói Chrome zip và tạo GitHub Release)
argument-hint: "[patch|minor|major] [ghi chú phát hành, tùy chọn: nếu bỏ trống AI tự viết]"
---

Phát hành phiên bản mới cho **QuizKard Extension** (`BrainTotHQ/Braintot.Extension`) qua GitHub Actions theo đúng quy trình. Tham số từ Tai: $ARGUMENTS

1. **Kiểm tra trước khi Release**
   - Đảm bảo đang ở nhánh `main`, cây làm việc sạch và đã đồng bộ (`git checkout main && git pull origin main && git status --short`).
   - Đảm bảo `gh auth status` active là `taiphanvan2k3`.
   - Chạy kiểm tra chất lượng cục bộ: `pnpm compile && pnpm lint && pnpm test`.

2. **Viết ghi chú phát hành (bắt buộc, không được để trống)**
   - Nếu Tai đã đưa nội dung ghi chú trong tham số thì dùng đúng nội dung đó. Nếu chưa, lấy lịch sử commit kể từ lần release trước:
     ```bash
     git fetch --tags origin
     last_tag=$(git describe --tags --abbrev=0 2>/dev/null || true)
     if [ -n "$last_tag" ]; then
       git log "$last_tag"..HEAD --no-merges --pretty='%s'
     else
       git log --no-merges --pretty='%s'
     fi
     ```
     Bỏ các commit `chore(release)`. Dùng `gh pr view <số>` nếu tiêu đề PR chưa đủ rõ.
   - Viết bằng **tiếng Anh**, hướng tới người dùng cuối (không ghi tên file/hàm/refactor/test/CI), gom nhóm: `## What's New`, `## Fixed`, `## How to Install` (tải file zip, giải nén, Load unpacked trong `chrome://extensions`).
   - Cho Tai xem ghi chú trong chat rồi ghi vào một file tạm.

3. **Chọn mức `bump` (`patch` | `minor` | `major`)**
   - Dùng mức Tai chỉ định; nếu bỏ trống thì chọn theo commit (`major` khi có breaking change, `minor` khi có `feat`, `patch` cho `fix`/`chore`/`docs`...) và nêu rõ lý do.

4. **Kích hoạt & theo dõi workflow**
   ```bash
   gh workflow run release.yml -f bump=<patch|minor|major> -F release_notes=@<đường dẫn file ghi chú>
   ```
   - Lấy run mới nhất (`gh run list --workflow=release.yml --limit 1`) và theo dõi bằng `gh run watch <run-id> --exit-status`.

5. **Đồng bộ & báo cáo bằng tiếng Việt**
   - Kéo commit & tag mới về local (`git pull origin main --tags`).
   - Báo lại phiên bản mới, link GitHub Release (kèm file `quizkard-extension-vX.Y.Z-chrome.zip`) và nội dung ghi chú đã dùng.
