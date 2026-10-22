# Đối chiếu yêu cầu đề thi ↔ thành phần

Trạng thái: ☐ chưa làm · ◐ đang làm · ☑ xong (ghi đường dẫn mã/tài liệu làm bằng chứng)

## A. Yêu cầu bắt buộc của đề
| # | Yêu cầu | Thành phần | Trạng thái | Bằng chứng |
|---|---|---|---|---|
| A1 | Lõi headless Tầng 1, không có UI | Keycloak, APISIX, PostgREST, PostgreSQL, OpenBao (két sắt bí mật, không UI) (profile `core`); nền tảng `nen-tang/` **độc lập nghiệp vụ** (#3); D-009 (#30): bộ máy một cửa `mot-cua/` + gói thủ tục `thu-tuc/<ma>/` cắm–rút bằng thư mục, bộ nạp `nap-thu-tuc` | ◐ | `nen-tang/`, `mot-cua/`, `thu-tuc/`, `docker-compose.yml`, `docs/architecture.md` §2, `docs/thu-tuc.md`, §8.2 — chạy từ volume trống 20/10/2026, `make smoke` 45/45 đạt. Garage + ClamAV thêm vào `core` (#7). **OpenBao 2.7.1** giữ mọi bí mật dịch vụ, `.env` không còn mật khẩu, `make up` tự init/unseal (dev) (#10, `nen-tang/openbao/`, §4.4, §8.7 — smoke 328/328 trên volume trống, sau khởi động lại và trên volume cũ chuyển từ `.env`). **RabbitMQ 4.3.6** hàng đợi sự kiện, vhost + user riêng mỗi ứng dụng, management chỉ trong mạng nội bộ (#9, §4.5, §8.8 — smoke 405/405) |
| A2 | Identity / SSO (+MFA) | Keycloak 26, realm `dxos`, OTP bắt buộc cho cán bộ/lãnh đạo; danh tính **máy** (dịch vụ ↔ dịch vụ): mỗi dịch vụ một AppRole OpenBao, policy chỉ đọc đúng bí mật của mình (#10) | ◐ | `nen-tang/keycloak/realm-dxos.json`, `mot-cua/keycloak/realm.json`, `docs/architecture.md` §5, §8.2 — đã chạy: cán bộ bị bắt cài OTP, công dân không. Mật khẩu quản trị Keycloak và client secret dịch vụ nằm trong OpenBao (`nen-tang/openbao/policies/`, §4.4.3; smoke kiểm 27 cặp danh tính × đường dẫn). Còn: luồng OTP theo vai trò (tuần 2) |
| A3 | API Gateway | APISIX 3.13 standalone, openid-connect (JWKS, `plugin_configs` dùng chung) + limit-count + CORS theo biến môi trường; route `/public` (anon, 60 req/phút), `/api` (JWT → PostgREST), `/workflow` (JWT → API quy trình của ứng dụng → Flowable, chặn API quản trị Flowable) (#6), `/files` (JWT, body ≤ 10 MiB → API tệp của ứng dụng) và `/files/s3` (link GET ký sẵn tới Garage) (#7) | ◐ | `nen-tang/apisix/apisix.yaml`, `nen-tang/apisix/config.yaml`, `mot-cua/backend/main.py`, `docs/architecture.md` §4, §4.1, §8.5 — 21/10/2026: `make smoke` 199/199 trên volume trống, chạy lại và volume cũ: 401 mọi route cần token, 403 API quản trị Flowable, 429 khi vượt hạn mức `/public`, luồng khai sinh qua `/workflow` bằng token 3 vai trò. 21/10/2026 (#7): `/files` 401/413, `/files/s3` chỉ link ký hợp lệ, `make smoke` 277/277. Còn: `/search` (tuần 5) |
| A4 | Quản trị dữ liệu có cấu trúc | PostgreSQL 17 + RLS, PostgREST (JWT → role PostgreSQL); lõi giữ role `authenticator`/`anon`, hàm claim `dxos.jwt_sub()`, sổ migration; schema nghiệp vụ là migration của ứng dụng (#3); schema `mot_cua` đầy đủ: lĩnh vực, thủ tục + thành phần yêu cầu, cán bộ + lĩnh vực phụ trách, hồ sơ (hạn theo ngày làm việc, trạng thái có kiểm), thành phần hồ sơ; RLS mọi bảng theo vai trò và lĩnh vực (#5) | ◐ | `nen-tang/postgres/initdb/10-core.sql`, `nen-tang/scripts/tang2-migrate.sh`, `mot-cua/db/` (migration 002, seed 002, `tests/rls.sql`), `mot-cua/README.md` (ER, bảng quyền), `docs/architecture.md` §2.7, §8.3 — 20/10/2026: `make smoke` 126/126 trên volume trống, chạy lại và nâng cấp từ v0.0.1; API thật với token 4 vai trò (cán bộ, lãnh đạo có TOTP). Còn: pgAudit, quyền quản trị danh mục qua API |
| A5 | Quản trị dữ liệu phi cấu trúc | Garage v2.4.1 (S3 một nút, AGPL, dịch vụ riêng) – lõi tạo bucket ứng dụng khai báo và khóa S3 riêng cho từng ứng dụng; ClamAV 1.5.4 (GPL, dịch vụ riêng) quét mọi tệp trước khi lưu; API tệp của `mot-cua`: kiểm loại + magic bytes, metadata (object key, sha256, người tải, kết quả quét) trong `thanh_phan_ho_so`, xem bằng link ký SigV4 ngắn hạn theo RLS, nhật ký tệp chỉ thêm (#7). Meilisearch CE (tuần 5) | ◐ | `nen-tang/garage/`, `nen-tang/scripts/garage-init.py`, `mot-cua/backend/{main,tep}.py`, `mot-cua/db/migrations/003_tep_ho_so.sql`, `docs/architecture.md` §4.3, §8.6 — 21/10/2026: `make smoke` 277/277 trên volume trống, chạy lại, volume cũ: PDF hợp lệ → Garage + metadata; EICAR → 422, không có object, có nhật ký; giả mạo đuôi → 415; 11 MiB → 413; cán bộ sai lĩnh vực → 403; link hết hạn không tải được. Còn: tìm kiếm toàn văn (tuần 5) |
| A6 | Workflow engine | Flowable REST 8.0.0 (CSDL riêng `flowable`), BPMN viết XML tay trong gói thủ tục, bộ nạp `nap-thu-tuc` kiểm và deploy qua REST (#30); quy trình đăng ký khai sinh tiếp nhận → thẩm định → phê duyệt, nhánh bổ sung/từ chối, hẹn giờ quá hạn (#8); chứng thực bản sao tiếp nhận → kiểm tra bản chính → ký → trả kết quả, hạn trong ngày (#30) | ◐ | `docker-compose.yml`, `thu-tuc/*/quy-trinh.bpmn20.xml`, `mot-cua/backend/{nap_thu_tuc,kiem_bpmn}.py`, `scripts/check-bpmn.py` (CI), `docs/architecture.md` §7, §8.4 — 20/10/2026: `make smoke` 147/147. Route `/workflow` qua APISIX đã có (#6). Sự kiện quy trình (`ho_so.moi`, `chuyen_buoc`, `hoan_tat`, `tu_choi`, `sap_tre_han`) lên RabbitMQ qua outbox, consumer mẫu (#9, `mot-cua/backend/worker.py`, §4.5, §8.8 — smoke 405/405). Còn: đồng bộ `ho_so.trang_thai` theo bước |
| A7 | ≥1 ứng dụng Tầng 2 có giao diện (H-P-D-I) | | ☐ | |

## B. 4 nguyên lý kỹ thuật (điểm cộng nguyên gốc)
| # | Nguyên lý | Cách thể hiện | Trạng thái |
|---|---|---|---|
| B1 | Tách dữ liệu nóng / lịch sử (lakehouse) | | ☐ |
| B2 | Hội tụ IT/OT, bản sao số | | ☐ |
| B3 | Phả hệ & chất lượng dữ liệu | | ☐ |
| B4 | Zero-Trust + GitOps | JWT kiểm ở APISIX và lại ở PostgREST/backend ứng dụng, RLS trong CSDL; Flowable chỉ nhận lời gọi từ backend (người dùng không cầm mật khẩu), API quản trị bị chặn ở gateway; **kiểm dịch ở biên** (#7): mọi tệp tải lên bị giới hạn cỡ ở gateway, kiểm loại + magic bytes và quét ClamAV trước khi chạm kho lưu trữ (fail-closed khi ClamAV không trả lời), chỉ backend cầm khóa S3 (riêng từng ứng dụng, chỉ quyền trên bucket của mình), client chỉ nhận link ký ngắn hạn, metadata ghi bằng tài khoản dịch vụ riêng nên người dùng không khai giả được kết quả quét; **két sắt bí mật OpenBao** (#10): không bí mật nào trong git hay `.env`, mỗi dịch vụ một AppRole + policy đặc quyền tối thiểu (dịch vụ A không đọc được bí mật của B, ứng dụng không đọc được nhánh của ứng dụng khác), bí mật của backend chỉ nằm trong bộ nhớ, nhật ký kiểm toán mọi lượt đọc, fail-closed khi két bị seal; **hàng đợi** (#9): RabbitMQ không mở ra ngoài, mỗi ứng dụng một vhost + user không tag quản trị, không quyền configure, sự kiện không chứa dữ liệu cá nhân (role dịch vụ bị chặn đọc cột cá nhân); cấu hình gateway/realm/Garage dạng tệp trong git | ◐ |

## C. Không gian H-P-D-I trong ứng dụng
| Không gian | Tính năng | Trạng thái |
|---|---|---|
| [H] | | ☐ |
| [P] (có Poka-yoke) | **Cảnh báo trễ hạn** (#9): `app-worker` quét hồ sơ chưa xong còn ≤ 1 ngày làm việc tới hạn (bỏ cuối tuần, ngày nghỉ lễ) → sự kiện `ho_so.sap_tre_han` trên RabbitMQ, mỗi hồ sơ và hạn đúng một lần (ràng buộc UNIQUE); quá hạn: hẹn giờ BPMN (#8). Sự kiện chuyển bước làm nền cho thông báo (tuần 3). Bằng chứng: `mot-cua/backend/{su_kien,worker}.py`, `mot-cua/README.md` (danh mục sự kiện), `docs/architecture.md` §4.5. Còn: thông báo, Poka-yoke JSON Schema (tuần 3) | ◐ |
| [D] | | ☐ |
| [I] (có Human-in-the-loop) | | ☐ |

## D. PoF – 50 điểm (rà trước khi nộp)
| # | Tiêu chí | Kiểm tra | Trạng thái |
|---|---|---|---|
| 1 | Kho mã công khai, có web viewer, dùng thật | | ☐ |
| 2 | LICENSE toàn văn + SPDX mọi file + tương thích giấy phép | `make check` quét cả Dockerfile/yml/sql/conf/xml; CI `.github/workflows/check.yml`; NOTICE đã xác minh (D-004) | ◐ |
| 3 | Release đánh phiên bản, `.tar.gz`, trước hạn | | ☐ |
| 4 | Build từ mã nguồn, cấu hình qua .env, chạy ngoài thư mục mã | README mục 2–3, 5 (hướng dẫn từ máy sạch, yêu cầu máy, bảng biến `.env` đọc lúc `make up`, không sửa header tay: `make license`, chỉ image gốc + công cụ nguồn mở); `docs/architecture.md` §8.9: bản clone mới trong thư mục tạm, gọi `make -C` từ thư mục khác, `make up` 128 giây, smoke 405/405 (#12) | ◐ (còn kiểm trên máy amd64/Linux) |
| 5 | Không vendor/sửa thư viện, khai báo phụ thuộc | `DEPENDENCIES.md` (image đã ghim; npm/pip khi có mã) | ◐ |
| 6 | README, CHANGELOG, bug tracker | README tiếng Việt kể chuyện sản phẩm (#28), hướng dẫn cài đặt đầy đủ ở `docs/cai-dat.md`: cài đặt, cấu hình, thêm ứng dụng, xử lý lỗi, giấy phép; `CHANGELOG.md` theo Keep a Changelog; GitHub Issues có mẫu issue, README mục Báo lỗi | ◐ (README đủ; còn phiên bản v0.1.0) |

## E. Cộng đồng & bền vững (tiêu chí 10, 11)
| Việc | Trạng thái |
|---|---|
| README song ngữ, CONTRIBUTING, CODE_OF_CONDUCT | ✔ (README viết lại #12, kể chuyện sản phẩm #28) |
| Hướng dẫn viết module cắm–rút + module mẫu | ◐ (D-009, #30: gói thủ tục `thu-tuc/<ma>/`, hướng dẫn 5 bước `docs/thu-tuc.md`, 2 gói khai sinh + chứng thực bản sao; smoke cắm–rút gói tạm. Còn: thêm gói) |
| Demo công khai trên Internet, người dùng thật thử | ☐ |
| Kênh trao đổi (Discussions/Telegram), bài giới thiệu | ☐ |
