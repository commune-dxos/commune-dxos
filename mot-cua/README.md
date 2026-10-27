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
| `db/migrations/006_trang_thai_theo_quy_trinh.sql` | trạng thái hồ sơ theo bước Flowable (#73): thêm `cho_phe_duyet`, cột `thu_tuc.trang_thai_buoc`, bảng `lich_su_trang_thai` chỉ thêm, RPC `dong_bo_trang_thai` (trạng thái + lịch sử + hộp thư đi một transaction); xem [Trạng thái hồ sơ](#trạng-thái-hồ-sơ) |
| `db/migrations/007_nhat_ky_kiem_toan.sql` | nhật ký kiểm toán append-only chuỗi băm SHA-256 (#75): bảng `nhat_ky_kiem_toan` + đầu chuỗi `dau_chuoi_kiem_toan`, trigger ghi kiểm toán cho hồ sơ, tệp, thủ tục, phân công; `dong_bo_trang_thai` ghi thêm bước quy trình; RPC `xac_minh_kiem_toan`; GRANT cho role pgAudit `dxos_kiem_toan`; xem [Nhật ký kiểm toán](#nhật-ký-kiểm-toán-75) |
| `db/migrations/008_giay_to_ky_so.sql` | giấy tờ có ký số (#77): bảng `giay_to_ky` (biên nhận, kết quả; chỉ `dich_vu_tep` ghi, không sửa), trigger kiểm toán `giay_to.ky` kèm SHA-256; xem [Giấy tờ có ký số](#giấy-tờ-có-ký-số-77) |
| `db/migrations/009_kho_du_lieu.sql` | kho dữ liệu (#80): role `dich_vu_bao_cao` (chỉ cột không cá nhân của hồ sơ đã đóng), schema `bao_cao` (bảng mart cho Superset), RPC `nap_bao_cao`; xem [Kho dữ liệu lịch sử](#kho-dữ-liệu-lịch-sử-80) |
| `db/migrations/010_doc_bao_cao.sql` | quyền đọc báo cáo (#82): role `bao_cao_doc` (lõi tạo đăng nhập) chỉ đọc schema `bao_cao`, không đọc `mot_cua` |
| `db/migrations/012_tra_cuu_ho_so.sql` | tra cứu tiến độ không đăng nhập (#54): RPC `tra_cuu_ho_so(p_ma, p_so_cuoi)` cho `anon`, `cong_dan`, chỉ trả trạng thái và các mốc; xem [Tra cứu tiến độ](#tra-cứu-tiến-độ-hồ-sơ-54) |
| `db/migrations/011_so_van_ban.sql` | sổ văn bản đến/đi (#78): role `van_thu`, bảng `van_ban` (bất biến sau khi vào sổ hoặc ký), bộ đếm `so_van_ban_dem` cấp số theo năm không trùng, RPC `cap_so_van_ban_di`, trigger kiểm toán `van_ban.*`; xem [Sổ văn bản](#sổ-văn-bản-đếnđi-78) |
| `db/migrations/014_tro_ly.sql` | trợ lý thủ tục (#91): `CREATE EXTENSION vector` (pgvector của nền tảng), role `dich_vu_tro_ly`, bảng `tri_thuc_doan` (đoạn kho tri thức + `vector(1024)`), RPC `tim_doan_gan` (cosin, chỉ vector cùng mô hình nhúng); xem [Trợ lý thủ tục](#trợ-lý-thủ-tục-hành-chính-91) |
| `db/migrations/015_doc_giay_to.sql` | đọc giấy tờ bằng OCR + cán bộ xác nhận (#93): bảng `doc_giay_to` (máy đọc, công dân khai, cán bộ xác nhận; xác nhận rồi không sửa), CSDL tính trường bị sửa, kiểm toán `giay_to.khai|doc|xac_nhan`; xem [Đọc giấy tờ](#đọc-giấy-tờ-bằng-ocr-cán-bộ-xác-nhận-93) |
| `db/migrations/016_wiki_van_ban.sql` | wiki văn bản nội bộ cho cán bộ (#95): bảng `wiki_van_ban` (RLS theo phạm vi toàn xã / lĩnh vực phụ trách / lãnh đạo; văn thư, lãnh đạo ghi; không xóa), `wiki_van_ban_lich_su` (phiên bản cũ, chỉ trigger ghi), RPC `tim_wiki` (tìm dự phòng không dấu, RLS của người gọi), kiểm toán `wiki.*`; xem [Wiki văn bản](#wiki-văn-bản-nội-bộ-cho-cán-bộ-95) |
| `db/seed/002_du_lieu_mau.sql` | **dữ liệu giả**: 3 lĩnh vực, 6 thủ tục kèm thành phần hồ sơ, 3 cán bộ, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; chỉ nạp khi `DXOS_SEED=true`. Thủ tục có gói (KS01, CT01) được bộ nạp ghi đè theo gói; 4 thủ tục còn lại chưa có gói nên chưa nộp qua `/workflow` được |
| `db/seed/003_wiki_mau.sql` | **văn bản wiki mẫu** do đội tự viết (quy chế, quy trình, hướng dẫn hộ tịch/chứng thực, biểu mẫu, ghi chú họp lãnh đạo; số ký hiệu giả); chỉ nạp khi `DXOS_SEED=true` |
| `db/tests/rls.sql`, `db/tests/goi_thu_tuc.sql`, `db/tests/trang_thai.sql`, `db/tests/kiem_toan.sql`, `db/tests/giay_to_ky.sql`, `db/tests/van_ban.sql`, `db/tests/tra_cuu.sql`, `db/tests/tro_ly.sql`, `db/tests/doc_giay_to.sql`, `db/tests/wiki_van_ban.sql` | test quyền/RLS (110 kiểm tra), danh mục gói (23 kiểm tra), trạng thái theo quy trình (50 kiểm tra), nhật ký kiểm toán (49 kiểm tra: ghi đồng thời qua dblink, chặn sửa/xóa, giả mạo bị chỉ đúng vị trí), giấy tờ ký số (23 kiểm tra), sổ văn bản (28 kiểm tra: cấp số đồng thời qua dblink, RLS, chặn sửa sau khi vào sổ/ký), tra cứu hồ sơ (11 kiểm tra: đúng/sai mã và số, không lộ dữ liệu cá nhân, vai được gọi), kho tri thức trợ lý (17 kiểm tra: pgvector, chỉ tài khoản dịch vụ, cosin cùng mô hình, ràng buộc vector), đọc giấy tờ (29 kiểm tra: chỉ dịch vụ tệp ghi, RLS theo hồ sơ, upsert như mot-cua-api, xác nhận rồi không sửa, kiểm toán không chứa giá trị), wiki văn bản (43 kiểm tra: ai ghi, ai thấy theo phạm vi, phiên bản + lịch sử, không xóa, tìm dự phòng không dấu theo RLS, kiểm toán không chứa nội dung), chạy trong một transaction rồi ROLLBACK |
| `keycloak/realm.json` | client role của `dxos_api` (kể cả role dịch vụ), nhóm `/cong-dan`, `/can-bo`, `/lanh-dao`, `/van-thu` (#78), client `mot_cua_web` (PKCE), client `bao_cao_superset` (PKCE, Superset #82), client dịch vụ `mot_cua_tep`, `mot_cua_su_kien`, `mot_cua_danh_muc`, `mot_cua_bao_cao` (#80), `mot_cua_tro_ly` (#91) (Client Credentials, secret do Keycloak sinh), 7 người dùng mẫu có `id` (= `sub`) cố định; cán bộ, lãnh đạo, văn thư bắt buộc cài OTP |
| `s3/buckets.conf` | bucket Garage `mot-cua-ho-so`; nền tảng tạo bucket và khóa S3 riêng chỉ có quyền trên bucket này |
| `backend/main.py` | API quy trình `/workflow/*` (#6) và API tệp `/files/*` (#7): dịch vụ `mot-cua-api`, chỉ thư viện chuẩn Python; quy trình và biến từng bước đọc từ danh mục gói; xem [API cho Tầng 2](#api-cho-tầng-2) |
| `backend/nap_thu_tuc.py`, `goi_thu_tuc.py`, `kiem_bpmn.py` | bộ nạp gói thủ tục (D-009): dịch vụ một lần `nap-thu-tuc`, `make nap-thu-tuc`; phần kiểm gói chạy cả trong `make check` (`--chi-kiem`); xem [Gói thủ tục](#gói-thủ-tục-d-009) |
| `rabbitmq/definitions.json` | exchange, queue, binding của sự kiện hồ sơ (#9); nền tảng tạo vhost `mot-cua`, user riêng rồi nạp tệp này |
| `backend/worker.py`, `su_kien.py`, `hop_thu.py`, `stomp.py` | sự kiện (#9): dịch vụ `mot-cua-worker` phát hộp thư đi lên RabbitMQ, quét sắp trễ hạn, đối soát trạng thái với Flowable (#73), consumer mẫu, consumer thông báo (#56) |
| `backend/trang_thai.py` | ánh xạ bước → trạng thái hồ sơ (mặc định theo người nhận, ghi đè của gói) và quy tắc tính trạng thái mới (hàm thuần, #73) |
| `kho-du-lieu/` (`chay.py`, `dbt/`, `du-lieu-mau.json`, `tests/`), `backend/kho_du_lieu.py` | kho dữ liệu lịch sử (#80): dịch vụ một lần `kho-du-lieu`, `make kho-du-lieu`; khử định danh là hàm thuần trong `backend/` |
| `bao-cao/superset_dung.py` | dashboard Superset dựng bằng mã (#82): kết nối `bao_cao`, dataset, 5 chart, dashboard "Hiệu suất một cửa", vai "Lãnh đạo xã"; superset-init của lõi chạy ở mỗi `make up-bi` |
| `backend/tep.py`, `backend/tests/` | phần thuần của API tệp (kiểm tên/loại/magic bytes, ký S3 SigV4, giao thức `clamd`, quy tắc quyền), bộ nạp gói và test đơn vị: `make test` |
| `tests/smoke.sh`, `smoke-tep.sh`, `smoke-su-kien.sh`, `smoke-goi-thu-tuc.sh`, …, `smoke-wiki-van-ban.sh` | `make smoke`: route công khai, test SQL, MFA, gọi API qua APISIX bằng token thật của từng vai trò (cán bộ, lãnh đạo dùng mật khẩu + TOTP), luồng khai sinh và chứng thực bản sao đầy đủ qua `/workflow`, cắm–rút gói tạm, tải/xem tệp, EICAR, link ký sẵn, sự kiện RabbitMQ. Cần thêm `python3` trên máy để sinh mã TOTP |
| `backend/tro_ly.py`, `rag.py`, `mo_hinh.py`, `tri_thuc.py`, `nap_tri_thuc.py`; `tro-ly/kho-tri-thuc/` | trợ lý thủ tục hành chính (#91): dịch vụ `tro-ly` (APISIX `/tro-ly/*`, công khai), dịch vụ một lần `nap-tri-thuc` (`make nap-tri-thuc`); kho tri thức Markdown, định dạng ở [README](tro-ly/kho-tri-thuc/README.md); xem [Trợ lý thủ tục](#trợ-lý-thủ-tục-hành-chính-91) |
| `backend/doc_giay_to.py`, `doc-giay-to/loai-giay-to.json` | đọc giấy tờ bằng OCR (#93): trích trường từ chữ do dịch vụ `ocr` của nền tảng đọc; loại giấy tờ và trường khai bằng JSON (khóa = mã thành phần hồ sơ của gói); endpoint trong `main.py` |
| `backend/wiki.py` | wiki văn bản (#95): kiểm dữ liệu ghi, bộ lọc Meilisearch theo vai/lĩnh vực (giống RLS), đồng bộ chỉ mục `mot-cua-wiki-van-ban` từ CSDL; endpoint `/files/wiki/*` trong `main.py` |
| `web-cong-dan/` | web Tầng 2: cổng công dân `/` (#52, đăng nhập `mot_cua_web`) và cổng cán bộ `/can-bo` (#55, đăng nhập `mot_cua_can_bo` + OTP; hộp việc, xử lý bước). React + Vite + Tailwind + shadcn/ui, PKCE; xem [README](web-cong-dan/README.md) |

Sửa schema: thêm tệp `db/migrations/007_<mo-ta>.sql`, **không sửa** tệp đã áp dụng (`tang2-migrate` sẽ dừng vì SHA-256 khác). Áp dụng: `make migrate`.

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
  ho_so |o--o{ nhat_ky_kiem_toan : "doi_tuong_id"
  ho_so ||--o{ giay_to_ky : "biên nhận, kết quả"

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
  giay_to_ky {
    uuid id PK
    uuid ho_so_id FK
    text loai "bien_nhan, ket_qua; UNIQUE theo hồ sơ"
    text object_key UK "ho-so/<id>/giay-to/…pdf"
    text sha256 UK "PDF đã ký"
    text chung_thu_so_hieu
    timestamptz ky_luc
  }
  nhat_ky_kiem_toan {
    bigint stt PK "liền từ 1"
    timestamptz luc
    text hanh_dong "ho_so.nop, quy_trinh.xu_ly_buoc…"
    text doi_tuong "ho_so, thu_tuc, can_bo"
    text doi_tuong_id "không FK: nhật ký giữ lại"
    text nguoi_sub
    jsonb du_lieu
    text bam_truoc
    text bam UK "SHA-256"
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

Vai `van_thu` (#78) chỉ có quyền trên sổ văn bản và wiki văn bản (#95), không thấy hồ sơ nào. Đổi vai trò như PostgREST làm cho mỗi request: `SET ROLE` theo `resource_access.dxos_api.roles[0]` của JWT, policy đọc `dxos.jwt_sub()` của lõi. RLS bật và `FORCE` trên mọi bảng của `mot_cua`. Không role nào ghi được danh mục, cán bộ, phân công, ngày nghỉ qua API (quản trị bằng migration/SQL); không role nào xóa được hồ sơ.

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
| `giay_to_ky` | — | của hồ sơ mình | của hồ sơ mình thấy | tất cả (chỉ `dich_vu_tep` ghi qua `/files`; không ai sửa, kể cả superuser) |
| RPC `nap_bao_cao`, schema `bao_cao` | — | — | — | — (chỉ tài khoản dịch vụ `dich_vu_bao_cao` gọi RPC; Superset đọc `bao_cao` bằng role đăng nhập `bao_cao_doc`, lãnh đạo xem qua dashboard `/bao-cao`) |
| RPC `tra_cuu_ho_so` (#54) | gọi: mã + 4 số cuối số điện thoại → trạng thái, mốc (không dữ liệu cá nhân) | gọi được như anon | — | — |
| `van_ban` (sổ văn bản đến/đi) | — | — | đọc | đọc; ký văn bản đi qua `/files` (văn thư: đọc, vào sổ đến và soạn dự thảo đi qua `/files`; chỉ `dich_vu_tep` ghi; không ai sửa sau khi vào sổ/ký, kể cả superuser; chỉ xóa được dự thảo) |
| `wiki_van_ban`, `wiki_van_ban_lich_su`, RPC `tim_wiki` (#95) | — | — | đọc văn bản toàn xã và lĩnh vực mình phụ trách | đọc tất cả; thêm, sửa mọi phạm vi qua `/files/wiki` (văn thư: đọc, thêm, sửa mọi phạm vi trừ "chỉ lãnh đạo"; không ai xóa, kể cả superuser; lịch sử chỉ trigger ghi) |
| `nhat_ky_kiem_toan`, `dau_chuoi_kiem_toan`, RPC `xac_minh_kiem_toan` | — | — | — | đọc, xác minh (chỉ trigger/RPC của bộ máy ghi; không ai sửa/xóa, kể cả superuser) |
| `lich_su_trang_thai` | — | của hồ sơ mình | của hồ sơ mình thấy | tất cả (chỉ thêm, do trigger ghi; không ai sửa, kể cả superuser) |

Cán bộ phụ trách lĩnh vực nào được tra từ `can_bo` (theo `sub`) + `can_bo_linh_vuc`, không cần claim riêng trong JWT: đổi phân công có hiệu lực ngay. Hàm tra cứu nằm ở schema `mot_cua_noi_bo` (không phơi ra API), `SECURITY DEFINER`, `search_path` rỗng.

## API cho Tầng 2

Web (cổng công dân, cổng cán bộ) chỉ gọi APISIX `http://localhost:${APISIX_PORT:-9080}`, gửi access token Keycloak realm `dxos` (client public `mot_cua_web` cho cổng công dân, `mot_cua_can_bo` cho cổng cán bộ; Authorization Code + PKCE; cán bộ, lãnh đạo nhập thêm OTP) ở header `Authorization: Bearer …`. Origin của web phải nằm trong `DXOS_CORS_ORIGINS` (`.env`). Bảng route đầy đủ và lý do thiết kế: `docs/architecture.md` §4.1, §4.2.

| Tiền tố | Dùng cho | Ví dụ |
|---|---|---|
| `/public/` (không token, 60 req/phút/IP) | danh mục công khai cho cổng công dân; tra cứu tiến độ theo mã hồ sơ (#54) | `GET /public/thu_tuc?select=id,ma,ten,thanh_phan_yeu_cau(ma,ten,bat_buoc)`, `GET /public/rpc/json_schema_thu_tuc?ma=KS01`, `GET /public/linh_vuc`, `GET /public/rpc/tra_cuu_ho_so?p_ma=HS20261024-000123&p_so_cuoi=1234` |
| `/api/` (token) | đọc/ghi bảng `mot_cua` theo cú pháp PostgREST, quyền theo bảng ở mục [Quyền theo vai trò](#quyền-theo-vai-trò) | `GET /api/ho_so?select=*,thu_tuc:thu_tuc_id(ma,ten)&order=ngay_nhan.desc`, `PATCH /api/ho_so?id=eq.<id>` (cán bộ đổi trạng thái), `PATCH /api/thanh_phan_ho_so?id=eq.<id>` (cán bộ kiểm tra giấy tờ) |
| `/workflow/` (token) | quy trình Flowable của hồ sơ, qua `backend/main.py` | bảng dưới |
| `/files/` (token, body ≤ 10 MiB) | tải lên, liệt kê, cấp link xem tệp hồ sơ, qua `backend/main.py` | [bảng dưới](#files--tệp-hồ-sơ) |
| `/files/ho-so/{id}/giay-to/…`, `/files/xac-minh` (token) | biên nhận, thông báo kết quả PDF có ký số; xác minh chữ ký một PDF | [mục dưới](#giấy-tờ-có-ký-số-77) |
| `/files/van-ban/…` (token) | sổ văn bản: văn thư vào sổ đến, soạn dự thảo đi; lãnh đạo ký ban hành | [mục dưới](#sổ-văn-bản-đếnđi-78) |
| `/files/s3/` (không token, link ký sẵn) | tải nội dung tệp bằng link mà `/files/tep/{id}` hoặc giấy tờ cấp | chỉ GET/HEAD |

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

Thêm thủ tục có quy trình: thêm một gói `thu-tuc/<ma>/` ([`docs/thu-tuc.md`](../docs/thu-tuc.md)), không sửa tệp nào ở đây.

Response của `…/khoi-tao`, `POST /workflow/ho-so` và `…/complete` có thêm `trangThai`: trạng thái hồ sơ trong CSDL sau khi đồng bộ (`null` nếu chưa ghi được, worker sẽ đối soát). Công dân hoàn thành bước `bo_sung` (nộp lại) thì hồ sơ phải đủ thành phần như lúc nộp (cùng Poka-yoke, thiếu → 422, không gọi Flowable).

### Trạng thái hồ sơ

`ho_so.trang_thai` là bản chiếu của tiến độ trong Flowable (#73): cổng công dân, cổng cán bộ, báo cáo và RLS đọc cùng một giá trị, không phải gọi Flowable. Ánh xạ bước → trạng thái khai trong gói (mặc định theo người nhận của bước, ghi đè bằng `trang_thai_theo_buoc` của `thu-tuc.yaml`, [`docs/thu-tuc.md`](../docs/thu-tuc.md#trạng-thái-hồ-sơ-theo-bước)); bộ nạp ghi vào `thu_tuc.trang_thai_buoc`.

| Trạng thái | Nghĩa | Vào khi (gói khai sinh) | Ai chuyển |
|---|---|---|---|
| `moi` | mới nộp, chờ tiếp nhận | nộp hồ sơ; khởi tạo quy trình, bước `tiep_nhan` (gói khai `tiep_nhan: moi`) | CSDL khi thêm |
| `dang_xu_ly` | cán bộ đang xử lý | `tham_dinh`; quay lại `tiep_nhan` sau khi bổ sung; lãnh đạo trả lại | quy trình; cán bộ tại quầy (hồ sơ giấy) |
| `cho_bo_sung` | chờ công dân bổ sung (công dân sửa hồ sơ, tải thêm tệp được) | `tiep_nhan` thiếu thành phần → bước `bo_sung`; `ly_do` = `ghiChu` của cán bộ | quy trình; cán bộ tại quầy |
| `cho_phe_duyet` | chờ lãnh đạo phê duyệt/ký | `phe_duyet` (nhóm `lanh_dao`) | **chỉ quy trình** (cán bộ PATCH → 400) |
| `hoan_tat` | đã trả kết quả | `endEvent` đặt `ketQua = hoan_tat`; CSDL ghi `ngay_hoan_tat` | quy trình; cán bộ tại quầy |
| `tu_choi` | không giải quyết | `endEvent` đặt `ketQua = tu_choi`; `ly_do` = `ghiChu` | quy trình; cán bộ tại quầy |

Chuyển qua `/api` (tại quầy, công dân báo đã bổ sung) vẫn theo bảng của trigger như trước, `cho_phe_duyet` không ai tự chuyển vào/ra. Quy trình (RPC dưới đây) đưa hồ sơ chưa đóng sang bất kỳ trạng thái nào trừ `moi`, vì Flowable có thể đi nhiều bước giữa hai lần đối soát. Hồ sơ đã `hoan_tat`/`tu_choi` không đổi nữa.

**Cập nhật ở đâu, theo thứ tự nào.** Flowable là nguồn đúng; CSDL ghi sau:

1. `mot-cua-api` kiểm quyền, biến, (công dân nộp lại: thành phần hồ sơ) bằng token người dùng.
2. Gọi Flowable (khởi tạo / nhận + hoàn thành task). Lỗi → trả 502, **không ghi gì vào CSDL**.
3. Đọc bước đang mở (và `ketQua` nếu quy trình vừa kết thúc), tính trạng thái mới (`backend/trang_thai.py`).
4. Gọi **một** RPC `mot_cua.dong_bo_trang_thai` bằng tài khoản dịch vụ `mot_cua_su_kien`: khóa dòng hồ sơ (`FOR UPDATE`), đổi `trang_thai` (kèm `ly_do`, giao cán bộ vừa xử lý nếu chưa giao), trigger ghi `lich_su_trang_thai`, ghi các sự kiện `ho_so.*` (mỗi sự kiện mang `duLieu.trangThai`) vào hộp thư đi — **cùng một transaction**, lỗi ở đâu cũng không ghi gì.
5. Bước 4 lỗi (PostgREST, Keycloak dừng; tiến trình chết giữa 2 và 4): request vẫn 200 vì task đã xong trong Flowable, `trangThai: null`, ghi log. `mot-cua-worker` đối soát mỗi `DXOS_SU_KIEN_QUET_GIAY` giây: hồ sơ chưa đóng có quy trình mà trạng thái lệch Flowable (bước mở hoặc `ketQua`) → gọi cùng RPC với nguồn `doi_soat`, kèm sự kiện. Bỏ qua hồ sơ vừa đổi bước trong `DXOS_DOI_SOAT_CHO_GIAY` (60) giây để không giành với API; hồ sơ giấy (không có quy trình) không bị đụng tới. Chạy tay: `docker compose exec mot-cua-worker python /mot-cua/backend/worker.py doi-soat-mot-lan`.

Gọi lại an toàn: sự kiện có khóa chống trùng `ho_so.moi:<quy trình>`, `ho_so.chuyen_buoc:<task>`, `ho_so.ket_thuc:<quy trình>` (API và worker dùng chung khóa kết thúc nên không phát hai lần), trạng thái đã đúng thì RPC không đổi, không thêm lịch sử.

`lich_su_trang_thai`: một dòng cho mỗi lần đổi (cả lúc nộp), ghi bằng trigger nên mọi đường đổi đều có: `tu_trang_thai`, `den_trang_thai`, `ly_do`, `buoc` (bước Flowable vừa xong), `nguon` (`nop`, `api`, `quy_trinh`, `doi_soat`, `he_thong` = SQL quản trị), `nguoi_sub`, `luc`. Ví dụ đọc: `GET /api/lich_su_trang_thai?ho_so_id=eq.<id>&order=id`.

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
| `ho_so.chuyen_buoc` | hoàn thành một task (`POST /workflow/tasks/{id}/complete`); hoặc đối soát sửa trạng thái lệch Flowable | mot-cua-api; mot-cua-worker (đối soát) | `processInstanceId`, `tuBuoc`, `denBuoc` (mã bước đang mở sau đó, rỗng nếu kết thúc), `vaiTroXuLy`; đối soát: `tuBuoc` = `null`, `doiSoat: true` |
| `ho_so.hoan_tat` | quy trình kết thúc ở *Hoàn tất* (biến `ketQua = hoan_tat`) | mot-cua-api, ngay sau `chuyen_buoc` cuối | `processInstanceId`, `ketQua`, `diemKetThuc` |
| `ho_so.tu_choi` | quy trình kết thúc ở *Từ chối* (`ketQua = tu_choi`) | mot-cua-api | như trên |
| (mọi loại trên trừ `sap_tre_han`) | | | thêm `trangThai`: trạng thái hồ sơ sau sự kiện, ghi cùng transaction với thay đổi (#73) |
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

## Thông báo sắp trễ hạn tới cán bộ (#56)

Thiết kế và lý do: `docs/architecture.md` §4.13. Sự kiện `ho_so.sap_tre_han` vào queue riêng `mot_cua.thong_bao` (quorum, dead-letter `mot_cua.thong_bao.loi`); consumer thông báo của `mot-cua-worker` gọi RPC `ghi_thong_bao_sap_tre` bằng token dịch vụ sự kiện: **mỗi cán bộ đang làm việc phụ trách lĩnh vực của hồ sơ một thông báo**, chống trùng theo (cán bộ, hồ sơ, loại, mốc hạn). Hồ sơ đã đóng thì bỏ qua; gia hạn sang ngày khác thì báo lại một lần.

| Đường gọi (qua APISIX) | Ai | Làm gì |
|---|---|---|
| `GET /api/thong_bao?select=*,thong_bao_kenh(kenh,trang_thai)&order=tao_luc.desc` | `can_bo`, `lanh_dao` | thông báo của chính mình (RLS); công dân → 403 |
| `PATCH /api/thong_bao?id=in.(…)&da_doc_luc=is.null` body `{"da_doc_luc": "…"}` | như trên | đánh dấu đã đọc; giờ đọc do CSDL đặt, chỉ sửa được cột này, đọc rồi không bỏ đọc được |
| `GET /workflow/thong-bao/luong` | như trên | Server-Sent Events: `event: thong-bao` `data: {"chuaDoc": 2, "moiNhat": "<id>"}` mỗi khi số chưa đọc hoặc thông báo mới nhất đổi (đọc lại mỗi 3 giây), `: nhip` mỗi 15 giây, `event: het-han` khi token hết hạn rồi đóng |

Kênh ngoài (`DXOS_THONG_BAO_KENH`, mặc định `email,sms`, để trống = chỉ trong cổng) **chỉ giả lập**: mỗi thông báo ghi một dòng `thong_bao_kenh` trạng thái `gia_lap` và worker ghi log "giả lập gửi …", không gửi email/SMS ra ngoài. Nội dung thông báo chỉ có mã hồ sơ, tên thủ tục và hạn, không có dữ liệu cá nhân người nộp.

| Tệp | Nội dung |
|---|---|
| `db/migrations/013_thong_bao.sql` | bảng `thong_bao`, `thong_bao_kenh`, RLS, trigger chỉ cho đánh dấu đã đọc, RPC `ghi_thong_bao_sap_tre` |
| `backend/worker.py` (`xu_ly_thong_bao`, `vong_thong_bao`), `backend/hop_thu.py` (`ghi_thong_bao`) | consumer thông báo |
| `backend/thong_bao.py`, `backend/main.py` (`_luong_thong_bao`) | luồng SSE cho chuông cổng cán bộ |
| `web-cong-dan/src/can-bo/lib/luong-thong-bao.ts`, `components/chuong-thong-bao.tsx`, `pages/thong-bao.tsx` | chuông, trang `/can-bo/thong-bao` |
| `db/tests/thong_bao.sql`, `backend/tests/test_thong_bao.py`, `src/can-bo/thong-bao.test.tsx`, `tests/smoke-thong-bao.sh` | test |

## Nhật ký kiểm toán (#75)

`nhat_ky_kiem_toan` ghi **mọi thao tác nghiệp vụ quan trọng, trong cùng transaction với thao tác** (trigger hoặc RPC; thao tác lỗi/rollback thì không có bản ghi). Thiết kế và lý do: `docs/architecture.md` §4.6.

| `hanh_dong` | Khi nào | `nguoi_sub` | `du_lieu` (không có họ tên, số điện thoại, tên tệp) |
|---|---|---|---|
| `ho_so.nop` | công dân nộp hồ sơ | người nộp | `maHoSo`, `thuTuc`, `denTrangThai` |
| `ho_so.chuyen_trang_thai` | mọi lần đổi `trang_thai` (theo `lich_su_trang_thai`) | người đổi (cán bộ xử lý bước khi đi theo quy trình) | `tuTrangThai`, `denTrangThai`, `lyDo`, `buoc` |
| `ho_so.cap_nhat` | đổi thông tin người nộp, hạn, cán bộ xử lý, lý do | người đổi | `cot` (tên cột), `canBoXuLy` |
| `ho_so.xoa` | xóa hồ sơ (chỉ SQL quản trị) | — | `maHoSo`, `trangThai` |
| `quy_trinh.xu_ly_buoc`, `quy_trinh.dong_bo` | RPC `dong_bo_trang_thai` có thay đổi (sau khi hoàn thành task Flowable; đối soát của worker) | người hoàn thành task | `buoc`, `trangThaiTruoc`, `trangThai`, `suKien` (id, loại sự kiện vào hộp thư đi) |
| `giay_to.ky` | phát hành biên nhận / thông báo kết quả có ký số (#77) | người có thao tác dẫn tới phát hành | `loai`, `giayToId`, `sha256` (PDF đã ký), `chungThu` (số hiệu) |
| `tep.tai_len`, `tep.kiem_tra` | tải tệp qua `/files`; cán bộ đổi `trang_thai_kiem_tra` | người tải / cán bộ | `tepId`, `thanhPhan`, `sha256` (nội dung tệp), `kichThuoc`, `ketQua` |
| `thu_tuc.them`, `thu_tuc.nap_goi`, `thu_tuc.rut_goi` | thêm thủ tục; nạp gói mới hoặc đã đổi (`goi_sha256`); rút gói | tài khoản dịch vụ danh mục | `goi`, `goiSha256`, `goiSha256Truoc`, `quyTrinh` |
| `wiki.them`, `wiki.sua`, `wiki.ngung_hieu_luc`, `wiki.hieu_luc_lai` | thêm, sửa văn bản wiki; chuyển hết hiệu lực / có hiệu lực lại (#95) | văn thư, lãnh đạo ghi | `loai`, `phamVi`, `linhVucId`, `trangThai`, `phienBan`, `sha256NoiDung`, `truongDoi` (tên cột); không có tiêu đề, nội dung |
| `can_bo.them_linh_vuc`, `can_bo.bo_linh_vuc` | đổi phân công lĩnh vực (= đổi hồ sơ cán bộ thấy) | — | `linhVuc` |
| `kiem_toan.khoi_tao` | bản ghi 1, lúc chạy migration 007 | — | số hồ sơ, số thủ tục lúc đó |

Mỗi bản ghi: `stt` (liền từ 1), `luc`, `vai_tro` (role của request), `nguon` (`nop`, `api`, `quy_trinh`, `doi_soat`, `he_thong`), `bam_truoc`, `bam = hex(SHA-256(bam_truoc ‖ nội dung chuẩn))`. Lãnh đạo đọc và xác minh qua APISIX:

```bash
curl -H "Authorization: Bearer $TOKEN_LANH_DAO" "http://localhost:9080/api/nhat_ky_kiem_toan?doi_tuong_id=eq.<hồ sơ>&order=stt"
curl -H "Authorization: Bearer $TOKEN_LANH_DAO" http://localhost:9080/api/rpc/xac_minh_kiem_toan
# → {"hopLe": true, "soBanGhi": 97, "sttCuoi": 97, "bamCuoi": "…", "dauChuoi": {…}, "loi": null}
# Trình xác minh độc lập (tự tính lại chuỗi từ bản ghi đọc qua API, không tin hàm trong CSDL):
DXOS_TOKEN=$TOKEN_LANH_DAO python3 mot-cua/backend/kiem_toan.py --api http://localhost:9080/api [--moc 97:<bam>]
```

Truy cập bảng có dữ liệu cá nhân (`ho_so`, `thanh_phan_ho_so`) và thay đổi cán bộ, phân công còn được pgAudit ghi ở mức câu lệnh vào log PostgreSQL (`docker compose logs postgres | grep 'AUDIT: OBJECT'`), không kèm tham số.

## Giấy tờ có ký số (#77)

Thiết kế và lý do: `docs/architecture.md` §4.7. Mẫu HTML ở [`mau-giay-to/`](mau-giay-to/) (`bien_nhan.html`, `ket_qua.html`, biến `$ten` thay bằng dữ liệu đã thoát HTML trong `backend/ky_so.py`); Gotenberg in A4, pyHanko ký PAdES bằng chứng thư step-ca của xã (OpenBao `dxos/tang2/mot-cua/ky-so`, do `ca-init` của nền tảng cấp).

| Giấy tờ | Phát hành khi | Nội dung |
|---|---|---|
| `bien_nhan` – Giấy tiếp nhận hồ sơ và hẹn trả kết quả | ngay sau khi khởi tạo quy trình (nộp đủ thành phần) | mã hồ sơ, người nộp, thủ tục, thời điểm nộp, thành phần đã nhận, lệ phí, hẹn trả |
| `ket_qua` – Thông báo kết quả giải quyết hồ sơ | ngay khi bước cuối đưa hồ sơ sang `hoan_tat` | mã hồ sơ, người nộp, thủ tục, hạn, thời điểm hoàn tất, kết quả |

Phát hành chạy ở luồng nền (lỗi chỉ ghi log), nên cổng gọi `POST …/giay-to/{loai}` khi người dùng bấm tải: có rồi trả lại, chưa có thì phát hành ngay.

```bash
# Công dân lấy biên nhận hồ sơ <HS> (link tải hết hạn sau DXOS_FILE_LINK_TTL giây)
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:9080/files/ho-so/<HS>/giay-to/bien_nhan
# Xác minh một PDF bất kỳ (ví dụ biên nhận công dân mang tới)
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' --data-binary @bien-nhan.pdf \
  http://localhost:9080/files/xac-minh
# → {"hopLe": true, "toanVen": true, "tinCay": true, "nguoiKy": "UBND xã Mẫu – Bộ phận Một cửa",
#    "phatHanh": {"loai": "bien_nhan", "maHoSo": "HS…", "kyLuc": "…"}, …}
```

Cổng công dân hiện nút tải biên nhận ở trang "Đã nộp"; cổng cán bộ có thẻ "Giấy tờ có ký số" trong chi tiết hồ sơ (biên nhận, và kết quả khi hồ sơ hoàn tất).

## Tra cứu tiến độ hồ sơ (#54)

Thiết kế và lý do: `docs/architecture.md` §4.12. Không đăng nhập, cổng công dân `/tra-cuu` gọi:

```bash
curl 'http://localhost:9080/public/rpc/tra_cuu_ho_so?p_ma=HS20261024-000123&p_so_cuoi=1234'
# → {"ma_ho_so": "HS20261024-000123", "thu_tuc": {"ma": "KS01", "ten": "Đăng ký khai sinh"}, "trang_thai": "cho_bo_sung",
#    "ngay_nhan": "…", "han_xu_ly": "2026-10-27", "ngay_hoan_tat": null,
#    "lich_su": [{"trang_thai": "moi", "luc": "…"}, {"trang_thai": "cho_bo_sung", "luc": "…"}]}
# Sai mã hoặc sai 4 số → null (200). Hồ sơ không khai số điện thoại → null: đăng nhập để xem.
```

Đăng nhập, trang `/ho-so` (Hồ sơ của tôi) đọc `/api/ho_so` và `/api/lich_su_trang_thai` (RLS: chỉ hồ sơ của mình, mốc kèm lý do), `/workflow/ho-so/{id}/tien-do`, `/files/ho-so/{id}/tep`, tải biên nhận và kết quả có ký số; hồ sơ chờ bổ sung thì tải thêm giấy tờ và nộp lại bằng `POST /workflow/tasks/{id}/complete` trên bước `bo_sung`.

## Trợ lý thủ tục hành chính (#91)

Thiết kế và lý do: `docs/architecture.md` §4.14. Không đăng nhập, trang **Hỏi đáp** (`/hoi-dap`) của cổng công dân gọi:

```bash
curl http://localhost:9080/tro-ly/thong-tin
# → {"che_do": "tat", "co_mo_hinh_ngon_ngu": false, "mo_hinh": null, "mo_hinh_nhung": null}
curl -H 'Content-Type: application/json' -d '{"cau_hoi": "Đăng ký kết hôn cần giấy tờ gì?"}' http://localhost:9080/tro-ly/hoi
# → {"cau_tra_loi": "Cần tờ khai đăng ký kết hôn theo mẫu… [1]", "nguon": [{"so": 1, "id": "HT02-2", "ma_thu_tuc": "HT02",
#    "tieu_de": "Đăng ký kết hôn – Giấy tờ cần nộp và xuất trình", "trich": "…", "lien_ket": null, "duoc_trich": true}, …],
#    "che_do": "ollama", "tim_kiem": {"tu_khoa": true, "ngu_nghia": true}, "thong_bao": null, "trich_tu_dong": false}
# LLM_PROVIDER=tat: cau_tra_loi = null, thong_bao giải thích, nguon = các đoạn liên quan nhất.
# "ma_thu_tuc": "KS01" trong body: chỉ tìm trong tài liệu của thủ tục đó.
curl 'http://localhost:9080/tro-ly/tim?q=ket+hon'   # chỉ tìm từ khóa (Meilisearch), không gọi mô hình
```

| Biến (`.env`) | Mặc định | Ý nghĩa |
|---|---|---|
| `LLM_PROVIDER` | `tat` | `tat` chỉ tìm kiếm · `ollama` (Qwen2.5 7B + bge-m3, `make up-ai`) · `openai-compatible` (API ngoài) · `gia-lap` (CI, smoke) |
| `LLM_BASE_URL` | trống | `ollama`: mặc định `http://ollama:11434`; Ollama trên máy: `http://host.docker.internal:11434`. `openai-compatible`: bắt buộc, ví dụ `https://…/v1` |
| `LLM_MODEL`, `LLM_EMBED_MODEL` | `qwen2.5:7b`, `bge-m3` | Qwen2.5 3B/72B, Llama, Gemma bị từ chối (giấy phép). Mô hình nhúng phải ra vector 1024 chiều |
| `LLM_TIMEOUT`, `TRO_LY_DONG_THOI` | `170`, `2` | giây tối đa mỗi lần gọi mô hình (dưới 180 giây chờ của APISIX); số câu sinh cùng lúc |

Khóa API của `openai-compatible` (nếu nhà cung cấp cần) đặt trong OpenBao, không đặt trong `.env`:

```bash
read -rs KHOA && printf '%s' "$KHOA" | docker compose exec -T -e BAO_TOKEN="$(jq -r .root_token .data/openbao/commune.json)" \
  openbao bao kv put -mount=dxos tang2/mot-cua/llm api_key=- && unset KHOA
```

Sửa kho tri thức (`tro-ly/kho-tri-thuc/*.md`) hay gói thủ tục rồi `make nap-tri-thuc`: chỉ đoạn đổi được nhúng lại. Đổi `LLM_PROVIDER`/mô hình nhúng: `make up` (tạo lại `tro-ly`) rồi `make nap-tri-thuc`.

## Đọc giấy tờ bằng OCR, cán bộ xác nhận (#93)

Thiết kế và lý do: `docs/architecture.md` §4.15. Cần dịch vụ `ocr` của nền tảng (profile `ai`): `make up-ocr` (chỉ OCR) hoặc `make up-ai`. Không chạy thì đọc thử trả 503, hồ sơ vẫn nộp và xử lý bình thường.

Dịch vụ `ocr` (`nen-tang/ocr/`) chạy PP-OCRv5_mobile_det (tìm dòng chữ) và VietOCR `vgg_transformer` (đọc tiếng Việt có dấu) bằng ONNX Runtime; image chỉ có `onnxruntime`, `numpy`, `pillow` và OpenCV 4.10 tự biên dịch (core + imgproc), không có PyTorch hay PaddlePaddle. Mô hình nằm sẵn trong image (tải và kiểm SHA-256 lúc build, `nen-tang/ocr/xuat_mo_hinh.py`), dịch vụ ở mạng nội bộ `ocr-noi-bo` không ra Internet. Trên hai ảnh mẫu giả, kết quả trùng từng dòng với bản PaddleX + PyTorch trước đó (14/14 trường đúng).

```bash
# Ảnh mẫu GIẢ có sẵn trên cổng: http://localhost:9080/mau-gia/giay-to-tuy-than.png, /mau-gia/giay-chung-sinh.png
curl -H "Authorization: Bearer $TOKEN" http://localhost:9080/files/doc-giay-to/loai     # loại giấy tờ + trường
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: image/png' --data-binary @giay-to-tuy-than.png \
  'http://localhost:9080/files/doc-giay-to?loai=giay_to_tuy_than'
# → {"loai": "giay_to_tuy_than", "truong": {"ho_ten": {"gia_tri": "Trần Văn Mẫu", "tin_cay": 0.93, "can_kiem_tra": false, …}, …}}
# Công dân gửi các trường đã xem/sửa cho tệp vừa tải lên (hồ sơ mới nộp hoặc chờ bổ sung):
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"truong": {"ho_ten": "Trần Văn Mẫu"}}' http://localhost:9080/files/tep/<TEP>/khai
# Cán bộ phụ trách lĩnh vực (token có OTP) xem kết quả, cho máy đọc lại, xác nhận (sau đó không sửa được):
curl -H "Authorization: Bearer $TK_CB" "http://localhost:9080/api/doc_giay_to?ho_so_id=eq.<HS>"
curl -H "Authorization: Bearer $TK_CB" -H 'Content-Type: application/json' -d '{}' http://localhost:9080/files/tep/<TEP>/doc
curl -H "Authorization: Bearer $TK_CB" -H 'Content-Type: application/json' \
  -d '{"truong": {"ho_ten": "Trần Văn Mẫu", "ngay_sinh": "01/01/1990"}}' http://localhost:9080/files/tep/<TEP>/xac-nhan
```

Thêm loại giấy tờ: thêm một mục trong `doc-giay-to/loai-giay-to.json` có khóa trùng mã thành phần hồ sơ trong `thanh-phan-ho-so.schema.json` của gói (ví dụ `giay_to_tuy_than`), khai `nhan_khop` (nhãn in trên giấy) và `kieu` của từng trường; `make check` + `make test-backend`, khởi động lại `mot-cua-api`.

## Wiki văn bản nội bộ cho cán bộ (#95)

Thiết kế và lý do: `docs/architecture.md` §4.16. Cổng cán bộ: mục **Wiki văn bản** (`/can-bo/wiki`) cho cán bộ, lãnh đạo, văn thư; văn thư và lãnh đạo có nút **Thêm văn bản**, **Sửa**, **Ngừng hiệu lực**. Văn bản có phạm vi xem: `toan_xa` (mọi cán bộ), `linh_vuc` (cán bộ đang phụ trách lĩnh vực đó), `lanh_dao` (chỉ lãnh đạo); lãnh đạo và văn thư (trừ `lanh_dao`) thấy theo vai.

| Endpoint | Vai | Kết quả |
|---|---|---|
| `GET /files/wiki/tim?q=&loai=&tat_ca=1&so_luong=&tu=` | `can_bo`, `lanh_dao`, `van_thu` | `{ket_qua: [{id, tieu_de, tieu_de_danh_dau, trich_doan, loai, pham_vi, linh_vuc_id, trang_thai, phien_ban, …}], tong, nguon}`; đoạn khớp nằm giữa U+E000 và U+E001; mặc định chỉ văn bản còn hiệu lực; `nguon = csdl` khi Meilisearch không chạy |
| `POST /files/wiki` (JSON `tieu_de`, `loai`, `noi_dung`, `pham_vi`, `linh_vuc_id`, `so_ky_hieu`, `ngay_ban_hanh`, `tom_tat`) | `van_thu`, `lanh_dao` | 201 + văn bản (phiên bản 1); phạm vi không được ghi → 403; dữ liệu sai → 400 |
| `POST /files/wiki/{id}` (JSON chỉ trường cần sửa; `trang_thai: het_hieu_luc` để ngừng hiệu lực) | `van_thu`, `lanh_dao` | 200 + văn bản (phiên bản tăng 1, bản cũ vào lịch sử); không thấy hoặc không được sửa → 404 |
| `GET /api/wiki_van_ban?id=eq.…`, `GET /api/wiki_van_ban_lich_su?van_ban_id=eq.…` | theo RLS | chi tiết, các phiên bản cũ |

```bash
curl -H "Authorization: Bearer $TK_CAN_BO" "http://localhost:9080/files/wiki/tim?q=tiep+cong+dan"
curl -H "Authorization: Bearer $TK_VAN_THU" -H 'Content-Type: application/json' \
  -d '{"tieu_de": "Hướng dẫn …", "loai": "huong_dan", "noi_dung": "…", "pham_vi": "toan_xa"}' http://localhost:9080/files/wiki
```

Chỉ mục Meilisearch `mot-cua-wiki-van-ban` là bản sao: `mot-cua-api` cập nhật ngay sau mỗi lần ghi và dựng lại toàn bộ từ CSDL khi khởi động và mỗi `DXOS_WIKI_DONG_BO_GIAY` giây (mặc định 300). Mất chỉ mục thì khởi động lại `mot-cua-api` hoặc chờ vòng đồng bộ kế tiếp.

## Sổ văn bản đến/đi (#78)

Thiết kế và lý do: `docs/architecture.md` §4.11. Văn thư (`van_thu`) vào sổ văn bản đến (tệp quét qua ClamAV, lưu Garage `van-ban/den/<năm>/…`, PDF có chữ ký số thì xác minh và lưu kết quả) và soạn dự thảo văn bản đi; lãnh đạo ký ban hành: cấp số đi, sinh PDF từ [`mau-giay-to/van_ban_di.html`](mau-giay-to/van_ban_di.html) bằng Gotenberg, ký PAdES bằng chứng thư của xã như giấy tờ hồ sơ. Số đến và số đi đánh riêng, bắt đầu lại từ 1 mỗi năm (giờ Việt Nam), không trùng khi nhiều người vào sổ cùng lúc. Văn bản đã vào sổ hoặc đã ký không sửa được; dự thảo xóa được.

| Endpoint | Vai | Kết quả |
|---|---|---|
| `POST /files/van-ban/den?ten=&loai=&ky_hieu=&ngay_van_ban=&noi_gui=&trich_yeu=` (body tệp PDF/JPEG/PNG) | `van_thu` | 201 + số đến; mã độc → 422; vai khác → 403 |
| `POST /files/van-ban/di` (JSON `loai`, `trich_yeu`, `noi_nhan`, `noi_dung`) | `van_thu` | 201 dự thảo, chưa số; `loai` ngoài danh mục → 400 |
| `POST /files/van-ban/{id}/ky` | `lanh_dao` | 200 + `so`, `ky_hieu` (`<số>/<viết tắt loại>-UBND`), link PDF; đã ký → 409 |
| `GET /files/van-ban/{id}` | `can_bo`, `lanh_dao`, `van_thu` | metadata + link tải ngắn hạn |
| `GET /api/van_ban?chieu=eq.di&order=nam.desc,so.desc` | `can_bo`, `lanh_dao`, `van_thu` | danh sách sổ (PostgREST, RLS) |

```bash
# Văn thư vào sổ một công văn đến đã quét (token văn thư có OTP)
curl -X POST -H "Authorization: Bearer $TOKEN_VT" -H 'Content-Type: application/pdf' --data-binary @cv.pdf \
  'http://localhost:9080/files/van-ban/den?ten=cv.pdf&loai=C%C3%B4ng%20v%C4%83n&ky_hieu=15%2FUBND-VP&ngay_van_ban=2026-10-20&noi_gui=UBND%20huy%E1%BB%87n&trich_yeu=V%E1%BB%81%20vi%E1%BB%87c'
# Lãnh đạo ký ban hành dự thảo <ID>; PDF tải về xác minh bằng POST /files/xac-minh (phatHanh.loai = van_ban_di)
curl -X POST -H "Authorization: Bearer $TOKEN_LD" -H 'Content-Type: application/json' -d '{}' \
  http://localhost:9080/files/van-ban/<ID>/ky
```

Cổng cán bộ có trang "Sổ văn bản" (`/can-bo/van-ban`): văn thư vào thẳng trang này; [`docs/cong-can-bo.md`](../docs/cong-can-bo.md).

## Kho dữ liệu lịch sử (#80)

Thiết kế và lý do: `docs/architecture.md` §4.8. Chạy sau `make up` (hồ sơ phải đã đóng mới vào kho):

```bash
make kho-du-lieu            # build image (lần đầu), xuất Parquet → dbt build + test + docs → nạp bao_cao
make kho-du-lieu-tai-lieu   # lineage và mô tả model ở http://127.0.0.1:8580 (Ctrl+C để dừng)
make test-kho               # cùng luồng trên dữ liệu mẫu giả, không cần lõi (CI: job kho-du-lieu)
```

| Nơi | Nội dung |
|---|---|
| volume `kho-du-lieu`: `parquet/ho_so/thang=YYYY-MM/thu_tuc=<mã>/du_lieu_0.parquet`, `parquet/lich_su_trang_thai/…`, `parquet/ngay_nghi/…`, `parquet/_manifest.json` | Parquet đã khử định danh (không họ tên, số điện thoại, sub người nộp, lý do, người đổi trạng thái), giờ Việt Nam không múi giờ |
| volume `kho-du-lieu`: `kho.duckdb`, `dbt-target/`, `dbt-logs/` | CSDL DuckDB của dbt, docs/lineage (`manifest.json`, `catalog.json`), log |
| PostgreSQL `bao_cao.fct_ho_so` | một dòng mỗi hồ sơ đã đóng: thủ tục, lĩnh vực, tháng, số giờ, số ngày làm việc, số lần bổ sung, trễ hạn |
| PostgreSQL `bao_cao.hieu_suat_thang` | tháng × thủ tục: số hồ sơ, hoàn tất, từ chối, trễ hạn, tỷ lệ trễ hạn, trung bình ngày làm việc và số giờ |
| PostgreSQL `bao_cao.lan_nap` | mỗi lần nạp: số dòng, `invocation_id` của dbt (đối chiếu với `dbt-target/run_results.json`) |

Trễ hạn = đóng (hoàn tất hoặc từ chối) sau 17:00 ngày `han_xu_ly`, giờ Việt Nam; số ngày làm việc tính từ sau ngày nộp tới hết ngày đóng, bỏ thứ Bảy, Chủ nhật, `ngay_nghi`. Thêm model: tệp `.sql` trong `kho-du-lieu/dbt/models/`, mô tả và test trong `schema.yml` cùng thư mục; bảng mới muốn đưa về `bao_cao` thì thêm bảng ở migration mới và vào danh sách của `nap_bao_cao`, `BANG_MART` trong `chay.py`.

## Dashboard báo cáo (#82)

`make up-bi` (= `make up` thêm profile `bi`) rồi `make kho-du-lieu` để có số liệu; mở http://localhost:9080/bao-cao/ (hoặc liên kết "Báo cáo hiệu suất" trong cổng cán bộ), đăng nhập bằng tài khoản lãnh đạo (mật khẩu + OTP). Dashboard "Hiệu suất một cửa" do `bao-cao/superset_dung.py` dựng; chart và thước đo:

| Chart | Dataset | Thước đo |
|---|---|---|
| Hồ sơ đã đóng | `bao_cao.fct_ho_so` | `COUNT(*)` |
| Tỷ lệ trễ hạn | `bao_cao.fct_ho_so` | tỷ lệ hồ sơ đóng sau 17:00 ngày hạn |
| Số hồ sơ theo lĩnh vực | `bao_cao.fct_ho_so` | số hồ sơ theo `ten_linh_vuc` |
| Tỷ lệ trễ hạn theo tháng và thủ tục | `bao_cao.hieu_suat_thang` | `SUM(so_tre_han) / SUM(so_ho_so)` |
| Thời gian giải quyết theo thủ tục và tháng | `bao_cao.fct_ho_so` | số hồ sơ, ngày làm việc trung bình/trung vị, số giờ trung bình/trung vị, tỷ lệ trễ hạn |

Thêm chart: khai trong `CHART`, `BO_CUC` của `superset_dung.py` rồi `make up-bi` (superset-init dựng lại, không nhân bản). Vai Keycloak nào được xem: `DXOS_SUPERSET_VAI_TRO` trong `docker-compose.yml`.

## Người dùng mẫu

| Người dùng | `sub` | Vai trò | Ghi chú |
|---|---|---|---|
| `congdan01` | `…0000c001` | `cong_dan` | Nguyễn Văn Mẫu, 3 hồ sơ mẫu |
| `congdan02` | `…0000c002` | `cong_dan` | Lê Thị Thử, 3 hồ sơ mẫu |
| `canbo01` | `…0000b001` | `can_bo` | hộ tịch; bắt cài OTP |
| `canbo02` | `…0000b002` | `can_bo` | chứng thực; bắt cài OTP |
| `canbo03` | `…0000b003` | `can_bo` | đất đai; bắt cài OTP |
| `lanhdao01` | `…0000d001` | `lanh_dao` | bắt cài OTP |
| `vanthu01` | `…0000e001` | `van_thu` | văn thư, sổ văn bản (#78); bắt cài OTP |

Realm không chứa mật khẩu: đặt bằng `make demo-users` (chạy sau `make smoke`; xem `docs/cai-dat.md` mục 3 và `docs/architecture.md` §8). `sub` cố định chỉ áp dụng khi realm được nạp lần đầu; volume Keycloak cũ giữ `sub` cũ.

## Chạy test

```bash
make test-backend               # test đơn vị API tệp, sự kiện, trình xác minh kiểm toán, ký số PDF, sổ văn bản (không cần Docker; make check cũng chạy)
make test-sql                   # migration + db/tests/*.sql trên PostgreSQL trống, trước và sau seed (container tạm; CI job test-sql)
make test-kho                   # kho dữ liệu trên dữ liệu mẫu: Parquet, idempotent, dbt build, số liệu mart (cần requirements của kho-du-lieu)
make smoke                      # toàn bộ: nền tảng + bộ máy + gói thủ tục + quy trình Flowable + /workflow + /files + sự kiện + kiểm toán
docker compose exec -T postgres psql -XqtA -U postgres -d commune < mot-cua/db/tests/rls.sql   # chỉ RLS
```

Bí mật của bộ máy (khóa S3, secret client `mot_cua_tep`, `mot_cua_su_kien`, `mot_cua_danh_muc`, thông tin kết nối RabbitMQ, mật khẩu `rest-admin` của Flowable) đọc từ OpenBao của lõi bằng AppRole `tang2` (`backend/bimat.py`, chỉ giữ trong bộ nhớ), xem `docs/architecture.md` §4.4.

Cổng cán bộ (#55) dùng `GET /workflow/tasks`, `GET /api/ho_so?id=in.(…)` (kèm `thu_tuc.bien_theo_buoc` để sinh form từng bước), `/files`, `GET /workflow/ho-so/{id}/tien-do` và `POST /workflow/tasks/{id}/complete`; luồng: [`docs/cong-can-bo.md`](../docs/cong-can-bo.md). Cổng công dân tra cứu tiến độ (#54): mục [Tra cứu tiến độ hồ sơ](#tra-cứu-tiến-độ-hồ-sơ-54). Thông báo sắp trễ hạn tới cán bộ (#56): mục [Thông báo sắp trễ hạn tới cán bộ](#thông-báo-sắp-trễ-hạn-tới-cán-bộ-56).
