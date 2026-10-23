# nen-tang/ – Nền tảng Tầng 1 (headless, không chứa nghiệp vụ)

Cấu hình các dịch vụ lõi dùng chung cho Tầng 2. Ở đây **không có** tên bảng, thủ tục, vai trò hay người dùng của một nghiệp vụ cụ thể; những thứ đó nằm trong bộ máy một cửa [`mot-cua/`](../mot-cua/) (dịch vụ Tầng 2, mount vào `/tang2`, tên cố định ở khóa `x-tang2` của `docker-compose.yml`) và các gói [`thu-tuc/<ma>/`](../thu-tuc/).

| Thư mục | Nội dung |
|---|---|
| `postgres/initdb/` | role `authenticator` (PostgREST) và `anon`; schema `dxos`: hàm đọc claim JWT cho RLS (`dxos.jwt_sub()`…), sổ `dxos.app_migration` |
| `postgres/Dockerfile` | image PostgreSQL của nền tảng: `postgres:17.6-alpine` gốc + pgAudit 17.1 biên dịch từ mã nguồn ghim SHA-256 (#75); `docker-compose.yml` bật `shared_preload_libraries=pgaudit`, log phiên theo `DXOS_PGAUDIT_LOG`, log đối tượng theo role `dxos_kiem_toan` (`docs/architecture.md` §4.6) |
| `step-ca/ky-tai-lieu.tpl`, `scripts/step-ca-start.sh`, `scripts/ca-init.sh` | CA nội bộ (#77): step-ca khởi tạo CA hai tầng lần đầu (mật khẩu từ OpenBao), áp mẫu chứng thư ký tài liệu; `ca-init` cấp (gia hạn) chứng thư cho dịch vụ Tầng 2 rồi ghi vào OpenBao `dxos/tang2/<DXOS_TANG2>/ky-so`. Gotenberg (sinh PDF) không có cấu hình riêng ở đây, chỉ tham số trong `docker-compose.yml` (`docs/architecture.md` §4.7) |
| `superset/` | Superset (#82, profile `bi`, `make up-bi`): `Dockerfile` (image gốc + driver PostgreSQL, Authlib), `superset_config.py` (metadata CSDL `superset`, không Redis, SSO Keycloak, vai theo client role, dưới `/bao-cao`), `superset-init.sh` (nâng lược đồ, vai mặc định, chạy phần dựng báo cáo mà Tầng 2 khai ở `/tang2/bao-cao/superset_dung.py`). db-init tạo CSDL `superset` và role đăng nhập `bao_cao_doc` (chỉ đăng nhập, quyền đọc do Tầng 2 cấp) (`docs/architecture.md` §4.10) |
| `keycloak/realm-dxos.json` | realm `dxos`: khóa ký RS256, chính sách OTP, chống dò mật khẩu, client `dxos_api` (audience, không có role) và `dxos_cli` (chỉ dev) |
| `apisix/` | `/public/*` → role `anon`, chỉ GET, 60 req/phút/IP; `/api/*` → PostgREST, `/workflow/*` → backend Tầng 2 (dịch vụ `mot-cua-api`), `/files/*` → API tệp: bắt buộc JWT realm `dxos`; chặn 403 API quản trị Flowable; CORS theo `DXOS_CORS_ORIGINS` (`docs/architecture.md` §4.1) |
| `scripts/tang2-migrate.sh` | dịch vụ một lần: áp dụng `mot-cua/db/` (migration + seed) |
| `scripts/tang2-realm.sh` | dịch vụ một lần: nạp `mot-cua/keycloak/realm.json` vào realm `dxos` |
| `scripts/db-init.sh` | dịch vụ một lần: role + CSDL riêng của `authenticator`, `keycloak`, `flowable`, mật khẩu theo OpenBao; role `superset` + CSDL `superset`, role `bao_cao_doc` (#82), role `dxos_kiem_toan` và extension `pgaudit` (chạy lại không lỗi, dùng được với volume cũ) |
| `scripts/kc-start.sh` | entrypoint Keycloak: đọc mật khẩu CSDL và quản trị từ tệp bí mật (OpenBao) |
| `scripts/garage-init.py` | dịch vụ một lần: layout Garage, bucket Tầng 2 khai báo, khóa S3 riêng của Tầng 2 → OpenBao |
| `rabbitmq/` | RabbitMQ một nút (#9): `rabbitmq.conf` (STOMP 61613, HTTP API quản trị 15672, chỉ trong mạng nội bộ), `enabled_plugins`; tài khoản quản trị từ OpenBao; `docs/architecture.md` §4.5 |
| `scripts/rabbitmq-init.py` | dịch vụ một lần: vhost + user riêng của Tầng 2 (không tag, không configure), nạp `mot-cua/rabbitmq/definitions.json`, thông tin kết nối → OpenBao |
| `openbao/` | két sắt bí mật (#10): `config.hcl` (server raft, không UI, audit), `bao-init.py` (init/unseal/KV/policy/AppRole, `make bao-init`), `policies/` (policy từng danh tính), `agent/` (agent một lần render tệp bí mật), `kiem-quyen.py` (kiểm policy trong `make smoke`); `docs/architecture.md` §4.4 |

Workflow engine Flowable REST (`docker-compose.yml`, dịch vụ `flowable`) không có cấu hình riêng trong `nen-tang/` và không tự quét thư mục BPMN nào: bộ nạp `nap-thu-tuc` của bộ máy deploy BPMN của từng gói thủ tục qua REST.

Vì sao tách và hợp đồng giữa nền tảng, bộ máy và gói thủ tục: [`docs/architecture.md` §2](../docs/architecture.md#2-ba-lớp-nen-tang-bộ-máy-mot-cua-gói-thu-tucma-d-009).
