# mot-cua – Bộ máy một cửa cấp xã (Tầng 2)

Bộ máy dùng chung cho **mọi thủ tục hành chính**: hồ sơ, vai trò, phân quyền theo lĩnh vực, API quy trình và tệp, cảnh báo trễ hạn, sự kiện. Bộ máy không chứa logic riêng của thủ tục nào: mỗi thủ tục là một gói [`thu-tuc/<ma>/`](../thu-tuc/) (mô tả, BPMN, JSON Schema thành phần hồ sơ, dữ liệu mẫu) mà bộ nạp `nap-thu-tuc` tự kiểm và nạp (D-009, [`docs/thu-tuc.md`](../docs/thu-tuc.md)). Nền tảng [`nen-tang/`](../nen-tang/) phục vụ bộ máy theo quy ước thư mục; không sửa tệp nào của nền tảng.

| Tệp | Dùng để |
|---|---|
| `postgrest.env` | cấu hình PostgREST: phơi schema `mot_cua` |
| `db/migrations/001_schema_mot_cua.sql` | role `cong_dan`/`can_bo`/`lanh_dao` + `GRANT … TO authenticator`, schema `mot_cua` (bảng giữ chỗ tuần 1, bị 002 thay) |
| `db/migrations/002_schema_day_du.sql` | schema đầy đủ (#5): bảng, trigger, quyền theo cột, RLS mọi bảng |
| `db/migrations/003_tep_ho_so.sql` | tệp hồ sơ (#7): role `dich_vu_tep`, cột người tải/kết quả quét, ràng buộc khóa object theo hồ sơ, bảng `nhat_ky_tep` chỉ thêm; công dân thôi `INSERT` metadata trực tiếp |
| `db/migrations/004_su_kien.sql` | sự kiện (#9): role `dich_vu_su_kien`, hộp thư đi `hop_thu_su_kien` (outbox), `nhat_ky_su_kien` chỉ thêm; xem [Sự kiện hồ sơ](#sự-kiện-hồ-sơ-rabbitmq-9) |
| `db/migrations/005_goi_thu_tuc.sql` | gói thủ tục (D-009): cột `goi`, `quy_trinh`, `bien_theo_buoc`, `json_schema` của `thu_tuc`, hạn 0 ngày (trong ngày), role `dich_vu_danh_muc`, RPC `nap_thu_tuc`, `rut_goi_vang`; `json_schema_thu_tuc` trả schema của gói |
| `db/seed/002_du_lieu_mau.sql` | **dữ liệu giả**: 3 lĩnh vực, 6 thủ tục kèm thành phần hồ sơ, 3 cán bộ, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; chỉ nạp khi `DXOS_SEED=true`. Thủ tục có gói (KS01, CT01) được bộ nạp ghi đè theo gói; 4 thủ tục còn lại chưa có gói nên chưa nộp qua `/workflow` được |
| `db/tests/rls.sql`, `db/tests/goi_thu_tuc.sql` | test quyền/RLS (110 kiểm tra) và danh mục gói (23 kiểm tra), chạy trong một transaction rồi ROLLBACK |
| `keycloak/realm.json` | client role của `dxos_api` (kể cả role dịch vụ), nhóm `/cong-dan`, `/can-bo`, `/lanh-dao`, client `mot_cua_web` (PKCE), client dịch vụ `mot_cua_tep`, `mot_cua_su_kien`, `mot_cua_danh_muc` (Client Credentials, secret do Keycloak sinh), 6 người dùng mẫu có `id` (= `sub`) cố định; cán bộ và lãnh đạo bắt buộc cài OTP |
| `s3/buckets.conf` | bucket Garage `mot-cua-ho-so`; nền tảng tạo bucket và khóa S3 riêng chỉ có quyền trên bucket này |
| `backend/main.py` | API quy trình `/workflow/*` (#6) và API tệp `/files/*` (#7): dịch vụ `mot-cua-api`, chỉ thư viện chuẩn Python; quy trình và biến từng bước đọc từ danh mục gói; xem [API cho Tầng 2](#api-cho-tầng-2) |
| `backend/nap_thu_tuc.py`, `goi_thu_tuc.py`, `kiem_bpmn.py` | bộ nạp gói thủ tục (D-009): dịch vụ một lần `nap-thu-tuc`, `make nap-thu-tuc`; phần kiểm gói chạy cả trong `make check` (`--chi-kiem`); xem [Gói thủ tục](#gói-thủ-tục-d-009) |
| `rabbitmq/definitions.json` | exchange, queue, binding của sự kiện hồ sơ (#9); nền tảng tạo vhost `mot-cua`, user riêng rồi nạp tệp này |
| `backend/worker.py`, `su_kien.py`, `hop_thu.py`, `stomp.py` | sự kiện (#9): dịch vụ `mot-cua-worker` phát hộp thư đi lên RabbitMQ, quét sắp trễ hạn, consumer mẫu |
| `backend/tep.py`, `backend/tests/` | phần thuần của API tệp (kiểm tên/loại/magic bytes, ký S3 SigV4, giao thức `clamd`, quy tắc quyền), bộ nạp gói và test đơn vị: `make test` |
| `tests/smoke.sh`, `smoke-tep.sh`, `smoke-su-kien.sh`, `smoke-goi-thu-tuc.sh` | `make smoke`: route công khai, test SQL, MFA, gọi API qua APISIX bằng token thật của từng vai trò (cán bộ, lãnh đạo dùng mật khẩu + TOTP), luồng khai sinh và chứng thực bản sao đầy đủ qua `/workflow`, cắm–rút gói tạm, tải/xem tệp, EICAR, link ký sẵn, sự kiện RabbitMQ. Cần thêm `python3` trên máy để sinh mã TOTP |
| `web-cong-dan/` | cổng công dân (#52): React + Vite + Tailwind + shadcn/ui, danh mục thủ tục qua `/public/thu_tuc`, đăng nhập `mot_cua_web` (PKCE); xem [README](web-cong-dan/README.md) |

Sửa schema: thêm tệp `db/migrations/006_<mo-ta>.sql`, **không sửa** tệp đã áp dụng (`tang2-migrate` sẽ dừng vì SHA-256 khác). Áp dụng: `make migrate`.

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
  ho_so |o--o{ nhat_ky_tep : "ghi lại"

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
    int so_ngay_xu_ly "ngày làm việc, 0 = trong ngày"
    int le_phi "đồng"
    bool cong_khai
    text goi UK "thư mục thu-tuc/<goi>/ (D-009)"
    text quy_trinh UK "process id BPMN của gói"
    jsonb bien_theo_buoc "formProperty từng bước"
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
    text object_key "ho-so/<ho_so_id>/<uuid>.<đuôi> (Garage)"
    text nguoi_tai_sub "sub người tải"
    text ket_qua_quet "sach (tệp nhiễm không được lưu)"
    text may_quet "phiên bản ClamAV"
    timestamptz quet_luc
    text trang_thai_kiem_tra
  }
  nhat_ky_tep {
    bigint id PK
    timestamptz luc
    text hanh_dong "tai_len, tu_choi_ma_doc, tu_choi_loai_tep, cap_link"
    text nguoi_sub
    text vai_tro
    uuid ho_so_id "không FK: nhật ký giữ lại"
    text sha256
    text chi_tiet "tên mẫu virus, ttl…"
  }
  ngay_nghi {
    date ngay PK
    text ten
  }
```

- **Thành phần hồ sơ bắt buộc** nằm trong bảng `thanh_phan_yeu_cau` (không phải JSON trong cột) để kiểm "đủ thành phần" bằng một truy vấn. Hàm `mot_cua.json_schema_thu_tuc(ma)` trả JSON Schema 2020-12 cho Poka-yoke (schema của gói, thủ tục chưa có gói thì sinh từ bảng này): `GET /public/rpc/json_schema_thu_tuc?ma=KS01`. Dữ liệu được kiểm có dạng `{"thanh_phan": {"<ma>": ["<id thanh_phan_ho_so>", …]}}`, ở cả hai lớp: cổng công dân (tệp đã chọn, trước khi gửi request) và `mot-cua-api` (tệp đã quét sạch, trước khi khởi tạo quy trình, #59).
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
| `thanh_phan_ho_so` – thêm | — | không trực tiếp: qua API tệp `/files` (quét ClamAV trước); dòng do tài khoản dịch vụ `dich_vu_tep` ghi, chỉ vào hồ sơ của người tải khi `moi`/`cho_bo_sung`, loại thành phần phải thuộc thủ tục của hồ sơ | — | — |
| `thanh_phan_ho_so` – sửa | — | — | `trang_thai_kiem_tra`, `ghi_chu_kiem_tra` (CSDL ghi người, giờ kiểm tra) | — |
| `nhat_ky_tep` | — | — | — | đọc (không ai sửa/xóa, kể cả superuser) |

Cán bộ phụ trách lĩnh vực nào được tra từ `can_bo` (theo `sub`) + `can_bo_linh_vuc`, không cần claim riêng trong JWT: đổi phân công có hiệu lực ngay. Hàm tra cứu nằm ở schema `mot_cua_noi_bo` (không phơi ra API), `SECURITY DEFINER`, `search_path` rỗng.

## API cho Tầng 2

Web (cổng công dân, cổng cán bộ) chỉ gọi APISIX `http://localhost:${APISIX_PORT:-9080}`, gửi access token Keycloak realm `dxos` (client `mot_cua_web`, Authorization Code + PKCE; cán bộ, lãnh đạo nhập thêm OTP) ở header `Authorization: Bearer …`. Origin của web phải nằm trong `DXOS_CORS_ORIGINS` (`.env`). Bảng route đầy đủ và lý do thiết kế: `docs/architecture.md` §4.1, §4.2.

| Tiền tố | Dùng cho | Ví dụ |
|---|---|---|
| `/public/` (không token, 60 req/phút/IP) | danh mục công khai cho cổng công dân | `GET /public/thu_tuc?select=id,ma,ten,thanh_phan_yeu_cau(ma,ten,bat_buoc)`, `GET /public/rpc/json_schema_thu_tuc?ma=KS01`, `GET /public/linh_vuc` |
| `/api/` (token) | đọc/ghi bảng `mot_cua` theo cú pháp PostgREST, quyền theo bảng ở mục [Quyền theo vai trò](#quyền-theo-vai-trò) | `GET /api/ho_so?select=*,thu_tuc:thu_tuc_id(ma,ten)&order=ngay_nhan.desc`, `PATCH /api/ho_so?id=eq.<id>` (cán bộ đổi trạng thái), `PATCH /api/thanh_phan_ho_so?id=eq.<id>` (cán bộ kiểm tra giấy tờ) |
| `/workflow/` (token) | quy trình Flowable của hồ sơ, qua `backend/main.py` | bảng dưới |
| `/files/` (token, body ≤ 10 MiB) | tải lên, liệt kê, cấp link xem tệp hồ sơ, qua `backend/main.py` | [bảng dưới](#files--tệp-hồ-sơ) |
| `/files/s3/` (không token, link ký sẵn) | tải nội dung tệp bằng link mà `/files/tep/{id}` cấp | chỉ GET/HEAD |

OpenAPI của PostgREST: `GET /api/` (kèm token) hoặc `GET /public/`, chỉ liệt kê bảng, cột, RPC mà vai trò của người gọi được quyền.

### `/workflow` – quy trình hồ sơ

Body và response là JSON; lỗi có dạng `{"loi": "…", "chiTiet": …}`. Người dùng không gọi thẳng Flowable và không cầm mật khẩu của nó; backend tự kiểm token, tra quyền rồi gọi Flowable bằng tài khoản kỹ thuật.

**Luồng nộp (#59):** tạo hồ sơ `POST /api/ho_so` → tải từng tệp `POST /files/ho-so/{id}/tep?thanh_phan_yeu_cau_id=…` (ClamAV quét) → khởi tạo `POST /workflow/ho-so/{id}/khoi-tao`. Cổng công dân (`web-cong-dan/src/lib/ho-so.ts`) và smoke dùng đúng thứ tự này.

**Poka-yoke phía máy chủ (#59, `backend/poka_yoke.py`):** trước khi gọi Flowable, `mot-cua-api` dựng tài liệu hồ sơ **từ CSDL** (không lấy từ client), đọc bằng token người gọi (RLS):

```json
{"ho_so": {"ho_ten_nguoi_nop": "…", "so_dien_thoai": "…"},
 "thanh_phan": {"<mã thành phần>": ["<id thanh_phan_ho_so>", …]}}
```

chỉ tính tệp đã quét sạch (`ket_qua_quet = 'sach'`) và đã có object trong kho, rồi kiểm bằng `jsonschema` (MIT, validator Draft 2020-12, kiểm cả `format: uuid`) với `thu_tuc.json_schema` của gói (không có thì `json_schema_thu_tuc`). Thiếu hoặc sai → **422**, không khởi tạo quy trình, không ghi sự kiện, hồ sơ vẫn `moi` để tải bổ sung rồi gọi lại:

```json
{"loi": "Hồ sơ chưa đủ thành phần: Giấy chứng sinh",
 "chiTiet": {"thanhPhan": [{"thanhPhan": "giay_chung_sinh", "ten": "Giấy chứng sinh", "loi": "Thiếu thành phần bắt buộc"}]}}
```

Câu lỗi theo từng thành phần: `Thiếu thành phần bắt buộc`, `Tệp đã nộp chưa được quét sạch, chưa tính là đã nộp`, `Cần ít nhất N tệp`, `Thành phần không thuộc thủ tục này`. Schema trong CSDL hỏng → 500 (lỗi cấu hình, ghi log). Không thêm trigger CSDL cho bước này: khởi tạo quy trình chỉ đi qua `mot-cua-api` (Flowable không mở ra ngoài, APISIX chặn API quản trị), công dân không đổi được `trang_thai` khỏi `moi` qua PostgREST (RLS chỉ cho sửa khi `cho_bo_sung`); cán bộ chuyển `moi → dang_xu_ly` là thao tác tại quầy, không khởi tạo quy trình.

| Endpoint | Ai | Làm gì | Mã trả về |
|---|---|---|---|
| `POST /workflow/ho-so` body `{"thu_tuc_id", "ho_ten_nguoi_nop", "so_dien_thoai"?}` | công dân | nộp và khởi tạo ngay, **chỉ dùng được cho thủ tục không có thành phần bắt buộc** (hồ sơ mới chưa có tệp). Kiểm thủ tục có gói (`thu_tuc.quy_trinh`) và schema với `{"thanh_phan": {}}` → lưu hồ sơ qua PostgREST bằng token của công dân (RLS, CSDL tự đặt người nộp, trạng thái `moi`, hạn xử lý; cột khác client gửi bị bỏ) → khởi tạo quy trình với `businessKey` = mã hồ sơ. Trả `{"hoSo", "processInstanceId", "quyTrinh", "buocDangMo"}` | 201; 400 body sai; 403 không phải công dân; 404 thủ tục không thấy; 422 thủ tục chưa có quy trình hoặc cần giấy tờ (không lưu hồ sơ, `chiTiet.thanhPhan` liệt kê thành phần thiếu; dùng luồng nộp ở trên); 502 Flowable lỗi (hồ sơ đã lưu, trả kèm `chiTiet.hoSo` để gọi lại `khoi-tao`) |
| `POST /workflow/ho-so/{id}/khoi-tao` | công dân (người nộp) | bước cuối của luồng nộp: kiểm thành phần theo JSON Schema (Poka-yoke) rồi khởi tạo quy trình, `businessKey` = mã hồ sơ | 201; 404 không thấy hồ sơ (kể cả hồ sơ người khác); 409 đã có quy trình hoặc hồ sơ không còn `moi` (kiểm trước Poka-yoke); 422 thiếu/sai thành phần (`chiTiet.thanhPhan`) hoặc thủ tục chưa có quy trình |
| `GET /workflow/ho-so/{id}/tien-do` | ai xem được hồ sơ theo RLS | các quy trình của hồ sơ: `batDau`, `ketThuc`, `diemKetThuc` (`ket_thuc_hoan_tat`/`ket_thuc_tu_choi`), `buocDangMo`, `lichSu` các bước | 200; 404 |
| `GET /workflow/tasks` | mọi vai trò | task của người gọi: giao đích danh cho mình (`bo_sung` của công dân, task mình đã nhận) + task chưa ai nhận của nhóm mình (cán bộ: các lĩnh vực đang phụ trách; lãnh đạo: `lanh_dao`). Mỗi task: `id`, `buoc`, `ten`, `nguoiNhan`, `taoLuc`, `processInstanceId`, `hoSoId`, `maHoSo`, `hanXuLyLuc`, `quaHan` | 200 |
| `POST /workflow/tasks/{id}/complete` body `{"bien": {…}}` | người được giao hoặc thuộc nhóm ứng viên | nhận task cho mình (nếu chưa ai nhận) rồi hoàn thành; trả `buocDangMo` sau đó | 200; 400 biến sai/thiếu; 403 không có quyền; 404 không thấy task; 409 người khác vừa nhận |

Biến được phép khi hoàn thành: đúng các `flowable:formProperty` của bước đó trong BPMN của gói (danh mục `thu_tuc.bien_theo_buoc`); biến khác, sai kiểu hay thiếu biến `required="true"` bị từ chối 400. Ví dụ gói khai sinh (`thu-tuc/khai-sinh/`; gói chứng thực: [`thu-tuc/chung-thuc-ban-sao/README.md`](../thu-tuc/chung-thuc-ban-sao/README.md)):

| Bước | Ai | Biến bắt buộc | Biến tùy chọn |
|---|---|---|---|
| `tiep_nhan` | cán bộ lĩnh vực `ho_tich` | `hopLe` (bool: đủ thành phần?) | `ghiChu` (chuỗi) |
| `bo_sung` | công dân nộp hồ sơ | – | `ghiChu` |
| `tham_dinh` | cán bộ lĩnh vực `ho_tich` | `datYeuCau` (bool) | `ghiChu` |
| `phe_duyet` | lãnh đạo | `pheDuyet` (bool) | `ghiChu` |

Thêm thủ tục có quy trình: thêm một gói `thu-tuc/<ma>/` ([`docs/thu-tuc.md`](../docs/thu-tuc.md)), không sửa tệp nào ở đây. Chưa làm: đồng bộ `ho_so.trang_thai` theo bước quy trình.

```bash
# Công dân (token lấy như docs/architecture.md §8) nộp hồ sơ khai sinh: tạo hồ sơ → tải tệp → khởi tạo
TT=$(curl -s 'http://localhost:9080/public/thu_tuc?ma=eq.KS01&select=id' | jq -r '.[0].id')
HS=$(curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d "{\"thu_tuc_id\":\"$TT\",\"ho_ten_nguoi_nop\":\"Nguyễn Văn Mẫu\"}" http://localhost:9080/api/ho_so | jq -r '.[0].id')
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:9080/workflow/ho-so/$HS/khoi-tao   # chưa có tệp → 422
for YC in $(curl -s "http://localhost:9080/public/thanh_phan_yeu_cau?thu_tuc_id=eq.$TT&bat_buoc=is.true&select=id" | jq -r '.[].id'); do
  curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' --data-binary @giay-to-gia.pdf \
    "http://localhost:9080/files/ho-so/$HS/tep?ten=giay-to.pdf&thanh_phan_yeu_cau_id=$YC"
done
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:9080/workflow/ho-so/$HS/khoi-tao   # đủ → 201
# Cán bộ hộ tịch: xem task, tiếp nhận (đủ thành phần)
curl -s -H "Authorization: Bearer $TOKEN_CAN_BO" http://localhost:9080/workflow/tasks
curl -s -X POST -H "Authorization: Bearer $TOKEN_CAN_BO" -H 'Content-Type: application/json' \
  -d '{"bien":{"hopLe":true}}' http://localhost:9080/workflow/tasks/<id>/complete
```

### `/files` – tệp hồ sơ

Thiết kế, luồng quét và nơi giữ khóa: `docs/architecture.md` §4.3. Chỉ nhận **PDF, JPG, PNG**, tối đa 10 MiB một tệp (`DXOS_FILE_MAX_BYTES`). Đuôi tệp, `Content-Type` của request và **nội dung thật (magic bytes)** phải cùng một loại. Mọi tệp được **ClamAV quét trước khi lưu**: tệp nhiễm bị từ chối, không lưu gì, ghi `nhat_ky_tep`. Client không bao giờ cầm khóa S3: xem tệp bằng link đã ký ngắn hạn.

| Endpoint | Ai | Làm gì | Mã trả về |
|---|---|---|---|
| `POST /files/ho-so/{id}/tep?ten=<tên tệp>[&thanh_phan_yeu_cau_id=<uuid>]`, header `Content-Type: application/pdf` \| `image/jpeg` \| `image/png`, body = nội dung tệp | công dân, hồ sơ của mình đang `moi` hoặc `cho_bo_sung` | quét → lưu Garage `mot-cua-ho-so/ho-so/{id}/<uuid>.<đuôi>` → ghi `thanh_phan_ho_so`. Trả dòng metadata (`id`, `ten_tep`, `loai_mime`, `kich_thuoc`, `sha256`, `object_key`, `nguoi_tai_sub`, `ket_qua_quet`, `quet_luc`…) | 201; 400 tên tệp lạ, tệp rỗng, thành phần không thuộc thủ tục; 401; 403 không phải công dân; 404 hồ sơ không thấy (kể cả của người khác); 409 hồ sơ không nhận thêm tệp; 411 thiếu `Content-Length`; 413 quá cỡ; 415 sai loại/giả mạo; 422 có mã độc (`chiTiet.maDoc`); 503 ClamAV chưa sẵn sàng |
| `GET /files/ho-so/{id}/tep` | ai xem được hồ sơ theo RLS | danh sách metadata tệp của hồ sơ | 200; 403 hồ sơ có nhưng không có quyền; 404 |
| `GET /files/tep/{id}[?ttl=<giây>]` | công dân (hồ sơ của mình), cán bộ (lĩnh vực đang phụ trách), lãnh đạo | metadata + `link` (GET đã ký, `ttl` 1–300 giây, mặc định 300) + `hetHanLuc`; ghi nhật ký `cap_link` | 200; 400 `ttl` sai; 403 tệp có nhưng không có quyền (vd. cán bộ sai lĩnh vực); 404 tệp không có hoặc giấy tờ chưa có tệp |
| `GET <link>` (`/files/s3/…`) | ai cầm link | nội dung tệp, `Content-Type` đúng loại, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` | 200; 403 link bị sửa; 400 `Date is too old` khi link hết hạn |

```bash
# Công dân tải tờ khai vào hồ sơ <HS> rồi lấy link xem 60 giây
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' \
  --data-binary @to-khai.pdf "http://localhost:9080/files/ho-so/<HS>/tep?ten=to-khai.pdf"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:9080/files/tep/<ID>?ttl=60" | jq -r .link
```

## Gói thủ tục (D-009)

Bộ nạp `backend/nap_thu_tuc.py` chạy ở mỗi `make up` (dịch vụ một lần `nap-thu-tuc`, `mot-cua-api` chờ nó xong) và bằng tay `make nap-thu-tuc`:

1. Quét `thu-tuc/*/`, kiểm từng gói bằng `goi_thu_tuc.kiem_goi()` (đủ 5 tệp, `thu-tuc.yaml` tập con YAML, JSON Schema 2020-12, BPMN theo `kiem_bpmn.py`, dữ liệu mẫu khớp schema).
2. Deploy `quy-trinh.bpmn20.xml` lên Flowable qua REST (tên deployment `thu-tuc/<goi>@<sha12>`, BPMN không đổi thì bỏ qua).
3. Gọi RPC `mot_cua.nap_thu_tuc` qua PostgREST bằng token client `mot_cua_danh_muc` (role `dich_vu_danh_muc`): upsert thủ tục, lĩnh vực, thành phần yêu cầu.
4. Gọi `mot_cua.rut_goi_vang` với danh sách thư mục còn lại: gói đã xóa thư mục thì thủ tục thôi có quy trình.

Gói lỗi: in lý do, bỏ qua, mã thoát 0. Kiểm gói không cần Docker: `python3 mot-cua/backend/nap_thu_tuc.py thu-tuc --chi-kiem` (`make check` chạy lệnh này). Xem kết quả nạp: `docker compose logs nap-thu-tuc`.

```bash
curl -s 'http://localhost:9080/public/thu_tuc?goi=not.is.null&select=ma,ten,goi,quy_trinh,so_ngay_xu_ly'
curl -s 'http://localhost:9080/public/rpc/json_schema_thu_tuc?ma=CT01' | jq .properties.thanh_phan.required
```

## Sự kiện hồ sơ (RabbitMQ, #9)

Thiết kế, lý do và sơ đồ: [`docs/architecture.md` §4.5](../docs/architecture.md#45-sự-kiện-hồ-sơ-qua-rabbitmq-9). Tóm tắt: `mot-cua-api` ghi sự kiện vào hộp thư đi `mot_cua.hop_thu_su_kien` ngay sau khi gọi Flowable thành công; `mot-cua-worker` phát lên exchange `mot_cua.su_kien` (topic, vhost `mot-cua`, routing key = loại sự kiện) qua STOMP, chờ RabbitMQ xác nhận rồi mới đánh dấu đã phát; consumer mẫu nhận từ queue `mot_cua.nhat_ky` và ghi `mot_cua.nhat_ky_su_kien` (lãnh đạo xem được qua `/api/nhat_ky_su_kien`).

### Danh mục

| Loại (routing key) | Khi nào | Ai phát | `duLieu` |
|---|---|---|---|
| `ho_so.moi` | khởi tạo quy trình thành công (`POST /workflow/ho-so`, `/ho-so/{id}/khoi-tao`) | mot-cua-api | `processInstanceId`, `quyTrinh`, `hanXuLy` (ngày), `buocDangMo` (mã bước) |
| `ho_so.chuyen_buoc` | hoàn thành một task (`POST /workflow/tasks/{id}/complete`) | mot-cua-api | `processInstanceId`, `tuBuoc`, `denBuoc` (mã bước đang mở sau đó, rỗng nếu kết thúc), `vaiTroXuLy` |
| `ho_so.hoan_tat` | quy trình kết thúc ở *Hoàn tất* (biến `ketQua = hoan_tat`) | mot-cua-api, ngay sau `chuyen_buoc` cuối | `processInstanceId`, `ketQua`, `diemKetThuc` |
| `ho_so.tu_choi` | quy trình kết thúc ở *Từ chối* (`ketQua = tu_choi`) | mot-cua-api | như trên |
| `ho_so.sap_tre_han` | hồ sơ chưa xong (còn quy trình đang chạy), chưa quá 17:00 ngày hạn, còn ≤ `DXOS_SU_KIEN_SAP_TRE_NGAY` (1) ngày làm việc; **mỗi (hồ sơ, hạn xử lý) một lần** | mot-cua-worker, quét mỗi `DXOS_SU_KIEN_QUET_GIAY` (300) giây | `processInstanceId`, `hanXuLy`, `hanXuLyLuc`, `conLaiNgayLamViec` (0 = hạn hôm nay), `buocDangMo` |

### Định dạng (phiên bản 1)

Một object JSON, `content-type: application/json`; header AMQP `message-id` = `id`, `type` = `loai`, `app-id` = `mot-cua`. Phát **ít nhất một lần**: consumer phải chống trùng theo `id`. Thêm trường không đổi `phienBan`; bỏ hay đổi nghĩa trường thì tăng `phienBan`.

```json
{
  "phienBan": 1,
  "id": "3f2c9a4e-8d1b-4c7a-9e55-0b6d2f1a7c33",
  "loai": "ho_so.sap_tre_han",
  "luc": "2026-10-22T09:00:00+07:00",
  "nguon": "mot-cua",
  "hoSoId": "5b8d0e6a-1f3c-4a2b-9c7d-2e4f6a8b0c1d",
  "maHoSo": "HS20261021-000123",
  "linhVuc": "ho_tich",
  "thuTuc": "KS01",
  "duLieu": {
    "processInstanceId": "8c1e…",
    "hanXuLy": "2026-10-23",
    "hanXuLyLuc": "2026-10-23T17:00:00+07:00",
    "conLaiNgayLamViec": 1,
    "buocDangMo": ["tham_dinh"]
  }
}
```

**Không có dữ liệu cá nhân của công dân**: không họ tên, số điện thoại hay `sub` người nộp, chỉ id nội bộ và mã hồ sơ. Role `dich_vu_su_kien` không được đọc các cột đó (quyền cột), `su_kien.kiem()` từ chối sự kiện có các khóa này. Consumer cần liên hệ công dân (thông báo, tuần 3) tra bằng `hoSoId` qua API, theo quyền của mình.

### Tệp

| Tệp | Nội dung |
|---|---|
| `db/migrations/004_su_kien.sql` | role `dich_vu_su_kien`, bảng `hop_thu_su_kien` (outbox: `khoa_chong_trung` UNIQUE, nội dung phải khớp id/loại/hồ sơ của dòng, đã phát thì không bỏ phát được), `nhat_ky_su_kien` (chỉ thêm, khóa = id sự kiện) |
| `rabbitmq/definitions.json` | exchange `mot_cua.su_kien` (topic) → queue `mot_cua.nhat_ky` (quorum, binding `ho_so.#`, dead-letter sang `mot_cua.su_kien.loi` → queue `mot_cua.nhat_ky.loi` khi NACK hoặc quá 5 lần giao) |
| `keycloak/realm.json` | client dịch vụ `mot_cua_su_kien` (role `dich_vu_su_kien`) |
| `backend/su_kien.py` | định dạng, kiểm tra, ngày làm việc, quy tắc sắp trễ hạn (hàm thuần) |
| `backend/hop_thu.py` | ghi/đọc hộp thư và nhật ký qua PostgREST bằng token dịch vụ |
| `backend/stomp.py` | client STOMP 1.2 tối thiểu (thư viện chuẩn) |
| `backend/worker.py` | dịch vụ `mot-cua-worker`: phát, quét sắp trễ hạn, consumer mẫu. Quét tay một lần: `docker compose exec mot-cua-worker python /tang2/backend/worker.py quet-mot-lan` |
| `tests/smoke-su-kien.sh` | `make smoke`: luồng thật qua `/workflow`, sắp trễ hạn đúng một lần, tin hỏng → queue lỗi, RabbitMQ dừng rồi lên lại |

## Người dùng mẫu

| Người dùng | `sub` | Vai trò | Ghi chú |
|---|---|---|---|
| `congdan01` | `…0000c001` | `cong_dan` | Nguyễn Văn Mẫu, 3 hồ sơ mẫu |
| `congdan02` | `…0000c002` | `cong_dan` | Lê Thị Thử, 3 hồ sơ mẫu |
| `canbo01` | `…0000b001` | `can_bo` | hộ tịch; bắt cài OTP |
| `canbo02` | `…0000b002` | `can_bo` | chứng thực; bắt cài OTP |
| `canbo03` | `…0000b003` | `can_bo` | đất đai; bắt cài OTP |
| `lanhdao01` | `…0000d001` | `lanh_dao` | bắt cài OTP |

Realm không chứa mật khẩu: đặt bằng `make demo-users` (chạy sau `make smoke`; xem `docs/cai-dat.md` mục 3 và `docs/architecture.md` §8). `sub` cố định chỉ áp dụng khi realm được nạp lần đầu; volume Keycloak cũ giữ `sub` cũ.

## Chạy test

```bash
make test-backend               # test đơn vị API tệp, sự kiện (không cần Docker; make check cũng chạy)
make test-sql                   # migration + rls.sql trên PostgreSQL trống, trước và sau seed (container tạm; CI job test-sql)
make smoke                      # toàn bộ: nền tảng + bộ máy + gói thủ tục + quy trình Flowable + /workflow + /files + sự kiện
docker compose exec -T postgres psql -XqtA -U postgres -d commune < mot-cua/db/tests/rls.sql   # chỉ RLS
```

Bí mật của bộ máy (khóa S3, secret client `mot_cua_tep`, `mot_cua_su_kien`, `mot_cua_danh_muc`, thông tin kết nối RabbitMQ, mật khẩu `rest-admin` của Flowable) đọc từ OpenBao của lõi bằng AppRole `tang2` (`backend/bimat.py`, chỉ giữ trong bộ nhớ), xem `docs/architecture.md` §4.4.

Sắp tới: nộp hồ sơ và tra cứu trên cổng công dân (#53, #54), cổng cán bộ (#55), thông báo sắp trễ hạn cho cán bộ (#56).
