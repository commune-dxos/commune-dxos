# Khai báo phụ thuộc / Dependencies

Từ OLP PMNM 2026, BTC yêu cầu đội tự rà và khai báo minh bạch giấy phép và nguồn gốc
từng module bên ngoài; khai sai hoặc thiếu bị xử lý nặng hơn năm 2025.
Tệp này bổ sung cho [`NOTICE`](NOTICE): NOTICE ghi thành phần theo lớp kiến trúc,
còn tệp này ghi **từng** image, gói npm, gói pip kèm phiên bản cụ thể.

Quy tắc:
- Chỉ thêm thành phần có giấy phép OSI-approved. Danh sách cấm: `../CLAUDE.md` và `CLAUDE.md`.
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
