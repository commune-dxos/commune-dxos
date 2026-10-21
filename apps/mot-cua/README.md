# apps/mot-cua – Ứng dụng Một cửa cấp xã (Tầng 2)

Ứng dụng chính của Commune DX-OS: tiếp nhận và xử lý thủ tục hành chính. Cắm vào lõi `core/` bằng `DXOS_APP=mot-cua` trong `.env`; không sửa tệp nào của lõi.

| Tệp | Lõi dùng để |
|---|---|
| `app.env` | cấu hình PostgREST: phơi schema `mot_cua` |
| `db/migrations/001_schema_mot_cua.sql` | role `cong_dan`/`can_bo`/`lanh_dao` + `GRANT … TO authenticator`, schema `mot_cua` (bảng giữ chỗ tuần 1, bị 002 thay) |
| `db/migrations/002_schema_day_du.sql` | schema đầy đủ (#5): bảng, trigger, quyền theo cột, RLS mọi bảng |
| `db/migrations/003_tep_ho_so.sql` | tệp hồ sơ (#7): role `dich_vu_tep`, cột người tải/kết quả quét, ràng buộc khóa object theo hồ sơ, bảng `nhat_ky_tep` chỉ thêm; công dân thôi `INSERT` metadata trực tiếp |
| `db/migrations/004_su_kien.sql` | sự kiện (#9): role `dich_vu_su_kien`, hộp thư đi `hop_thu_su_kien` (outbox), `nhat_ky_su_kien` chỉ thêm; xem [Sự kiện hồ sơ](#sự-kiện-hồ-sơ-rabbitmq-9) |
| `db/seed/002_du_lieu_mau.sql` | **dữ liệu giả**: 3 lĩnh vực, 6 thủ tục kèm thành phần hồ sơ, 3 cán bộ, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; chỉ nạp khi `DXOS_SEED=true` |
| `db/tests/rls.sql` | test quyền/RLS (110 kiểm tra), chạy trong một transaction rồi ROLLBACK |
| `keycloak/realm.json` | client role của `dxos_api` (kể cả `dich_vu_tep`), nhóm `/cong-dan`, `/can-bo`, `/lanh-dao`, client `mot_cua_web` (PKCE), client dịch vụ `mot_cua_tep`, `mot_cua_su_kien` (Client Credentials, secret do Keycloak sinh), 6 người dùng mẫu có `id` (= `sub`) cố định; cán bộ và lãnh đạo bắt buộc cài OTP |
| `processes/dang_ky_khai_sinh.bpmn20.xml` | quy trình đăng ký khai sinh (#8), Flowable tự triển khai khi khởi động; sơ đồ và biến: [`processes/README.md`](processes/README.md) |
| `s3/buckets.conf` | bucket Garage `mot-cua-ho-so`; lõi tạo bucket và khóa S3 riêng của ứng dụng chỉ có quyền trên bucket này |
| `backend/main.py` | API quy trình `/workflow/*` (#6) và API tệp `/files/*` (#7): dịch vụ `app-backend`, chỉ thư viện chuẩn Python; xem [API cho Tầng 2](#api-cho-tầng-2) |
| `rabbitmq/definitions.json` | exchange, queue, binding của sự kiện hồ sơ (#9); lõi tạo vhost `mot-cua`, user riêng rồi nạp tệp này |
| `backend/worker.py`, `su_kien.py`, `hop_thu.py`, `stomp.py` | sự kiện (#9): dịch vụ `app-worker` phát hộp thư đi lên RabbitMQ, quét sắp trễ hạn, consumer mẫu |
| `backend/tep.py`, `backend/tests/` | phần thuần của API tệp (kiểm tên/loại/magic bytes, ký S3 SigV4, giao thức `clamd`, quy tắc quyền) và test đơn vị: `make test` |
| `tests/smoke.sh`, `tests/smoke-tep.sh`, `tests/smoke-su-kien.sh` | `make smoke`: route công khai, `rls.sql`, MFA, gọi API qua APISIX bằng token thật của từng vai trò (cán bộ, lãnh đạo dùng mật khẩu + TOTP), luồng khai sinh đầy đủ qua `/workflow`, tải/xem tệp, EICAR, link ký sẵn, sự kiện RabbitMQ. Cần thêm `python3` trên máy để sinh mã TOTP |

Sửa schema: thêm tệp `db/migrations/005_<mo-ta>.sql`, **không sửa** tệp đã áp dụng (`app-migrate` sẽ dừng vì SHA-256 khác). Áp dụng: `make migrate`.

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

| Endpoint | Ai | Làm gì | Mã trả về |
|---|---|---|---|
| `POST /workflow/ho-so` body `{"thu_tuc_id", "ho_ten_nguoi_nop", "so_dien_thoai"?}` | công dân | kiểm thủ tục có quy trình → lưu hồ sơ qua PostgREST bằng token của công dân (RLS, CSDL tự đặt người nộp, trạng thái `moi`, hạn xử lý; cột khác client gửi bị bỏ) → khởi tạo quy trình với `businessKey` = mã hồ sơ. Trả `{"hoSo", "processInstanceId", "quyTrinh", "buocDangMo"}` | 201; 400 body sai; 403 không phải công dân; 404 thủ tục không thấy; 422 thủ tục chưa có quy trình (không lưu hồ sơ); 502 Flowable lỗi (hồ sơ đã lưu, trả kèm `chiTiet.hoSo` để gọi lại `khoi-tao`) |
| `POST /workflow/ho-so/{id}/khoi-tao` | công dân (người nộp) | khởi tạo quy trình cho hồ sơ đã nộp (ví dụ nộp qua `/api/ho_so`) | 201; 404 không thấy hồ sơ (kể cả hồ sơ người khác); 409 đã có quy trình hoặc hồ sơ không còn `moi`; 422 |
| `GET /workflow/ho-so/{id}/tien-do` | ai xem được hồ sơ theo RLS | các quy trình của hồ sơ: `batDau`, `ketThuc`, `diemKetThuc` (`ket_thuc_hoan_tat`/`ket_thuc_tu_choi`), `buocDangMo`, `lichSu` các bước | 200; 404 |
| `GET /workflow/tasks` | mọi vai trò | task của người gọi: giao đích danh cho mình (`bo_sung` của công dân, task mình đã nhận) + task chưa ai nhận của nhóm mình (cán bộ: các lĩnh vực đang phụ trách; lãnh đạo: `lanh_dao`). Mỗi task: `id`, `buoc`, `ten`, `nguoiNhan`, `taoLuc`, `processInstanceId`, `hoSoId`, `maHoSo`, `hanXuLyLuc`, `quaHan` | 200 |
| `POST /workflow/tasks/{id}/complete` body `{"bien": {…}}` | người được giao hoặc thuộc nhóm ứng viên | nhận task cho mình (nếu chưa ai nhận) rồi hoàn thành; trả `buocDangMo` sau đó | 200; 400 biến sai/thiếu; 403 không có quyền; 404 không thấy task; 409 người khác vừa nhận |

Biến được phép khi hoàn thành (khớp `processes/dang_ky_khai_sinh.bpmn20.xml`; biến khác bị từ chối 400):

| Bước | Ai | Biến bắt buộc | Biến tùy chọn |
|---|---|---|---|
| `tiep_nhan` | cán bộ lĩnh vực `ho_tich` | `hopLe` (bool: đủ thành phần?) | `ghiChu` (chuỗi) |
| `bo_sung` | công dân nộp hồ sơ | – | `ghiChu` |
| `tham_dinh` | cán bộ lĩnh vực `ho_tich` | `datYeuCau` (bool) | `ghiChu` |
| `phe_duyet` | lãnh đạo | `pheDuyet` (bool) | `ghiChu` |

Thêm thủ tục có quy trình: thêm tệp BPMN vào `processes/`, rồi thêm mã thủ tục → khóa quy trình vào `QUY_TRINH_THEO_THU_TUC` và biến của các bước mới vào `BIEN_THEO_BUOC` trong `backend/main.py`. Chưa làm: đồng bộ `ho_so.trang_thai` theo bước quy trình (#9).

```bash
# Công dân (token lấy như docs/architecture.md §8) nộp hồ sơ khai sinh và khởi tạo quy trình
TT=$(curl -s 'http://localhost:9080/public/thu_tuc?ma=eq.KS01&select=id' | jq -r '.[0].id')
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"thu_tuc_id\":\"$TT\",\"ho_ten_nguoi_nop\":\"Nguyễn Văn Mẫu\"}" http://localhost:9080/workflow/ho-so
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

## Sự kiện hồ sơ (RabbitMQ, #9)

Thiết kế, lý do và sơ đồ: [`docs/architecture.md` §4.5](../../docs/architecture.md#45-sự-kiện-hồ-sơ-qua-rabbitmq-9). Tóm tắt: `app-backend` ghi sự kiện vào hộp thư đi `mot_cua.hop_thu_su_kien` ngay sau khi gọi Flowable thành công; `app-worker` phát lên exchange `mot_cua.su_kien` (topic, vhost `mot-cua`, routing key = loại sự kiện) qua STOMP, chờ RabbitMQ xác nhận rồi mới đánh dấu đã phát; consumer mẫu nhận từ queue `mot_cua.nhat_ky` và ghi `mot_cua.nhat_ky_su_kien` (lãnh đạo xem được qua `/api/nhat_ky_su_kien`).

### Danh mục

| Loại (routing key) | Khi nào | Ai phát | `duLieu` |
|---|---|---|---|
| `ho_so.moi` | khởi tạo quy trình thành công (`POST /workflow/ho-so`, `/ho-so/{id}/khoi-tao`) | app-backend | `processInstanceId`, `quyTrinh`, `hanXuLy` (ngày), `buocDangMo` (mã bước) |
| `ho_so.chuyen_buoc` | hoàn thành một task (`POST /workflow/tasks/{id}/complete`) | app-backend | `processInstanceId`, `tuBuoc`, `denBuoc` (mã bước đang mở sau đó, rỗng nếu kết thúc), `vaiTroXuLy` |
| `ho_so.hoan_tat` | quy trình kết thúc ở *Hoàn tất* (biến `ketQua = hoan_tat`) | app-backend, ngay sau `chuyen_buoc` cuối | `processInstanceId`, `ketQua`, `diemKetThuc` |
| `ho_so.tu_choi` | quy trình kết thúc ở *Từ chối* (`ketQua = tu_choi`) | app-backend | như trên |
| `ho_so.sap_tre_han` | hồ sơ chưa xong (còn quy trình đang chạy), chưa quá 17:00 ngày hạn, còn ≤ `DXOS_SU_KIEN_SAP_TRE_NGAY` (1) ngày làm việc; **mỗi (hồ sơ, hạn xử lý) một lần** | app-worker, quét mỗi `DXOS_SU_KIEN_QUET_GIAY` (300) giây | `processInstanceId`, `hanXuLy`, `hanXuLyLuc`, `conLaiNgayLamViec` (0 = hạn hôm nay), `buocDangMo` |

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
| `backend/worker.py` | dịch vụ `app-worker`: phát, quét sắp trễ hạn, consumer mẫu. Quét tay một lần: `docker compose exec app-worker python /app/backend/worker.py quet-mot-lan` |
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

Realm không chứa mật khẩu: đặt bằng `make demo-users` (chạy sau `make smoke`; xem README gốc mục 4 và `docs/architecture.md` §8). `sub` cố định chỉ áp dụng khi realm được nạp lần đầu; volume Keycloak cũ giữ `sub` cũ.

## Chạy test

```bash
make test-backend               # test đơn vị API tệp, sự kiện (không cần Docker; make check cũng chạy)
make test-sql                   # migration + rls.sql trên PostgreSQL trống, trước và sau seed (container tạm; CI job test-sql)
make smoke                      # toàn bộ: lõi + ứng dụng + quy trình Flowable + /workflow + /files + sự kiện
docker compose exec -T postgres psql -XqtA -U postgres -d commune < apps/mot-cua/db/tests/rls.sql   # chỉ RLS
```

Bí mật của ứng dụng (khóa S3, secret client `mot_cua_tep`, `mot_cua_su_kien`, thông tin kết nối RabbitMQ, mật khẩu `rest-admin` của Flowable) đọc từ OpenBao của lõi bằng AppRole `app` (`backend/bimat.py`, chỉ giữ trong bộ nhớ), xem `docs/architecture.md` §4.4.

Sắp tới: cổng công dân và cổng cán bộ (React, tuần 3), thông báo theo sự kiện `ho_so.*` (tuần 3).
