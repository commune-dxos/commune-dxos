# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]
### Added
- Khung dự án: LICENSE (Apache-2.0), NOTICE, CONTRIBUTING, CODE_OF_CONDUCT, CI kiểm tra giấy phép, mẫu issue.
- `docker-compose.yml` profile `core`: PostgreSQL 17, Keycloak 26, PostgREST v13, APISIX 3.13 (standalone); image ghim phiên bản, có healthcheck; `.env.example`.
- `infra/postgres/initdb/`: schema `mot_cua`, bảng `ho_so` bật RLS, role `anon`/`cong_dan`/`can_bo`/`lanh_dao`, quyền theo cột, dữ liệu mẫu giả.
- `infra/keycloak/realm-commune.json`: realm `commune`, client `commune_api`/`commune_web`/`commune_cli`, vai trò ánh xạ sang role PostgreSQL, OTP bắt buộc cho cán bộ và lãnh đạo.
- `infra/apisix/`: route `/api/*` kiểm JWT Keycloak (openid-connect + JWKS), route công khai `/api/thu_tuc` có giới hạn tần suất.
- `docs/architecture.md`: sơ đồ Mermaid 3 tầng, luồng JWT → RLS, chia profile, cách viết BPMN không có modeler, lệnh chạy thử.
- `DEPENDENCIES.md`: khai báo image, thư viện npm/pip, mô hình AI kèm phiên bản, giấy phép, nguồn.
- README: mục "Giấy phép / License" song ngữ.
- CI `.github/workflows/check.yml` chạy `make check` trên mỗi push/PR.

### Changed
- NOTICE, CLAUDE.md theo D-004: Meilisearch Community Edition (MIT), dbt-core từ PyPI (không dùng dbt Fusion), image `flowable/flowable-rest`, Qwen2.5 chỉ bản 7B/14B; trạng thái "Đã xác minh 17/10/2026".
- `scripts/check-license.sh`, `scripts/add-license-header.sh` (dùng chung `scripts/lib-spdx.sh`): quét thêm Dockerfile, Makefile, `.env.example`, `.yml/.yaml`, `.toml`, `.conf`, `.ini`, `.properties`, `.css`, `.xml/.bpmn`; bỏ qua `.json` và thư mục bên thứ ba.
- `make check` kiểm compose với mọi profile, dùng `.env.example` khi chưa có `.env`.

### Fixed
- Chạy thử profile `core` (17/10/2026): cổng PostgreSQL trên host mặc định đổi sang 55432 để không đụng PostgreSQL cài sẵn; bỏ healthcheck `postgrest --ready` (v13.0.4 không có cờ này, image amd64 không có shell), thay bằng health check chủ động của APISIX tới `/ready` (cổng admin 3001).

### Removed
- `.github/workflows/ci.yml` (thay bằng `check.yml`; job `docker compose build` cũ không có gì để build).
