# Hình ảnh trong tài liệu

| Tệp | Nội dung | Dùng ở | Nguồn |
|---|---|---|---|
| `banner.webp` | Ảnh đầu README có tiêu đề "DTU_DZ_2 · OLP PMNM 2026 · COMMUNE DX-OS": bộ phận một cửa của xã, hồ sơ giấy chuyển thành hồ sơ điện tử | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `mot-cua-so.webp` | Công dân nộp hồ sơ khai sinh từ điện thoại, hồ sơ được quét an toàn rồi đi qua các bước xử lý | Không còn dùng ở README (từ #38); giữ tệp | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `vong-chuc-nang.webp` | Vòng tròn 6 chức năng, nhãn tiếng Việt | Không còn dùng ở README (từ #38, thay bằng bảng "Trước và sau chuyển đổi số"); giữ tệp | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `kien-truc-tong-quan.webp` | Kiến trúc tổng quan dạng biểu tượng, ít chữ (tên thành phần giữ tiếng Anh) | Không còn dùng ở README (từ #43, thay bằng `kien-truc-dong.svg`: ảnh này không thể hiện 2 tầng và gói thủ tục); giữ tệp | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `luong-ho-so.webp` | Luồng hồ sơ 5 bước và cảnh báo trễ hạn, nhãn tiếng Việt | `README.md` | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh |
| `kien-truc.svg` | Sơ đồ kiến trúc 2 tầng chi tiết theo `docker-compose.yml`, `nen-tang/`, `mot-cua/`, `thu-tuc/` | `docs/architecture.md` | Đội DTU_DZ_2 vẽ tay bằng SVG thuần |
| `luong-ho-so.svg` | Luồng nộp và xử lý hồ sơ đăng ký khai sinh chi tiết theo BPMN | `docs/architecture.md` | Đội DTU_DZ_2 vẽ tay bằng SVG thuần |
| `kien-truc-dong.svg` | Sơ đồ kiến trúc động: 2 tầng, gói thủ tục cắm vào `thu-tuc/`, 4 dịch vụ bắt buộc đánh số; một hồ sơ KS01 chạy qua 6 bước (vòng 14 giây, SMIL, không JS). Khung tĩnh vẫn đọc được; tắt chuyển động khi người xem bật giảm chuyển động | `README.md` | Đội DTU_DZ_2 vẽ tay bằng SVG thuần |
| `kien-truc-2-tang.webp` | Ảnh tĩnh kiến trúc 2 tầng, bản v2 (#45): APISIX nằm trong Tầng 1, có hộp PostgREST, 4 dịch vụ bắt buộc đánh số ①–④, gói thủ tục cắm vào bộ máy, luồng hồ sơ KS01 màu cam, nhãn tiếng Việt | `README.md` (link dưới sơ đồ động), `docs/architecture.md`, slide | Đội DTU_DZ_2 tạo bằng công cụ AI tạo ảnh (ChatGPT) theo bản SVG `kien-truc-dong.svg` của đội; biểu tượng là hình minh họa, không phải logo chính thức |
| `kien-truc-dong.gif` | Bản GIF của `kien-truc-dong.svg` (1200 px, 12 khung/giây) cho nơi không chạy được SVG động | Slide, chỗ cần ảnh GIF | Xuất từ SVG bằng `make xuat-kien-truc` (Playwright + Chromium chụp khung, FFmpeg ghép) |
| `../media/kien-truc-dong.mp4` | Bản MP4 H.264 1920×1080, 30 khung/giây, đủ một vòng lặp, để chèn slide trình bày chung kết | Slide | Như trên |
| `logo/logo-ngang.png` | Logo ngang (1544×482, nền trong suốt): biểu tượng, chữ COMMUNE DX-OS, khẩu hiệu "Chính quyền số Cấp xã" | `README.md` (chế độ sáng), slide | Đội DTU_DZ_2 tạo bằng công cụ AI (ChatGPT) theo prompt của đội; đội đã duyệt (#61) |
| `logo/logo-ngang-nen-trang.png` | Logo ngang trên nền trắng (1524×462) cho nơi không hỗ trợ nền trong suốt hoặc nền tối | `README.md` (chế độ tối), trang chủ tài liệu, Word | Như trên |
| `logo/mark.png` | Biểu tượng gốc 1024×1024, nền trong suốt: mái nhà công sở, hồ sơ có dấu tích, 2 gói thủ tục cắm vào thanh đế | Nguồn để xuất các cỡ nhỏ | Như trên; cắt từ logo ngang bằng ImageMagick |
| `logo/mark-512.png`, `logo/mark-180.png` | Biểu tượng 512 px, 180 px | Ảnh đại diện org GitHub, apple-touch-icon | Như trên |
| `logo/mark-64.png`, `logo/mark-32.png`, `logo/favicon.ico` | Biểu tượng 64 px, 32 px và favicon | Thanh đầu trang tài liệu MkDocs (`theme.logo`, `theme.favicon`), web | Như trên |
| `logo/xem-truoc.png` | Ảnh xem trước 1280×640 khi chia sẻ link repo | Settings → Social preview của repo (tải lên bằng tay) | Như trên; ghép bằng ImageMagick |
| `cong-cong-dan-may-tinh.webp`, `cong-cong-dan-dien-thoai.webp` | Ảnh chụp trang chủ cổng công dân (#52, giao diện mới #63) trên máy tính (1280 px) và điện thoại (390 px), dữ liệu giả | `mot-cua/web-cong-dan/README.md` | Chụp bằng Chrome headless từ bản build của đội |

- **Logo** (`logo/`): màu xanh ngọc `#0F766E` (màu chính), chàm `#4338CA` (màu phụ), đỏ son `#D9480F` (chỉ điểm nhấn). Không đổi màu, kéo méo, thêm bóng hay gradient. Biểu tượng có vùng trong suốt: trên nền tối đặt trong ô nền trắng. Cỡ nhỏ nhất: biểu tượng 32 px, logo ngang rộng 240 px.
- Ảnh minh họa không chứa người, giấy tờ có thật; không lấy ảnh từ nguồn bên ngoài. Chữ trong ảnh do đội kiểm lại sau khi tạo.
- `kien-truc-dong.svg` không dùng logo của dự án nào: mỗi thành phần là một hộp chữ. Sửa SVG rồi chạy lại `make xuat-kien-truc` để GIF, MP4 khớp (cài công cụ: xem đầu `scripts/xuat_kien_truc.py`; Playwright và FFmpeg chỉ là công cụ trên máy, không phải phụ thuộc của dự án).
- Biểu tượng của Keycloak, APISIX, PostgreSQL, Flowable, RabbitMQ, ClamAV, Garage, OpenBao trong `kien-truc-tong-quan.webp` là **hình minh họa** do công cụ AI vẽ, **không phải logo chính thức**. Tên và nhãn hiệu thuộc dự án tương ứng; dùng ở đây chỉ để chỉ thành phần trong hệ thống, không ngụ ý dự án đó bảo trợ Commune DX-OS.
- Mọi tệp trong thư mục này (và `docs/media/`) phát hành cùng giấy phép của dự án: [GPL-3.0-or-later](../../LICENSE) (khai trong `REUSE.toml`). Các tệp có trong v0.0.1–v0.2.0 cũng đã phát hành theo Apache-2.0 ở các bản đó.
- Sơ đồ SVG là văn bản, sửa được bằng trình soạn thảo bất kỳ; khi hệ thống đổi (thêm dịch vụ, đổi route) thì cập nhật sơ đồ cùng PR.

## Quay GIF demo (tuần 3–4)

README dành chỗ cho GIF demo khi có giao diện. Không đặt ảnh hay GIF giả trước đó.

- **Tệp:** `demo-cong-dan.gif` (nộp hồ sơ, xem tiến độ), `demo-can-bo.gif` (tiếp nhận, thẩm định, phê duyệt), lưu ở thư mục này và thêm một dòng vào bảng trên.
- **Công cụ mã nguồn mở:** quay màn hình bằng OBS Studio (hoặc Kooha trên Linux), chuyển sang GIF bằng FFmpeg. Công cụ chỉ dùng trên máy người quay, không thành phụ thuộc của dự án.
- **Kích thước:** dưới 5 MB mỗi tệp; rộng 960 px, 10–12 khung hình/giây, dài 15–25 giây. Cắt bớt thao tác chờ.
- **Lệnh mẫu** (bảng màu riêng giúp GIF nhỏ và rõ chữ):

  ```bash
  ffmpeg -i quay.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" -loop 0 demo-cong-dan.gif
  ```

- **Nội dung:** chỉ dùng tài khoản và dữ liệu mẫu giả (`congdan01`, `canbo01`, `lanhdao01`); không lộ mật khẩu, mã OTP, token trên màn hình. Giao diện và nhãn tiếng Việt.
