# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]
### Added
- `apps/mot-cua/db/migrations/002_schema_day_du.sql`: schema `mot_cua` đầy đủ – `linh_vuc`, `thu_tuc` (thời hạn theo ngày làm việc, phí, công khai), `thanh_phan_yeu_cau`, `ngay_nghi`, `can_bo` (liên kết `sub` Keycloak) + `can_bo_linh_vuc`, `ho_so` (mã hồ sơ, hạn xử lý tính theo ngày làm việc, trạng thái `moi → dang_xu_ly → cho_bo_sung → hoan_tat | tu_choi` có trigger chặn bước sai), `thanh_phan_ho_so` (metadata, tệp ở Garage); khóa UUID, `created_at`/`updated_at` (#5).
- RLS bật và `FORCE` trên mọi bảng `mot_cua`: công dân chỉ thấy/nộp hồ sơ của mình và chỉ sửa khi chờ bổ sung; cán bộ chỉ thấy/xử lý hồ sơ thuộc lĩnh vực phụ trách; lãnh đạo chỉ đọc; `anon` chỉ đọc danh mục thủ tục công khai. Quyền GRANT theo cột, hàm nội bộ ở schema `mot_cua_noi_bo` không phơi ra API (#5).
- RPC công khai `json_schema_thu_tuc(ma)`: JSON Schema thành phần hồ sơ của thủ tục, chuẩn bị cho Poka-yoke tuần 3 (#5).
- Seed `002_du_lieu_mau.sql` (dữ liệu giả): 3 lĩnh vực, 6 thủ tục cấp xã kèm thành phần hồ sơ, 3 cán bộ khác lĩnh vực, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; người dùng mẫu `congdan02`, `canbo02`, `canbo03`, `id` Keycloak cố định khớp seed (#5).
- `apps/mot-cua/db/tests/rls.sql`: 63 kiểm tra quyền/RLS từng vai trò, chạy trong một transaction rồi ROLLBACK; `make smoke` chạy tệp này và gọi API qua APISIX bằng token thật của cả 4 vai trò (cán bộ, lãnh đạo dùng người dùng tạm có OTP, mã TOTP sinh trong script) (#5).
- `apps/mot-cua/README.md`: sơ đồ ER, sơ đồ trạng thái, bảng quyền theo vai trò, ghi chú dữ liệu cá nhân tối thiểu; `docs/architecture.md` §2.7, §8.3 (#5).

### Changed
- Migration 002 thay hai bảng giữ chỗ `thu_tuc`, `ho_so` của v0.0.1 (chỉ có dữ liệu giả); bỏ seed `001_du_lieu_mau.sql`. API đổi: `ho_so.thu_tuc_id` (UUID) thay cho `ma_thu_tuc`, trạng thái `moi_nop`/`bo_sung` đổi thành `moi`/`cho_bo_sung` (#5).

## [0.0.1] - 2026-10-20
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
- `.github/PULL_REQUEST_TEMPLATE.md`: mô tả, issue liên quan, checklist `make check`, SPDX, CHANGELOG, tài liệu, bí mật (#1).
- `DEPENDENCIES.md` mục 5: danh sách thành phần không dùng kèm lý do giấy phép và thành phần thay thế (#1).
- `apps/mot-cua/`: ứng dụng Tầng 2 đầu tiên – migration (role `cong_dan`/`can_bo`/`lanh_dao`, schema `mot_cua`, RLS), seed dữ liệu giả, vai trò/nhóm/người dùng Keycloak, `app.env`, smoke riêng (#3).
- Dịch vụ một lần `app-migrate` (áp dụng `apps/<DXOS_APP>/db/` một lần mỗi tệp, ghi sổ `dxos.app_migration` kèm SHA-256, dừng nếu tệp đã áp dụng bị sửa) và `app-realm` (Keycloak Partial Import, bỏ qua đối tượng đã có) (#3).
- Biến `DXOS_APP`, `DXOS_SEED` trong `.env.example`; lệnh `make migrate`, `make seed`, `make smoke` (`scripts/smoke.sh`, `scripts/lib-smoke.sh`) (#3).
- `docs/architecture.md` §2: vì sao lõi độc lập nghiệp vụ, hợp đồng lõi–ứng dụng, cách cắm một ứng dụng khác; §8.2 kết quả chạy thử 20/10/2026 (#3).

### Changed
- NOTICE theo kết quả xác minh giấy phép 17/10/2026: Meilisearch Community Edition (MIT), dbt-core từ PyPI (không dùng dbt Fusion), image `flowable/flowable-rest`, Qwen2.5 chỉ bản 7B/14B; trạng thái "Đã xác minh 17/10/2026".
- `scripts/check-license.sh`, `scripts/add-license-header.sh` (dùng chung `scripts/lib-spdx.sh`): quét thêm Dockerfile, Makefile, `.env.example`, `.yml/.yaml`, `.toml`, `.conf`, `.ini`, `.properties`, `.css`, `.xml/.bpmn`; bỏ qua `.json` và thư mục bên thứ ba.
- `make check` kiểm compose với mọi profile, dùng `.env.example` khi chưa có `.env`.
- `CONTRIBUTING.md` viết lại: quy trình issue → nhánh `feature/<số>-<tên>` từ `develop` → PR → 1 người duyệt → squash; Conventional Commits; quy tắc không commit bí mật và dữ liệu thật (#1).
- Mẫu issue "Việc cần làm" có ô "Tuần" và "Vai phụ trách" khớp nhãn `tuan-*`, `vai-*` (#1).
- `NOTICE` và `LICENSE` (dòng bản quyền trong APPENDIX): `Copyright 2026 DTU_DZ_2` (#1).
- **Tách lõi khỏi nghiệp vụ (D-005, D-008):** `infra/` đổi thành `core/`; init SQL của lõi chỉ còn role `authenticator`/`anon` và schema `dxos` (hàm `dxos.jwt_claims()`, `dxos.jwt_claim()`, `dxos.jwt_sub()`, sổ migration); realm lõi đổi thành `dxos` với client `dxos_api` (không có role) và `dxos_cli`; PostgREST lấy schema từ `apps/<DXOS_APP>/app.env`, đọc role ở `resource_access.dxos_api.roles[0]` (#3).
- APISIX: route công khai đổi từ `/api/thu_tuc` thành `/public/*` (chỉ GET/HEAD, bỏ header Authorization, chạy với role `anon`), lõi không còn nêu tên bảng nghiệp vụ (#3).
- Volume `pg-data` tạo trước bản này không tương thích: `docker compose --profile core down -v && make up` (#3).
- `docs/PLAN.md` theo lộ trình mới: gán vai V1/V2/V3 từng dòng, tách `core/`/`apps/` đầu tuần 2, VPS + tên miền tuần 4, tuần UX và 2 lần tập trình bày, bộ JSON Schema thủ tục dạng dữ liệu mở, module mẫu thứ hai, đóng băng PoF trước 17:00 06/12/2026 (#1).

### Fixed
- Chạy thử profile `core` (17/10/2026): cổng PostgreSQL trên host mặc định đổi sang 55432 để không đụng PostgreSQL cài sẵn; bỏ healthcheck `postgrest --ready` (v13.0.4 không có cờ này, image amd64 không có shell), thay bằng health check chủ động của APISIX tới `/ready` (cổng admin 3001).
- Bỏ các tham chiếu tới tệp không có trong kho (`DEPENDENCIES.md`, `docs/PLAN.md`, CHANGELOG); thông tin nộp bài ghi thẳng trong `docs/PLAN.md` (#1).

### Removed
- `.github/workflows/ci.yml` (thay bằng `check.yml`; job `docker compose build` cũ không có gì để build).

[Unreleased]: https://github.com/commune-dxos/commune-dxos/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/commune-dxos/commune-dxos/releases/tag/v0.0.1
