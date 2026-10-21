# Đối chiếu yêu cầu đề thi ↔ thành phần

Trạng thái: ☐ chưa làm · ◐ đang làm · ☑ xong (ghi đường dẫn mã/tài liệu làm bằng chứng)

## A. Yêu cầu bắt buộc của đề
| # | Yêu cầu | Thành phần | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| A1 | Lõi headless Tầng 1, không có UI | Keycloak, APISIX, PostgREST, PostgreSQL (profile `core`); lõi `core/` **độc lập nghiệp vụ**, ứng dụng cắm vào qua `apps/<DXOS_APP>/` (#3) | ◐ | `core/`, `docker-compose.yml`, `docs/architecture.md` §2, §8.2 — chạy từ volume trống 20/10/2026, `make smoke` 45/45 đạt. Garage + ClamAV thêm vào `core` (#7). Còn: RabbitMQ, OpenBao (tuần 2) |
| A2 | Identity / SSO (+MFA) | Keycloak 26, realm `commune`, OTP bắt buộc cho cán bộ/lãnh đạo | ◐ | `core/keycloak/realm-dxos.json`, `apps/mot-cua/keycloak/realm.json`, `docs/architecture.md` §5, §8.2 — đã chạy: cán bộ bị bắt cài OTP, công dân không. Còn: luồng OTP theo vai trò (tuần 2) |
| A3 | API Gateway | APISIX 3.13 standalone, openid-connect (JWKS, `plugin_configs` dùng chung) + limit-count + CORS theo biến môi trường; route `/public` (anon, 60 req/phút), `/api` (JWT → PostgREST), `/workflow` (JWT → API quy trình của ứng dụng → Flowable, chặn API quản trị Flowable) (#6), `/files` (JWT, body ≤ 10 MiB → API tệp của ứng dụng) và `/files/s3` (link GET ký sẵn tới Garage) (#7) | ◐ | `core/apisix/apisix.yaml`, `core/apisix/config.yaml`, `apps/mot-cua/backend/main.py`, `docs/architecture.md` §4, §4.1, §8.5 — 21/10/2026: `make smoke` 199/199 trên volume trống, chạy lại và volume cũ: 401 mọi route cần token, 403 API quản trị Flowable, 429 khi vượt hạn mức `/public`, luồng khai sinh qua `/workflow` bằng token 3 vai trò. 21/10/2026 (#7): `/files` 401/413, `/files/s3` chỉ link ký hợp lệ, `make smoke` 277/277. Còn: `/search` (tuần 5) |
| A4 | Quản trị dữ liệu có cấu trúc | PostgreSQL 17 + RLS, PostgREST (JWT → role PostgreSQL); lõi giữ role `authenticator`/`anon`, hàm claim `dxos.jwt_sub()`, sổ migration; schema nghiệp vụ là migration của ứng dụng (#3); schema `mot_cua` đầy đủ: lĩnh vực, thủ tục + thành phần yêu cầu, cán bộ + lĩnh vực phụ trách, hồ sơ (hạn theo ngày làm việc, trạng thái có kiểm), thành phần hồ sơ; RLS mọi bảng theo vai trò và lĩnh vực (#5) | ◐ | `core/postgres/initdb/10-core.sql`, `core/scripts/app-migrate.sh`, `apps/mot-cua/db/` (migration 002, seed 002, `tests/rls.sql`), `apps/mot-cua/README.md` (ER, bảng quyền), `docs/architecture.md` §2.7, §8.3 — 20/10/2026: `make smoke` 126/126 trên volume trống, chạy lại và nâng cấp từ v0.0.1; API thật với token 4 vai trò (cán bộ, lãnh đạo có TOTP). Còn: pgAudit, quyền quản trị danh mục qua API |
| A5 | Quản trị dữ liệu phi cấu trúc | Garage v2.4.1 (S3 một nút, AGPL, dịch vụ riêng) – lõi tạo bucket ứng dụng khai báo và khóa S3 riêng cho từng ứng dụng; ClamAV 1.5.4 (GPL, dịch vụ riêng) quét mọi tệp trước khi lưu; API tệp của `mot-cua`: kiểm loại + magic bytes, metadata (object key, sha256, người tải, kết quả quét) trong `thanh_phan_ho_so`, xem bằng link ký SigV4 ngắn hạn theo RLS, nhật ký tệp chỉ thêm (#7). Meilisearch CE (tuần 5) | ◐ | `core/garage/`, `core/scripts/garage-init.py`, `apps/mot-cua/backend/{main,tep}.py`, `apps/mot-cua/db/migrations/003_tep_ho_so.sql`, `docs/architecture.md` §4.3, §8.6 — 21/10/2026: `make smoke` 277/277 trên volume trống, chạy lại, volume cũ: PDF hợp lệ → Garage + metadata; EICAR → 422, không có object, có nhật ký; giả mạo đuôi → 415; 11 MiB → 413; cán bộ sai lĩnh vực → 403; link hết hạn không tải được. Còn: tìm kiếm toàn văn (tuần 5) |
| A6 | Workflow engine | Flowable REST 8.0.0 (CSDL riêng `flowable`), BPMN viết XML tay, tự triển khai từ `apps/<DXOS_APP>/processes/`; quy trình đăng ký khai sinh tiếp nhận → thẩm định → phê duyệt, nhánh bổ sung/từ chối, hẹn giờ quá hạn (#8) | ◐ | `docker-compose.yml`, `apps/mot-cua/processes/`, `scripts/check-bpmn.py` (CI), `docs/architecture.md` §7, §8.4 — 20/10/2026: `make smoke` 147/147. Route `/workflow` qua APISIX đã có (#6). Còn: đồng bộ trạng thái hồ sơ + sự kiện RabbitMQ (#9) |
| A7 | ≥1 ứng dụng Tầng 2 có giao diện (H-P-D-I) | | ☐ | |

## B. 4 nguyên lý kỹ thuật (điểm cộng nguyên gốc)
| # | Nguyên lý | Cách thể hiện | Trạng thái |
|---|---|---|---|
| B1 | Tách dữ liệu nóng / lịch sử (lakehouse) | | ☐ |
| B2 | Hội tụ IT/OT, bản sao số | | ☐ |
| B3 | Phả hệ & chất lượng dữ liệu | | ☐ |
| B4 | Zero-Trust + GitOps | JWT kiểm ở APISIX và lại ở PostgREST/backend ứng dụng, RLS trong CSDL; Flowable chỉ nhận lời gọi từ backend (người dùng không cầm mật khẩu), API quản trị bị chặn ở gateway; **kiểm dịch ở biên** (#7): mọi tệp tải lên bị giới hạn cỡ ở gateway, kiểm loại + magic bytes và quét ClamAV trước khi chạm kho lưu trữ (fail-closed khi ClamAV không trả lời), chỉ backend cầm khóa S3 (riêng từng ứng dụng, chỉ quyền trên bucket của mình), client chỉ nhận link ký ngắn hạn, metadata ghi bằng tài khoản dịch vụ riêng nên người dùng không khai giả được kết quả quét; bí mật sinh lúc khởi tạo, không nằm trong git (chờ OpenBao #10); cấu hình gateway/realm/Garage dạng tệp trong git | ◐ |

## C. Không gian H-P-D-I trong ứng dụng
| Không gian | Tính năng | Trạng thái |
|---|---|---|
| [H] | | ☐ |
| [P] (có Poka-yoke) | | ☐ |
| [D] | | ☐ |
| [I] (có Human-in-the-loop) | | ☐ |

## D. PoF – 50 điểm (rà trước khi nộp)
| # | Tiêu chí | Kiểm tra | Trạng thái |
|---|---|---|---|
| 1 | Kho mã công khai, có web viewer, dùng thật | | ☐ |
| 2 | LICENSE toàn văn + SPDX mọi file + tương thích giấy phép | `make check` quét cả Dockerfile/yml/sql/conf/xml; CI `.github/workflows/check.yml`; NOTICE đã xác minh (D-004) | ◐ |
| 3 | Release đánh phiên bản, `.tar.gz`, trước hạn | | ☐ |
| 4 | Build từ mã nguồn, cấu hình qua .env, chạy ngoài thư mục mã | | ☐ |
| 5 | Không vendor/sửa thư viện, khai báo phụ thuộc | `DEPENDENCIES.md` (image đã ghim; npm/pip khi có mã) | ◐ |
| 6 | README, CHANGELOG, bug tracker | | ☐ |

## E. Cộng đồng & bền vững (tiêu chí 10, 11)
| Việc | Trạng thái |
|---|---|
| README song ngữ, CONTRIBUTING, CODE_OF_CONDUCT | ◐ |
| Hướng dẫn viết module cắm–rút + module mẫu | ◐ (quy ước `apps/<tên>/` + ví dụ: `docs/architecture.md` §2.4–2.5; module mẫu thứ hai: tuần 6) |
| Demo công khai trên Internet, người dùng thật thử | ☐ |
| Kênh trao đổi (Discussions/Telegram), bài giới thiệu | ☐ |
