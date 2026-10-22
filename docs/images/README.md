# Hình ảnh trong tài liệu

| Tệp | Nội dung | Dùng ở | Nguồn |
|---|---|---|---|
| `banner.webp` | Ảnh đầu README có tiêu đề "DTU_DZ_2 · OLP PMNM 2026 · COMMUNE DX-OS": bộ phận một cửa của xã, hồ sơ giấy chuyển thành hồ sơ điện tử | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `mot-cua-so.webp` | Công dân nộp hồ sơ khai sinh từ điện thoại, hồ sơ được quét an toàn rồi đi qua các bước xử lý | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `vong-chuc-nang.webp` | Vòng tròn 6 chức năng, nhãn tiếng Việt | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `kien-truc-tong-quan.webp` | Kiến trúc tổng quan dạng biểu tượng, ít chữ (tên thành phần giữ tiếng Anh) | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `luong-ho-so.webp` | Luồng hồ sơ 5 bước và cảnh báo trễ hạn, nhãn tiếng Việt | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `kien-truc.svg` | Sơ đồ kiến trúc 2 tầng chi tiết theo `docker-compose.yml`, `core/`, `apps/mot-cua/` | `docs/architecture.md` | Đội DTU_DZ_2 vẽ tay bằng SVG thuần |
| `luong-ho-so.svg` | Luồng nộp và xử lý hồ sơ đăng ký khai sinh chi tiết theo BPMN | `docs/architecture.md` | Đội DTU_DZ_2 vẽ tay bằng SVG thuần |

- Ảnh minh họa không chứa người, giấy tờ có thật; không lấy ảnh từ nguồn bên ngoài. Chữ trong ảnh do đội kiểm lại sau khi tạo.
- Biểu tượng của Keycloak, APISIX, PostgreSQL, Flowable, RabbitMQ, ClamAV, Garage, OpenBao trong `kien-truc-tong-quan.webp` là **hình minh họa** do công cụ AI vẽ, **không phải logo chính thức**. Tên và nhãn hiệu thuộc dự án tương ứng; dùng ở đây chỉ để chỉ thành phần trong hệ thống, không ngụ ý dự án đó bảo trợ Commune DX-OS.
- Mọi tệp trong thư mục này phát hành cùng giấy phép của dự án: [Apache License 2.0](../../LICENSE).
- Sơ đồ SVG là văn bản, sửa được bằng trình soạn thảo bất kỳ; khi hệ thống đổi (thêm dịch vụ, đổi route) thì cập nhật sơ đồ cùng PR.
