<!-- SPDX-License-Identifier: Apache-2.0 -->
## Mô tả

<!-- PR này làm gì, vì sao cần. Thay đổi lớn thì ghi cách đã chạy thử (lệnh + kết quả). -->

## Issue liên quan

Closes #

## Loại thay đổi

- [ ] `feat` – tính năng mới
- [ ] `fix` – sửa lỗi
- [ ] `docs` – tài liệu
- [ ] `refactor` – tái cấu trúc
- [ ] `ci` / `chore` / `test`

## Kiểm tra trước khi xin duyệt

- [ ] `make check` đạt trên máy (SPDX + compose hợp lệ mọi profile)
- [ ] `make lint` và `make test` đạt trên máy (cùng lệnh với các job CI, xem `CONTRIBUTING.md` mục 6)
- [ ] Mọi tệp mã/cấu hình mới có header `SPDX-License-Identifier: Apache-2.0` (`make license`)
- [ ] Tiêu đề PR dạng `loai(pham-vi): mô tả (#số-issue)` (CHANGELOG sinh từ đó bằng git-cliff, không sửa tay)
- [ ] Tài liệu liên quan đã cập nhật (README, `docs/`, `DEPENDENCIES.md`, `NOTICE` nếu thêm thành phần)
- [ ] Biến môi trường mới đã thêm vào `.env.example`
- [ ] Không có bí mật (mật khẩu, token, khóa riêng, `.env`) và không có dữ liệu cá nhân thật trong diff
