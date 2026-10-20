# Khai báo phụ thuộc / Dependencies

Từ OLP PMNM 2026, BTC yêu cầu đội tự rà và khai báo minh bạch giấy phép và nguồn gốc
từng module bên ngoài; khai sai hoặc thiếu bị xử lý nặng hơn năm 2025.
Tệp này bổ sung cho [`NOTICE`](NOTICE): NOTICE ghi thành phần theo lớp kiến trúc,
còn tệp này ghi **từng** image, gói npm, gói pip kèm phiên bản cụ thể.

Quy tắc:
- Chỉ thêm thành phần có giấy phép OSI-approved. Không dùng các thành phần ở mục 5.
- Thêm/nâng phiên bản một phụ thuộc → sửa dòng tương ứng trong cùng commit.
- Cột "Nguồn" là nơi tải về (registry) và nơi đọc giấy phép (repo gốc).

## 1. Image Docker (`docker-compose.yml`)

| Image | Phiên bản | Giấy phép | Nguồn | Profile |
|---|---|---|---|---|
| `postgres` | 17.6-alpine | PostgreSQL | Docker Hub (official) · https://www.postgresql.org/about/licence/ | core |
| `quay.io/keycloak/keycloak` | 26.3.3 | Apache-2.0 | quay.io · https://github.com/keycloak/keycloak | core |
| `postgrest/postgrest` | v13.0.4 | MIT | Docker Hub · https://github.com/PostgREST/postgrest | core |
| `apache/apisix` | 3.13.0-debian | Apache-2.0 | Docker Hub · https://github.com/apache/apisix | core |
| `flowable/flowable-rest` | 8.0.0 (tuần 2) | Apache-2.0 | Docker Hub · https://github.com/flowable/flowable-engine | core |
| `dxflrs/garage` | (tuần 2) | AGPL-3.0, dịch vụ riêng | Docker Hub · https://git.deuxfleurs.fr/Deuxfleurs/garage | core |
| `rabbitmq` | (tuần 2) | MPL-2.0 | Docker Hub (official) · https://github.com/rabbitmq/rabbitmq-server | core |
| `openbao/openbao` | (tuần 2) | MPL-2.0 | Docker Hub · https://github.com/openbao/openbao | core |
| `clamav/clamav` | (tuần 2) | GPL-2.0, dịch vụ riêng | Docker Hub · https://github.com/Cisco-Talos/clamav | docs |
| `getmeili/meilisearch` | (tuần 5) – chỉ CE | MIT | Docker Hub · https://github.com/meilisearch/meilisearch | docs |

Image `postgres` cũng được dùng cho dịch vụ một lần `jwks-init` (lấy JWKS bằng `wget` có sẵn trong image).

## 2. Thư viện npm (`web/package.json`, chưa có)

Sinh bảng tự động khi có mã: `npx license-checker --production --csv` rồi dán vào đây.

| Gói | Phiên bản | Giấy phép | Nguồn | Dùng ở |
|---|---|---|---|---|
| _(chưa có — tuần 3: react, vite, tailwindcss, shadcn/ui…)_ | | | npmjs.com | |

## 3. Thư viện Python (`pyproject.toml` / `requirements.txt`, chưa có)

Sinh bảng tự động khi có mã: `pip-licenses --format=markdown --with-urls`.

| Gói | Phiên bản | Giấy phép | Nguồn | Dùng ở |
|---|---|---|---|---|
| _(chưa có — tuần 4: dbt-core 1.x, duckdb, pyhanko…)_ | | | pypi.org | |

## 4. Mô hình AI (tuần 5)

| Mô hình | Phiên bản | Giấy phép | Nguồn |
|---|---|---|---|
| Qwen2.5 | 7B hoặc 14B (không dùng 3B) | Apache-2.0 | huggingface.co/Qwen |
| bge-m3 | — | MIT | huggingface.co/BAAI/bge-m3 |

## 5. Thành phần không dùng

Đội chủ động không dùng các thành phần dưới đây, kể cả khi chỉ chạy như dịch vụ riêng: giấy phép không được OSI phê duyệt
(hoặc có phần không OSI) thì không đưa vào kho, đã có thay thế nguồn mở. Kiểm tra giấy phép ngày 17/10/2026.

| Thành phần | Lý do không dùng | Dùng thay |
|---|---|---|
| n8n | Giấy phép Sustainable Use License (fair-code), không OSI | Flowable (BPMN) + RabbitMQ |
| HashiCorp Vault | Chuyển sang BSL 1.1 từ 2023, không OSI | OpenBao (MPL-2.0) |
| Redpanda | Bản cộng đồng dùng BSL 1.1, không OSI | RabbitMQ (MPL-2.0) |
| MongoDB | SSPL, không OSI | PostgreSQL |
| Directus | BSL 1.1, không OSI | PostgREST (MIT) |
| Orion-LD | Bắt buộc chạy kèm MongoDB (SSPL) | Không cần cho đề tài này |
| bpmn-js | Giấy phép bpmn.io có điều khoản giữ logo/watermark, không OSI | BPMN 2.0 viết XML tay trong `processes/` |
| immudb | Các bản từ cuối 2023 (kể cả v1.11.x) chuyển sang BSL 1.1, không OSI | Bảng append-only + chuỗi băm SHA-256 (mã của đội) + pgAudit |
| Meilisearch Enterprise Edition | Các tệp `meilisearch-enterprise-*` dùng BUSL-1.1 | Meilisearch Community Edition (MIT), không bật tính năng EE |
| dbt Fusion | Bản phân phối "dbt" viết bằng Rust dùng giấy phép riêng, không OSI | `dbt-core` 1.x cài từ PyPI (Apache-2.0) |
| Mô hình Llama, Gemma | Giấy phép riêng của Meta/Google có điều khoản hạn chế sử dụng, không OSI | Qwen2.5 7B/14B (Apache-2.0) |
| Qwen2.5-3B | Dùng giấy phép Qwen Research, không phải Apache-2.0 như bản 7B/14B | Qwen2.5 7B hoặc 14B, không hạ xuống 3B cho máy yếu |
