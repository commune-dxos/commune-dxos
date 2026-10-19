# Đối chiếu yêu cầu đề thi ↔ thành phần

Trạng thái: ☐ chưa làm · ◐ đang làm · ☑ xong (ghi đường dẫn mã/tài liệu làm bằng chứng)

## A. Yêu cầu bắt buộc của đề
| # | Yêu cầu | Thành phần | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| A1 | Lõi headless Tầng 1, không có UI | Keycloak, APISIX, PostgREST, PostgreSQL (profile `core`) | ◐ | `docker-compose.yml`, `docs/architecture.md` §7.1 — đã chạy thử 17/10/2026 |
| A2 | Identity / SSO (+MFA) | Keycloak 26, realm `commune`, OTP bắt buộc cho cán bộ/lãnh đạo | ◐ | `infra/keycloak/realm-commune.json`, `docs/architecture.md` §4, §7.1 — đã chạy: cán bộ bị bắt cài OTP, công dân không. Còn: luồng OTP theo vai trò (tuần 2) |
| A3 | API Gateway | APISIX 3.13 standalone, openid-connect (JWKS) + limit-count | ◐ | `infra/apisix/apisix.yaml`, `infra/apisix/config.yaml`, §7.1 — đã chạy: 401/401/200, 429 khi vượt hạn mức. Còn: route `/workflow`, `/files` (tuần 2) |
| A4 | Quản trị dữ liệu có cấu trúc | PostgreSQL 17 + RLS, PostgREST (JWT → role PostgreSQL) | ◐ | `infra/postgres/initdb/10-schema.sql`, `docs/architecture.md` §3, §7.1 — đã chạy qua APISIX với 4 vai trò. Còn: pgAudit, schema đầy đủ (tuần 2) |
| A5 | Quản trị dữ liệu phi cấu trúc | Garage (S3) + ClamAV, Meilisearch CE | ☐ | tuần 2 |
| A6 | Workflow engine | Flowable REST 8.0.0, BPMN viết XML tay | ☐ | cách viết: `docs/architecture.md` §6 |
| A7 | ≥1 ứng dụng Tầng 2 có giao diện (H-P-D-I) | | ☐ | |

## B. 4 nguyên lý kỹ thuật (điểm cộng nguyên gốc)
| # | Nguyên lý | Cách thể hiện | Trạng thái |
|---|---|---|---|
| B1 | Tách dữ liệu nóng / lịch sử (lakehouse) | | ☐ |
| B2 | Hội tụ IT/OT, bản sao số | | ☐ |
| B3 | Phả hệ & chất lượng dữ liệu | | ☐ |
| B4 | Zero-Trust + GitOps | JWT kiểm ở APISIX và PostgREST, RLS trong CSDL; cấu hình gateway/realm dạng tệp trong git | ◐ |

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
| Hướng dẫn viết module cắm–rút + module mẫu | ☐ |
| Demo công khai trên Internet, người dùng thật thử | ☐ |
| Kênh trao đổi (Discussions/Telegram), bài giới thiệu | ☐ |
