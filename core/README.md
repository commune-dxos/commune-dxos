# core/ – Lõi Tầng 1 (headless, không chứa nghiệp vụ)

Cấu hình các dịch vụ lõi dùng chung cho mọi ứng dụng Tầng 2. Ở đây **không có** tên bảng, thủ tục, vai trò hay người dùng của một nghiệp vụ cụ thể; những thứ đó nằm trong `apps/<tên>/` và được nạp theo biến `DXOS_APP`.

| Thư mục | Nội dung |
|---|---|
| `postgres/initdb/` | role `authenticator` (PostgREST) và `anon`; schema `dxos`: hàm đọc claim JWT cho RLS (`dxos.jwt_sub()`…), sổ `dxos.app_migration` |
| `keycloak/realm-dxos.json` | realm `dxos`: khóa ký RS256, chính sách OTP, chống dò mật khẩu, client `dxos_api` (audience, không có role) và `dxos_cli` (chỉ dev) |
| `apisix/` | `/public/*` → role `anon`, chỉ GET; `/api/*` → bắt buộc JWT realm `dxos` |
| `scripts/app-migrate.sh` | dịch vụ một lần: áp dụng `apps/<DXOS_APP>/db/` (migration + seed) |
| `scripts/app-realm.sh` | dịch vụ một lần: nạp `apps/<DXOS_APP>/keycloak/realm.json` vào realm `dxos` |

Vì sao tách và hợp đồng giữa lõi với ứng dụng: [`docs/architecture.md` §2](../docs/architecture.md#2-lõi-độc-lập-nghiệp-vụ-core-và-appstên).
