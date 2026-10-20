# apps/mot-cua – Ứng dụng Một cửa cấp xã (Tầng 2)

Ứng dụng chính của Commune DX-OS: tiếp nhận và xử lý thủ tục hành chính. Cắm vào lõi `core/` bằng `DXOS_APP=mot-cua` trong `.env`; không sửa tệp nào của lõi.

| Tệp | Lõi dùng để |
|---|---|
| `app.env` | cấu hình PostgREST: phơi schema `mot_cua` |
| `db/migrations/001_schema_mot_cua.sql` | role `cong_dan`/`can_bo`/`lanh_dao`, bảng `thu_tuc`, `ho_so`, quyền theo cột, RLS (dùng `dxos.jwt_sub()` của lõi) |
| `db/seed/001_du_lieu_mau.sql` | 3 thủ tục, 2 hồ sơ – **dữ liệu giả**, chỉ nạp khi `DXOS_SEED=true` |
| `keycloak/realm.json` | client role của `dxos_api`, nhóm `/cong-dan`, `/can-bo`, `/lanh-dao`, client `mot_cua_web` (PKCE), người dùng mẫu; cán bộ và lãnh đạo bắt buộc cài OTP |
| `tests/smoke.sh` | `make smoke`: JWT 401/401/200, MFA, RLS từng vai trò |

| Vai trò | `thu_tuc` | `ho_so` |
|---|---|---|
| `anon` (lõi, `/public/*`) | đọc | không có quyền |
| `cong_dan` | đọc | đọc và nộp hồ sơ **của mình** |
| `can_bo` | đọc | đọc tất cả; đổi `trang_thai` khi hồ sơ chưa đóng |
| `lanh_dao` | đọc | chỉ đọc tất cả |

Sửa schema: thêm tệp `db/migrations/002_<mo-ta>.sql`, **không sửa** tệp đã áp dụng (`app-migrate` sẽ dừng vì SHA-256 khác). Áp dụng: `make migrate`.
Sắp tới (tuần 2–3): `processes/*.bpmn20.xml` (Flowable), cổng công dân và cổng cán bộ (React).
