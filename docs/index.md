# Tài liệu Commune DX-OS

**Commune DX-OS** là hệ điều hành chính quyền số cấp xã, nguồn mở (Apache-2.0): lõi headless Tầng 1 (đăng nhập một lần, cổng API, dữ liệu, quy trình) và bộ máy một cửa Tầng 2 chạy mọi thủ tục hành chính. Mỗi thủ tục là một **gói** `thu-tuc/<ma>/`; thêm thủ tục là thêm một thư mục, không sửa mã.

![Luồng hồ sơ 5 bước: nộp hồ sơ, quét virus, thẩm định, phê duyệt, hoàn tất; cảnh báo trễ hạn gắn vào bước thẩm định](images/luong-ho-so.webp)

## Bạn cần gì?

| Bạn là | Đọc |
|---|---|
| Người dân, cán bộ một cửa | [Danh mục thủ tục](danh-muc-thu-tuc.md): thời hạn, lệ phí, thành phần hồ sơ, các bước xử lý của từng thủ tục |
| Lập trình viên thêm thủ tục | [Thêm một thủ tục mới trong 5 bước](thu-tuc.md), [bộ máy một cửa](mot-cua.md) |
| Người vận hành | [Cài đặt và chạy từ máy sạch](cai-dat.md) |
| Người tìm hiểu kiến trúc | [Kiến trúc tổng thể](architecture.md), [đối chiếu yêu cầu đề thi](de-thi-mapping.md) |
| Người muốn đóng góp | [Hướng dẫn đóng góp](dong-gop.md), [kế hoạch](PLAN.md), [nhật ký thay đổi](thay-doi.md) |

Trang này dựng tự động từ thư mục `docs/` và các gói `thu-tuc/` của [repo](https://github.com/commune-dxos/commune-dxos) mỗi khi nhánh `main` thay đổi. Thấy sai, bấm biểu tượng sửa ở đầu mỗi trang để mở PR.
