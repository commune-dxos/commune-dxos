# core/ – Lõi Tầng 1 (headless, không chứa nghiệp vụ)

Cấu hình các dịch vụ lõi dùng chung cho mọi ứng dụng Tầng 2. Ở đây **không có** tên bảng, thủ tục, vai trò hay người dùng của một nghiệp vụ cụ thể; những thứ đó nằm trong `apps/<tên>/` và được nạp theo biến `DXOS_APP`.

| Thư mục | Nội dung |
|---|---|
| `postgres/initdb/` | role `authenticator` (PostgREST) và `anon`; schema `dxos`: hàm đọc claim JWT cho RLS (`dxos.jwt_sub()`…), sổ `dxos.app_migration` |
| `keycloak/realm-dxos.json` | realm `dxos`: khóa ký RS256, chính sách OTP, chống dò mật khẩu, client `dxos_api` (audience, không có role) và `dxos_cli` (chỉ dev) |
| `apisix/` | `/public/*` → role `anon`, chỉ GET, 60 req/phút/IP; `/api/*` → PostgREST, `/workflow/*` → backend của ứng dụng (dịch vụ `app-backend`), `/files/*` giữ chỗ 503: bắt buộc JWT realm `dxos`; chặn 403 API quản trị Flowable; CORS theo `DXOS_CORS_ORIGINS` (`docs/architecture.md` §4.1) |
| `scripts/app-migrate.sh` | dịch vụ một lần: áp dụng `apps/<DXOS_APP>/db/` (migration + seed) |
| `scripts/app-realm.sh` | dịch vụ một lần: nạp `apps/<DXOS_APP>/keycloak/realm.json` vào realm `dxos` |
| `scripts/db-init.sh` | dịch vụ một lần: role + CSDL riêng của `authenticator`, `keycloak`, `flowable`, mật khẩu theo OpenBao (chạy lại không lỗi, dùng được với volume cũ) |
| `scripts/kc-start.sh` | entrypoint Keycloak: đọc mật khẩu CSDL và quản trị từ tệp bí mật (OpenBao) |
| `scripts/garage-init.py` | dịch vụ một lần: layout Garage, bucket ứng dụng khai báo, khóa S3 riêng của ứng dụng → OpenBao |
| `openbao/` | két sắt bí mật (#10): `config.hcl` (server raft, không UI, audit), `bao-init.py` (init/unseal/KV/policy/AppRole, `make bao-init`), `policies/` (policy từng danh tính), `agent/` (agent một lần render tệp bí mật), `kiem-quyen.py` (kiểm policy trong `make smoke`); `docs/architecture.md` §4.4 |

Workflow engine Flowable REST (`docker-compose.yml`, dịch vụ `flowable`) không có cấu hình riêng trong `core/`: nó tự triển khai `apps/<DXOS_APP>/processes/*.bpmn20.xml` khi khởi động.

Vì sao tách và hợp đồng giữa lõi với ứng dụng: [`docs/architecture.md` §2](../docs/architecture.md#2-lõi-độc-lập-nghiệp-vụ-core-và-appstên).
