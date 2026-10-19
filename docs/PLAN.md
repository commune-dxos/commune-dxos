# Kế hoạch Team 2 – Commune DX-OS

Lịch làm việc: Thứ 5 – Thứ 7. Đánh dấu [x] khi xong (dùng `/update-mapping`). Việc gắn (SV) nên giao sinh viên tự làm và commit.

## Tuần 1 · 15–21/10 · Nền móng → v0.0.1
- [x] Xác minh LICENSE trên GitHub chính thức: Garage, Meilisearch, pyHanko, step-ca, Gotenberg, PostgREST, Flowable → ghi NOTICE + DECISIONS (D-004)
- [x] `docs/architecture.md`: sơ đồ 3 tầng (Mermaid) + luồng JWT → RLS (luồng hồ sơ một cửa chi tiết: tuần 3 cùng BPMN)
- [x] `docker-compose.yml` profile `core` bước 1: PostgreSQL, Keycloak (realm + MFA), APISIX standalone (không cần etcd), PostgREST; `.env.example` — đã `make up` thử 17/10/2026 (`docs/architecture.md` §7.1)
- [ ] Tạo repo GitHub công khai, bật Issues, đẩy khung; tạo issue cho các việc tuần 2
- [ ] Release v0.0.1

## Tuần 2 · 22–28/10 · Lõi headless → v0.1.0
- [ ] Schema: procedures, applications, documents, staff, fields + RLS theo lĩnh vực
- [ ] PostgREST trên schema, JWT Keycloak → role PostgreSQL
- [ ] APISIX: route `/api`, `/files`, `/workflow`, rate limit cổng công dân
- [ ] Garage S3 + API tải hồ sơ, quét ClamAV trước khi lưu
- [ ] Flowable + quy trình BPMN đầu tiên (đăng ký khai sinh) trong `processes/`
- [ ] RabbitMQ nhận sự kiện từ Flowable
- [ ] OpenBao giữ bí mật · README chạy từ máy sạch · Release v0.1.0

## Tuần 3 · 29/10–04/11 · Luồng nghiệp vụ chính
- [ ] JSON Schema cho từng thủ tục + Poka-yoke kiểm tra đủ thành phần hồ sơ
- [ ] Cổng công dân (React): chọn thủ tục, nộp hồ sơ, tra cứu trạng thái (SV)
- [ ] Cổng cán bộ: danh sách task Flowable, xử lý, chuyển bước (SV)
- [ ] Cảnh báo trễ hạn qua RabbitMQ

## Tuần 4 · 05–11/11 · Tầng [D] + bảo mật → v0.2.0
- [ ] Log kiểm toán append-only + chuỗi băm SHA-256 + endpoint xác minh toàn vẹn
- [ ] step-ca + pyHanko: ký số biên nhận/kết quả PDF; Gotenberg sinh PDF
- [ ] Hồ sơ hoàn tất → Parquet; dbt-core cho báo cáo + lineage
- [ ] Superset dashboard thời gian giải quyết, tỷ lệ trễ hạn (SV) · Release v0.2.0

## Tuần 5 · 12–18/11 · Tầng [I] + demo công khai
- [ ] OCR (PaddleOCR/VietOCR) giấy tờ mẫu giả → tự điền hồ sơ → cán bộ xác nhận (HITL)
- [ ] Nạp thủ tục hành chính công khai → Meilisearch + pgvector; trợ lý RAG (Qwen2.5 + LlamaIndex) (SV)
- [ ] Triển khai demo công khai, mời cán bộ/sinh viên dùng thử

## Tuần 6 · 19–25/11 · Hoàn thiện → v0.3.0
- [ ] Sửa lỗi theo phản hồi, ghi issue từ người dùng ngoài
- [ ] README song ngữ, hướng dẫn thêm thủ tục mới (BPMN + JSON Schema) như module cắm–rút
- [ ] Release v0.3.0

## Tuần 7 · 26/11–06/12 · Nộp bài → v1.0.0
- [ ] `/pof-check` đạt toàn bộ · đóng băng tính năng · `/release 1.0.0`
- [ ] Gửi email nộp bài (xem `docs/contest/`)
- [ ] Slide 15 phút + video demo dự phòng
