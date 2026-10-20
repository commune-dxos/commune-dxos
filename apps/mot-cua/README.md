# apps/mot-cua – Ứng dụng Một cửa cấp xã (Tầng 2)

Ứng dụng chính của Commune DX-OS: tiếp nhận và xử lý thủ tục hành chính. Cắm vào lõi `core/` bằng `DXOS_APP=mot-cua` trong `.env`; không sửa tệp nào của lõi.

| Tệp | Lõi dùng để |
|---|---|
| `app.env` | cấu hình PostgREST: phơi schema `mot_cua` |
| `db/migrations/001_schema_mot_cua.sql` | role `cong_dan`/`can_bo`/`lanh_dao` + `GRANT … TO authenticator`, schema `mot_cua` (bảng giữ chỗ tuần 1, bị 002 thay) |
| `db/migrations/002_schema_day_du.sql` | schema đầy đủ (#5): bảng, trigger, quyền theo cột, RLS mọi bảng |
| `db/seed/002_du_lieu_mau.sql` | **dữ liệu giả**: 3 lĩnh vực, 6 thủ tục kèm thành phần hồ sơ, 3 cán bộ, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; chỉ nạp khi `DXOS_SEED=true` |
| `db/tests/rls.sql` | test quyền/RLS (63 kiểm tra), chạy trong một transaction rồi ROLLBACK |
| `keycloak/realm.json` | client role của `dxos_api`, nhóm `/cong-dan`, `/can-bo`, `/lanh-dao`, client `mot_cua_web` (PKCE), 6 người dùng mẫu có `id` (= `sub`) cố định; cán bộ và lãnh đạo bắt buộc cài OTP |
| `tests/smoke.sh` | `make smoke`: route công khai, `rls.sql`, MFA, gọi API qua APISIX bằng token thật của từng vai trò (cán bộ, lãnh đạo dùng mật khẩu + TOTP). Cần thêm `python3` trên máy để sinh mã TOTP |

Sửa schema: thêm tệp `db/migrations/003_<mo-ta>.sql`, **không sửa** tệp đã áp dụng (`app-migrate` sẽ dừng vì SHA-256 khác). Áp dụng: `make migrate`.

## Sơ đồ dữ liệu

Khóa chính UUID (trừ `ngay_nghi` khóa theo ngày và bảng nối `can_bo_linh_vuc`); bảng nào cũng có `created_at`, `updated_at` (CSDL tự ghi).

```mermaid
erDiagram
  linh_vuc ||--o{ thu_tuc : "thuộc"
  linh_vuc ||--o{ can_bo_linh_vuc : "được giao"
  can_bo ||--o{ can_bo_linh_vuc : "phụ trách"
  thu_tuc ||--o{ thanh_phan_yeu_cau : "yêu cầu"
  thu_tuc ||--o{ ho_so : "theo"
  can_bo |o--o{ ho_so : "đang xử lý"
  ho_so ||--o{ thanh_phan_ho_so : "đính kèm"
  thanh_phan_yeu_cau |o--o{ thanh_phan_ho_so : "loại"
  can_bo |o--o{ thanh_phan_ho_so : "kiểm tra"

  linh_vuc {
    uuid id PK
    text ma UK "ho_tich, chung_thuc, dat_dai"
    text ten
  }
  thu_tuc {
    uuid id PK
    text ma UK "KS01, CT01…"
    text ten
    uuid linh_vuc_id FK
    int so_ngay_xu_ly "ngày làm việc"
    int le_phi "đồng"
    bool cong_khai
  }
  thanh_phan_yeu_cau {
    uuid id PK
    uuid thu_tuc_id FK
    text ma "UK theo thủ tục"
    text ten
    bool bat_buoc
    int so_luong
  }
  can_bo {
    uuid id PK
    text sub UK "sub Keycloak"
    text ho_ten
    text chuc_vu
    bool dang_lam_viec
  }
  can_bo_linh_vuc {
    uuid can_bo_id PK
    uuid linh_vuc_id PK
  }
  ho_so {
    uuid id PK
    text ma_ho_so UK "HSyyyymmdd-nnnnnn"
    uuid thu_tuc_id FK
    text nguoi_nop_sub "sub công dân"
    text ho_ten_nguoi_nop
    text so_dien_thoai "không bắt buộc"
    text trang_thai
    text ly_do
    timestamptz ngay_nhan
    date han_xu_ly "tính theo ngày làm việc"
    timestamptz ngay_hoan_tat
    uuid can_bo_xu_ly_id FK
  }
  thanh_phan_ho_so {
    uuid id PK
    uuid ho_so_id FK
    uuid thanh_phan_yeu_cau_id FK
    text ten_tep
    text loai_mime
    bigint kich_thuoc
    text sha256
    text object_key "khóa Garage (#7)"
    text trang_thai_kiem_tra
  }
  ngay_nghi {
    date ngay PK
    text ten
  }
```

- **Thành phần hồ sơ bắt buộc** nằm trong bảng `thanh_phan_yeu_cau` (không phải JSON trong cột) để kiểm "đủ thành phần" bằng một truy vấn. Hàm `mot_cua.json_schema_thu_tuc(ma)` sinh JSON Schema 2020-12 từ bảng này cho Poka-yoke (tuần 3): `GET /public/rpc/json_schema_thu_tuc?ma=KS01`. Dữ liệu được kiểm có dạng `{"thanh_phan": {"<ma>": ["<id thanh_phan_ho_so>", …]}}`.
- **Hạn xử lý** = ngày nhận (giờ Việt Nam) + `so_ngay_xu_ly` ngày làm việc, bỏ thứ Bảy, Chủ nhật và `ngay_nghi`; nộp vào ngày nghỉ thì tính từ ngày làm việc kế tiếp. Trigger tính khi nộp. Chưa xử lý: tạm dừng tính hạn khi chờ bổ sung, quy tắc nhận hồ sơ sau 15 giờ.
- **Trạng thái** (trigger chặn bước sai, mã lỗi 23514 → HTTP 400):

```mermaid
stateDiagram-v2
  [*] --> moi : công dân nộp
  moi --> dang_xu_ly : cán bộ nhận (tự giao cho mình)
  moi --> cho_bo_sung : cán bộ, có lý do
  moi --> tu_choi : cán bộ, có lý do
  dang_xu_ly --> cho_bo_sung : cán bộ, có lý do
  dang_xu_ly --> hoan_tat : cán bộ
  dang_xu_ly --> tu_choi : cán bộ, có lý do
  cho_bo_sung --> dang_xu_ly : công dân báo đã bổ sung / cán bộ
  cho_bo_sung --> tu_choi : cán bộ, có lý do
  hoan_tat --> [*]
  tu_choi --> [*]
```

## Dữ liệu cá nhân

Tối thiểu theo mục đích giải quyết thủ tục: `nguoi_nop_sub` (định danh Keycloak), họ tên người nộp, số điện thoại liên hệ (không bắt buộc). **Không** lưu số CCCD, ngày sinh, địa chỉ trong CSDL; giấy tờ tùy thân là một thành phần hồ sơ (tệp ở Garage, #7) và chỉ cán bộ phụ trách lĩnh vực của hồ sơ, lãnh đạo, chính người nộp xem được. Danh sách cán bộ không mở cho công dân và người ngoài. Dữ liệu mẫu đều giả (xã giả định, tên, số điện thoại `09000000xx`, `sub` dạng `00000000-…`).

## Quyền theo vai trò

Đổi vai trò như PostgREST làm cho mỗi request: `SET ROLE` theo `resource_access.dxos_api.roles[0]` của JWT, policy đọc `dxos.jwt_sub()` của lõi. RLS bật và `FORCE` trên mọi bảng của `mot_cua`. Không role nào ghi được danh mục, cán bộ, phân công, ngày nghỉ qua API (quản trị bằng migration/SQL); không role nào xóa được hồ sơ.

| Bảng | `anon` (`/public/*`) | `cong_dan` | `can_bo` | `lanh_dao` |
|---|---|---|---|---|
| `linh_vuc`, `ngay_nghi` | đọc | đọc | đọc | đọc |
| `thu_tuc`, `thanh_phan_yeu_cau` | đọc thủ tục `cong_khai` | đọc thủ tục `cong_khai` | đọc tất cả | đọc tất cả |
| `can_bo`, `can_bo_linh_vuc` | — | — | đọc | đọc |
| `ho_so` – đọc | — | hồ sơ của mình | hồ sơ thuộc lĩnh vực mình phụ trách | tất cả |
| `ho_so` – thêm | — | hồ sơ của mình, thủ tục công khai, trạng thái `moi`; chỉ cột `thu_tuc_id`, `ho_ten_nguoi_nop`, `so_dien_thoai` | — | — |
| `ho_so` – sửa | — | chỉ khi `cho_bo_sung`: `ho_ten_nguoi_nop`, `so_dien_thoai`, chuyển về `dang_xu_ly` | hồ sơ lĩnh vực mình, chưa đóng: `trang_thai`, `ly_do`, `can_bo_xu_ly_id` (người được giao phải cùng lĩnh vực) | — |
| `thanh_phan_ho_so` – đọc | — | của hồ sơ mình | của hồ sơ mình thấy | tất cả |
| `thanh_phan_ho_so` – thêm | — | vào hồ sơ mình khi `moi`/`cho_bo_sung`; loại thành phần phải thuộc thủ tục của hồ sơ | — | — |
| `thanh_phan_ho_so` – sửa | — | — | `trang_thai_kiem_tra`, `ghi_chu_kiem_tra` (CSDL ghi người, giờ kiểm tra) | — |

Cán bộ phụ trách lĩnh vực nào được tra từ `can_bo` (theo `sub`) + `can_bo_linh_vuc`, không cần claim riêng trong JWT: đổi phân công có hiệu lực ngay. Hàm tra cứu nằm ở schema `mot_cua_noi_bo` (không phơi ra API), `SECURITY DEFINER`, `search_path` rỗng.

## Người dùng mẫu

| Người dùng | `sub` | Vai trò | Ghi chú |
|---|---|---|---|
| `congdan01` | `…0000c001` | `cong_dan` | Nguyễn Văn Mẫu, 3 hồ sơ mẫu |
| `congdan02` | `…0000c002` | `cong_dan` | Lê Thị Thử, 3 hồ sơ mẫu |
| `canbo01` | `…0000b001` | `can_bo` | hộ tịch; bắt cài OTP |
| `canbo02` | `…0000b002` | `can_bo` | chứng thực; bắt cài OTP |
| `canbo03` | `…0000b003` | `can_bo` | đất đai; bắt cài OTP |
| `lanhdao01` | `…0000d001` | `lanh_dao` | bắt cài OTP |

Realm không chứa mật khẩu: đặt bằng `kcadm.sh set-password` (xem `docs/architecture.md` §8). `sub` cố định chỉ áp dụng khi realm được nạp lần đầu; volume Keycloak cũ giữ `sub` cũ.

## Chạy test

```bash
make smoke                      # toàn bộ: lõi + ứng dụng (126 kiểm tra)
docker compose exec -T postgres psql -XqtA -U postgres -d commune < apps/mot-cua/db/tests/rls.sql   # chỉ RLS
```

Sắp tới: `processes/*.bpmn20.xml` (Flowable, #8), API tệp và Garage (#7), cổng công dân và cổng cán bộ (React, tuần 3).
