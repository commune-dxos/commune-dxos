# Kế hoạch Team 2 – Commune DX-OS

Đội DTU_DZ_2 · Lịch làm việc: Thứ 5 – Thứ 7 · Hạn nộp: **17:00 Chủ nhật 06/12/2026** · Chung kết: 10/12/2026.

Cách dùng tệp này:
- Mỗi dòng `[ ]` là **một issue** trên GitHub, gắn vào milestone `Tuần N`, nhãn thành phần và nhãn vai, giao cho người phụ trách vai đó. Milestone, nhãn, bảng Project: [`quy-trinh-lam-viec.md`](quy-trinh-lam-viec.md); quy trình issue → nhánh → PR: [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- Đánh dấu `[x]` khi PR của dòng đó đã merge vào `develop`, ghi số issue/PR ở cuối dòng.
- Vai phụ trách:
  - **V1** – lõi Tầng 1, DevOps, bảo mật (nhãn `vai-1-core`)
  - **V2** – một cửa điện tử, BPMN Flowable, dashboard (nhãn `vai-2`)
  - **V3** – OCR giấy tờ, trợ lý RAG, tìm kiếm (nhãn `vai-3`)
- Ai phụ trách thì người đó commit bằng tài khoản của mình.

## Tuần 1 · 15–21/10 · Nền móng → v0.0.1
- [x] V1 · Xác minh giấy phép trên repo gốc: Garage, Meilisearch, pyHanko, step-ca, Gotenberg, PostgREST, Flowable → `NOTICE`, `DEPENDENCIES.md`
- [x] V1 · `docs/architecture.md`: sơ đồ 3 tầng (Mermaid) + luồng JWT → RLS
- [x] V1 · `docker-compose.yml` profile `core` bước 1: PostgreSQL, Keycloak (realm + MFA cán bộ), APISIX standalone, PostgREST; `.env.example`; đã chạy thử 17/10/2026 (`docs/architecture.md` §7.1)
- [x] V1 · Repo GitHub công khai, bật Issues, bảo vệ nhánh `main`/`develop`, nhãn tuần/vai, CI `make-check`
- [x] V1 · Dọn tài liệu tuần 1: mẫu PR, `CONTRIBUTING.md`, bản quyền DTU_DZ_2, kế hoạch tuần 2–7 (#1, PR #2)
- [ ] V1 · Tạo issue cho các việc tuần 2, gán người theo vai
- [ ] V1 · Release v0.0.1 (tag trên `main` + `.tar.gz`)

## Tuần 2 · 22–28/10 · Lõi headless → v0.1.0
- [x] V1 · Tách `core/` (Tầng 1, không chứa nghiệp vụ) và `apps/mot-cua/` (Tầng 2), chọn ứng dụng bằng `DXOS_APP`; bảng hồ sơ chuyển khỏi init SQL của lõi; dịch vụ một lần `app-migrate`, `app-realm`; `make smoke` (JWT/MFA/RLS, migration chạy lại) (#3)
- [ ] V2 · Schema ứng dụng trong `mot-cua/`: thủ tục, hồ sơ, thành phần hồ sơ, cán bộ, lĩnh vực + RLS theo lĩnh vực; migration và seed dữ liệu giả (#5, PR chờ duyệt)
- [x] V1 · PostgREST phục vụ schema ứng dụng, JWT Keycloak → role PostgreSQL; APISIX route `/api`, `/public`, `/workflow` (qua API quy trình mỏng `apps/mot-cua/backend/`, chặn API quản trị Flowable), `/files` (giữ chỗ 503), CORS theo biến môi trường, rate limit cổng công dân (#6, PR chờ duyệt)
- [x] V1 · Garage v2.4.1 (S3 một nút, dịch vụ riêng, khóa riêng mỗi ứng dụng) + API tải tệp hồ sơ `/files` (kiểm loại + magic bytes, link GET ký ngắn hạn, quyền theo RLS); ClamAV 1.5.4 quét tệp trước khi lưu, tệp nhiễm bị chặn và ghi nhật ký (#7, PR chờ duyệt)
- [ ] V2 · Flowable (`flowable/flowable-rest:8.0.0`) + quy trình BPMN đầu tiên (đăng ký khai sinh) **viết XML tay** trong `thu-tuc/khai-sinh/` (#8, PR chờ duyệt)
- [x] V2 · RabbitMQ 4.3.6 nhận sự kiện hồ sơ (mới, chuyển bước, hoàn tất/từ chối, sắp trễ hạn): outbox PostgreSQL → `app-worker` phát qua STOMP, vhost + user riêng của ứng dụng, consumer mẫu ghi nhật ký sự kiện (#9, PR chờ duyệt)
- [x] V1 · OpenBao 2.7.1 giữ mọi bí mật dịch vụ (mật khẩu CSDL, quản trị Keycloak/Flowable, client secret, khóa S3, bí mật Garage); `.env` không còn mật khẩu; mỗi dịch vụ một AppRole + policy chỉ đọc đúng phần mình; `make up` tự init/unseal (dev); chuyển được từ `.env` cũ (#10, PR chờ duyệt)
- [x] V3 · CI: thêm lint/test cho từng thành phần đã có – job `shellcheck`, `yamllint`, `bpmn`, `test-backend`, `test-sql` (PostgreSQL service container, migration lõi + app, `rls.sql` trước/sau seed); `make lint`, `make test` chạy cùng lệnh trên máy (#11, PR chờ duyệt)
- [x] V3 · README song ngữ chạy được từ máy sạch (`cp .env.example .env` → `make up` → `make smoke` → `make demo-users`), yêu cầu máy, xử lý lỗi; kiểm chứng trên bản clone mới ngoài thư mục mã: `make up` 128 giây, smoke 405/405 (#12, PR chờ duyệt)
- [x] V1 · Release v0.1.0 (#13)
- [ ] V2 · D-009 hướng 1 – mô hình gói thủ tục: `nen-tang/` + bộ máy `mot-cua/` + `thu-tuc/<ma>/` (khai sinh, chứng thực bản sao), bộ nạp `make nap-thu-tuc`, `docs/thu-tuc.md` (#30, PR chờ duyệt)

## Tuần 3 · 29/10–04/11 · Luồng nghiệp vụ chính
- [ ] V1 · D-009 hướng 3 – Milestones `Tuần 1` … `Tuần 7`, nhãn thành phần tự gắn theo tệp (`gan-nhan`), mẫu issue "Thủ tục mới"/"Việc trong tuần", Project "Commune DX-OS – Lộ trình", `docs/quy-trinh-lam-viec.md` (#34, PR chờ duyệt)
- [x] V2 · JSON Schema cho từng thủ tục + Poka-yoke: kiểm tra đủ thành phần hồ sơ trước khi khởi tạo quy trình Flowable – 2 lớp: cổng công dân (#53) + `mot-cua-api` 422 (#59, PR chờ duyệt)
- [ ] V3 · Cổng công dân (React + Vite + shadcn/ui): chọn thủ tục, nộp hồ sơ, tra cứu trạng thái – khung + danh mục + đăng nhập (#52, PR chờ duyệt); nộp hồ sơ #53, tra cứu #54
- [ ] V2 · Cổng cán bộ (SSO + MFA): danh sách task Flowable, xử lý, chuyển bước, lịch công tác
- [ ] V2 · Cảnh báo trễ hạn qua RabbitMQ (worker trong `mot-cua/`): sự kiện `ho_so.sap_tre_han` và `mot-cua-worker` đã có (#9); còn consumer thông báo cho cán bộ/công dân
- [ ] V1 · Mô tả luồng hồ sơ một cửa chi tiết trong `docs/architecture.md` (từ nộp tới trả kết quả) (#82, PR chờ duyệt)

## Tuần 4 · 05–11/11 · Tầng [D] + bảo mật + VPS → v0.2.0
- [ ] V1 · Log kiểm toán append-only + chuỗi băm SHA-256 + endpoint xác minh toàn vẹn; bật pgAudit (#75, PR chờ duyệt)
- [ ] V1 · step-ca + pyHanko: ký số biên nhận và kết quả PDF; Gotenberg sinh PDF (#77, PR chờ duyệt); văn bản đi/đến có ký số (#78)
- [ ] V2 · Hồ sơ hoàn tất → Parquet + DuckDB; `dbt-core` dựng báo cáo + lineage (#80, PR chờ duyệt)
- [ ] V2 · Superset: dashboard thời gian giải quyết, tỷ lệ trễ hạn (#82, PR chờ duyệt)
- [ ] V1 · **Thuê VPS + tên miền**, HTTPS, CI tự triển khai khi merge `main`
- [ ] V3 · Cuối tuần mời 3–5 người dùng thật (cán bộ xã, sinh viên) dùng thử, ghi phản hồi thành issue nhãn `user-feedback`
- [ ] V1 · Release v0.2.0

## Tuần 5 · 12–18/11 · Tầng [I] + demo công khai
- [ ] V3 · OCR (PaddleOCR + VietOCR) giấy tờ mẫu giả → tự điền hồ sơ → cán bộ xác nhận (HITL)
- [ ] V3 · Nạp thủ tục hành chính công khai → Meilisearch CE + pgvector; trợ lý RAG (Qwen2.5 7B/14B + bge-m3 + LlamaIndex); chọn nhà cung cấp mô hình qua `LLM_PROVIDER`
- [ ] V1 · Demo công khai trên tên miền, theo dõi lỗi và tài nguyên VPS
- [ ] V2 · Wiki văn bản cho cán bộ (tra cứu văn bản nội bộ)

## Tuần 6 · 19–25/11 · Tuần UX + cộng đồng → v0.3.0
- [ ] V2 · **Tuần UX:** sửa giao diện và luồng theo phản hồi người dùng (mỗi phản hồi một issue `user-feedback`)
- [ ] V3 · Tài liệu song ngữ; hướng dẫn cho **lập trình viên** viết gói thủ tục `thu-tuc/<ma>/` đã có ở `docs/thu-tuc.md` (#30, D-009), bổ sung ví dụ theo phản hồi
- [ ] V1 · **Thêm gói thủ tục** (ngoài khai sinh, chứng thực bản sao), mỗi gói một thư mục, không sửa mã bộ máy, để chứng minh cắm–rút theo gói (D-009 thay cho "module mẫu thứ hai" kiểu `apps/<tên>/`)
- [ ] V2 · **Công bố bộ JSON Schema thủ tục hành chính cấp xã dạng dữ liệu mở** (thư mục riêng, có README và giấy phép dữ liệu ghi rõ)
- [ ] V1 · V2 · V3 · **Tập trình bày lần 1** (15 phút, có demo trực tiếp)
- [ ] V1 · Release v0.3.0

## Tuần 7 · 26/11–06/12 · Đóng băng PoF, nộp bài → v1.0.0
- [ ] V1 · Rà đủ 6 tiêu chí PoF: LICENSE + SPDX mọi tệp, release có tag + `.tar.gz`, README song ngữ, CHANGELOG, hướng dẫn build từ máy sạch, bug tracker
- [ ] V1 · Đóng băng tính năng, release v1.0.0 (tag trên `main` + `.tar.gz` tạo bằng `git archive`)
- [ ] V1 · **Đóng băng PoF trước 17:00 Chủ nhật 06/12/2026**: PoF chấm theo hiện trạng kho mã lúc gửi bài. Sau mốc này chỉ commit để hoàn thiện demo, không làm hỏng build hay giấy phép
- [ ] V1 · Gửi email nộp bài tới `olpvietnam@vaip.vn` và `thuky@vfossa.vn`, tiêu đề `BÀI THI PMNM 2026 - DTU_DZ_2 - <Tên trường>`, trước 17:00 Chủ nhật 06/12/2026
- [ ] V1 · V2 · V3 · **Tập trình bày lần 2**; slide 15 phút
- [ ] V3 · Quay video demo dự phòng

## Sau hạn nộp · 07–10/12 · Chung kết
- [ ] V1 · V2 · V3 · Tập trình bày 15 phút lần cuối, kiểm tra demo trên VPS, chuẩn bị bản chạy local + video dự phòng
