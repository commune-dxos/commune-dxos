<!-- SPDX-License-Identifier: Apache-2.0 -->
## Mô tả

<!-- PR này làm gì, vì sao cần. Thay đổi lớn thì ghi cách đã chạy thử (lệnh + kết quả). -->

## Issue liên quan

Closes #

## Loại thay đổi

- [ ] `feat` – tính năng mới
- [ ] `fix` – sửa lỗi
- [ ] `docs` – tài liệu
- [ ] `chore` / `refactor` / `test`

## Kiểm tra trước khi xin duyệt

- [ ] `make check` đạt trên máy (SPDX + compose hợp lệ mọi profile)
- [ ] Mọi tệp mã/cấu hình mới có header `SPDX-License-Identifier: Apache-2.0` (`make license`)
- [ ] `CHANGELOG.md` mục `[Unreleased]` có dòng cho thay đổi này, kèm `(#số-issue)`
- [ ] Tài liệu liên quan đã cập nhật (README, `docs/`, `DEPENDENCIES.md`, `NOTICE` nếu thêm thành phần)
- [ ] Biến môi trường mới đã thêm vào `.env.example`
- [ ] Không có bí mật (mật khẩu, token, khóa riêng, `.env`) và không có dữ liệu cá nhân thật trong diff
