# nen-tang/ – Nền tảng Tầng 1 (headless, không chứa nghiệp vụ)

Cấu hình các dịch vụ lõi dùng chung cho Tầng 2. Ở đây **không có** tên bảng, thủ tục, vai trò hay người dùng của một nghiệp vụ cụ thể; những thứ đó nằm trong bộ máy một cửa [`mot-cua/`](../mot-cua/) (dịch vụ Tầng 2, mount vào `/tang2`, tên cố định ở khóa `x-tang2` của `docker-compose.yml`) và các gói [`thu-tuc/<ma>/`](../thu-tuc/).

| Thư mục | Nội dung |
|---|---|
| `postgres/initdb/` | role `authenticator` (PostgREST) và `anon`; schema `dxos`: hàm đọc claim JWT cho RLS (`dxos.jwt_sub()`…), sổ `dxos.app_migration` |
| `keycloak/realm-dxos.json` | realm `dxos`: khóa ký RS256, chính sách OTP, chống dò mật khẩu, client `dxos_api` (audience, không có role) và `dxos_cli` (chỉ dev) |
| `apisix/` | `/public/*` → role `anon`, chỉ GET, 60 req/phút/IP; `/api/*` → PostgREST, `/workflow/*` → backend Tầng 2 (dịch vụ `mot-cua-api`), `/files/*` → API tệp: bắt buộc JWT realm `dxos`; chặn 403 API quản trị Flowable; CORS theo `DXOS_CORS_ORIGINS` (`docs/architecture.md` §4.1) |
| `scripts/tang2-migrate.sh` | dịch vụ một lần: áp dụng `mot-cua/db/` (migration + seed) |
| `scripts/tang2-realm.sh` | dịch vụ một lần: nạp `mot-cua/keycloak/realm.json` vào realm `dxos` |
| `scripts/db-init.sh` | dịch vụ một lần: role + CSDL riêng của `authenticator`, `keycloak`, `flowable`, mật khẩu theo OpenBao (chạy lại không lỗi, dùng được với volume cũ) |
| `scripts/kc-start.sh` | entrypoint Keycloak: đọc mật khẩu CSDL và quản trị từ tệp bí mật (OpenBao) |
| `scripts/garage-init.py` | dịch vụ một lần: layout Garage, bucket Tầng 2 khai báo, khóa S3 riêng của Tầng 2 → OpenBao |
| `rabbitmq/` | RabbitMQ một nút (#9): `rabbitmq.conf` (STOMP 61613, HTTP API quản trị 15672, chỉ trong mạng nội bộ), `enabled_plugins`; tài khoản quản trị từ OpenBao; `docs/architecture.md` §4.5 |
| `scripts/rabbitmq-init.py` | dịch vụ một lần: vhost + user riêng của Tầng 2 (không tag, không configure), nạp `mot-cua/rabbitmq/definitions.json`, thông tin kết nối → OpenBao |
| `openbao/` | két sắt bí mật (#10): `config.hcl` (server raft, không UI, audit), `bao-init.py` (init/unseal/KV/policy/AppRole, `make bao-init`), `policies/` (policy từng danh tính), `agent/` (agent một lần render tệp bí mật), `kiem-quyen.py` (kiểm policy trong `make smoke`); `docs/architecture.md` §4.4 |

Workflow engine Flowable REST (`docker-compose.yml`, dịch vụ `flowable`) không có cấu hình riêng trong `nen-tang/` và không tự quét thư mục BPMN nào: bộ nạp `nap-thu-tuc` của bộ máy deploy BPMN của từng gói thủ tục qua REST.

Vì sao tách và hợp đồng giữa nền tảng, bộ máy và gói thủ tục: [`docs/architecture.md` §2](../docs/architecture.md#2-ba-lớp-nen-tang-bộ-máy-mot-cua-gói-thu-tucma-d-009).
