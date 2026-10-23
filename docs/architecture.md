# Kiến trúc Commune DX-OS

Phiên bản tài liệu: v0.4.0 (tuần 2: tách nền tảng khỏi nghiệp vụ #3, gói thủ tục `nen-tang/` + `mot-cua/` + `thu-tuc/` #30 (D-009), schema #5, Flowable #8, route gateway #6, tệp #7, OpenBao #10, sự kiện RabbitMQ #9). Stack theo D-003, giấy phép đã xác minh ở D-004 (17/10/2026).

## 1. Tổng quan 3 tầng

- **Tầng 1 – Lõi headless** (`nen-tang/`): không có giao diện cho người dùng cuối, chỉ có API (và giao diện quản trị của từng dịch vụ cho quản trị viên). Gồm SSO, API Gateway, dữ liệu có cấu trúc và phi cấu trúc, workflow, cùng các dịch vụ hỗ trợ (bí mật, hàng đợi, tìm kiếm, ký số, sinh PDF, quét mã độc, log kiểm toán). **Không chứa nghiệp vụ** (mục 2).
- **Tầng 2 – Bộ máy một cửa** (`mot-cua/`) và **gói thủ tục** (`thu-tuc/<ma>/`): bộ máy giữ schema, vai trò, API dùng chung cho mọi thủ tục; mỗi gói mang mô tả, quy trình BPMN, JSON Schema thành phần hồ sơ, dữ liệu mẫu của một thủ tục (§2); sau này cổng cán bộ và cổng công dân (React), dashboard Superset. Tầng 2 **chỉ gọi lõi qua APISIX**, không kết nối thẳng CSDL, Flowable hay Garage.
- **Người dùng:** công dân, cán bộ một cửa, cán bộ chuyên môn, lãnh đạo xã.

Ảnh tổng quan dưới đây (bản tĩnh của sơ đồ động trong README) cho thấy 2 tầng, các gói thủ tục cắm vào bộ máy một cửa và đường đi của một hồ sơ KS01:

<p align="center">
  <img src="images/kien-truc-2-tang.webp" alt="Kiến trúc 2 tầng: Tầng 2 mot-cua gồm cổng công dân, cổng cán bộ, mot-cua-api, mot-cua-worker và các gói thủ tục KS01, CT01 cắm vào bộ máy chung; Tầng 1 nen-tang gồm Keycloak, APISIX, PostgREST, PostgreSQL, ClamAV, Garage, Flowable, RabbitMQ, OpenBao; đường cam là luồng một hồ sơ KS01 qua 6 bước" width="100%">
</p>

Sơ đồ dưới đây vẽ đúng các dịch vụ đang chạy trong `docker-compose.yml` (profile `core`) và bộ máy `mot-cua/`: route của gateway, luồng JWT, quét tệp trước khi lưu, outbox → RabbitMQ, OpenBao; 4 dịch vụ bắt buộc của đề được đánh số 1–4. Sơ đồ Mermaid tiếp theo là kiến trúc đích, gồm cả các thành phần của tuần sau.

<p align="center">
  <img src="images/kien-truc.svg" alt="Sơ đồ kiến trúc chi tiết: Tầng 2 mot-cua gọi lõi qua APISIX; Tầng 1 core gồm Keycloak, APISIX, PostgREST, PostgreSQL, Flowable, Garage, ClamAV, RabbitMQ, OpenBao" width="100%">
</p>

```mermaid
flowchart TB
  subgraph U["Người dùng"]
    CD["Công dân"]
    CB["Cán bộ một cửa / chuyên môn"]
    LD["Lãnh đạo xã"]
  end

  subgraph T2["Tầng 2 – mot-cua (H-P-D-I)"]
    WEBCD["Cổng công dân (React)"]
    WEBCB["Cổng cán bộ (React)"]
    BI["Dashboard Superset"]
  end

  subgraph T1["Tầng 1 – Lõi headless (chỉ API)"]
    KC["Keycloak, realm dxos<br/>SSO + MFA"]
    GW["Apache APISIX<br/>API Gateway, rate limit cổng công dân"]

    subgraph DATA["Dữ liệu"]
      PGR["PostgREST<br/>REST tự sinh"]
      PG[("PostgreSQL<br/>RLS + pgAudit")]
      AUD[("Log kiểm toán<br/>append-only + chuỗi băm SHA-256")]
      S3[("Garage<br/>S3, dịch vụ riêng")]
      AV["ClamAV<br/>quét mã độc, dịch vụ riêng"]
      MS["Meilisearch CE"]
    end

    FL["Flowable REST<br/>BPMN 2.0"]
    MQ["RabbitMQ"]
    BAO["OpenBao<br/>bí mật"]

    subgraph DOCS["Văn bản"]
      GOT["Gotenberg<br/>sinh PDF"]
      CA["step-ca + pyHanko<br/>ký số"]
    end
  end

  CD --> WEBCD
  CB --> WEBCB
  LD --> WEBCB
  LD --> BI

  WEBCD -- "OIDC (PKCE)" --> KC
  WEBCB -- "OIDC (PKCE) + OTP" --> KC
  WEBCD -- "HTTPS + JWT" --> GW
  WEBCB -- "HTTPS + JWT" --> GW
  BI -- "JWT" --> GW

  GW -.->|JWKS| KC
  GW -- "/api (JWT), /public (anon)" --> PGR
  GW -- "/workflow" --> FL
  GW -- "/files (JWT) → mot-cua-api" --> AV
  GW -- "/files/s3 (link ký sẵn)" --> S3
  GW -- "/search" --> MS

  PGR --> PG
  PG --> AUD
  FL --> PG
  PG -- "hộp thư sự kiện (outbox) → mot-cua-worker" --> MQ
  AV -.->|sạch mới lưu| S3
  FL --> GOT --> CA

  BAO -.->|cấp bí mật| PGR
  BAO -.->|cấp bí mật| FL
```

Đường nét đứt là luồng nội bộ giữa các dịch vụ lõi. Hiện có `/public/*` (đọc công khai bằng role `anon`), `/api/*` (JWT → PostgREST), `/workflow/*` (JWT → API một cửa → Flowable), `/files/*` (JWT → API một cửa: quét ClamAV rồi lưu Garage, #7) và `/files/s3/*` (link GET đã ký ngắn hạn tới Garage); `/search` ở tuần 5. Bảng route: §4.1, luồng tệp: §4.3.

## 2. Ba lớp: `nen-tang/`, bộ máy `mot-cua/`, gói `thu-tuc/<ma>/` (D-009)

### 2.1 Vì sao tách

- BTC trả lời (D-005 mục 11): **dịch vụ Tầng 1 phải độc lập hoàn toàn với nghiệp vụ cụ thể**, chỉ cung cấp dịch vụ cơ bản. D-008: backend Tầng 1 "cố gắng ở mức tổng quát nhất có thể"; cắm–rút là khái niệm cho **người thiết kế, xây dựng hệ thống**.
- Bản tuần 1 trộn hai tầng: init SQL của lõi tạo luôn bảng `ho_so`, role `cong_dan`/`can_bo`/`lanh_dao`; realm Keycloak có sẵn người dùng một cửa; APISIX có route riêng cho bảng `thu_tuc`. Bản #3 tách nền tảng khỏi nghiệp vụ.
- Ở cấp xã, thứ thay đổi thường xuyên là **thủ tục hành chính** (hàng trăm thủ tục, mỗi thủ tục một quy trình, một bộ giấy tờ, một thời hạn), còn cách tiếp nhận, phân quyền, theo dõi hạn, lưu tệp, phát sự kiện thì giống nhau. Vì vậy đơn vị cắm–rút của Commune DX-OS là **gói thủ tục** (D-009), không phải cả ứng dụng: thêm thủ tục = thả thêm một thư mục `thu-tuc/<ma>/`, bộ nạp tự kiểm và nạp, không sửa dòng mã nào.
- Nền tảng chỉ cung cấp **cơ chế** (đăng nhập, kiểm JWT, chuyển JWT thành role PostgreSQL để RLS áp dụng, sổ migration, két bí mật, hàng đợi, kho tệp). Bộ máy một cửa cung cấp **chính sách chung** của mọi thủ tục (bảng hồ sơ, vai trò, ai thấy dòng nào, API quy trình). Gói thủ tục cung cấp **nội dung riêng** của một thủ tục (mô tả, quy trình BPMN, thành phần hồ sơ).

### 2.2 Phân chia

```
nen-tang/                       Tầng 1 – không có tên bảng, vai trò hay thủ tục nghiệp vụ
  postgres/initdb/10-core.sql   role authenticator + anon; schema dxos: dxos.jwt_claims(),
                                dxos.jwt_claim(ten), dxos.jwt_sub(); sổ dxos.app_migration
  postgres/Dockerfile           postgres:17.6-alpine + pgAudit 17.1 (§4.6); role dxos_kiem_toan
                                của log đối tượng do db-init tạo, Tầng 2 GRANT bảng cần theo dõi
  step-ca/ky-tai-lieu.tpl       mẫu chứng thư ký tài liệu của CA nội bộ (§4.7); scripts/step-ca-start.sh,
                                scripts/ca-init.sh: khởi tạo CA, cấp chứng thư cho dịch vụ Tầng 2
  keycloak/realm-dxos.json      realm dxos: khóa ký RS256, chính sách OTP, chống dò mật khẩu,
                                client dxos_api (audience, không có role) và dxos_cli (dev)
  apisix/                       /public/* → role anon (chỉ GET, 60 req/phút/IP); /api/* → PostgREST,
                                /workflow/*, /files/* → mot-cua-api: bắt buộc JWT realm dxos;
                                /files/s3/* → Garage (link ký sẵn, chỉ GET/HEAD); /* còn lại → web Tầng 2;
                                chặn API quản trị Flowable; CORS theo DXOS_CORS_ORIGINS (§4.1)
  garage/garage.toml            Garage một nút (S3 :3900, Admin API :3903), bí mật đọc từ tệp (§4.3)
  openbao/config.hcl            OpenBao server (raft, không UI, audit ra stdout) (§4.4)
  openbao/bao-init.py           dịch vụ một lần: init, unseal, KV, policy, AppRole, bí mật nền tảng
  openbao/policies/*.hcl        policy từng danh tính; openbao/agent/*.hcl: agent render tệp bí mật
  openbao/kiem-quyen.py         kiểm policy bằng AppRole thật của từng dịch vụ (make smoke)
  scripts/tang2-migrate.sh      dịch vụ một lần: áp dụng SQL của dịch vụ Tầng 2
  scripts/tang2-realm.sh        dịch vụ một lần: nạp vai trò/nhóm/người dùng của Tầng 2; ghi secret
                                của client dịch vụ vào OpenBao
  scripts/db-init.sh            dịch vụ một lần: role + CSDL riêng của authenticator, keycloak, flowable,
                                mật khẩu theo OpenBao
  scripts/kc-start.sh           entrypoint Keycloak: đọc mật khẩu từ tệp bí mật
  scripts/garage-init.py        dịch vụ một lần: layout, bucket Tầng 2 khai báo, khóa S3 riêng
  rabbitmq/                     RabbitMQ một nút: rabbitmq.conf, enabled_plugins (STOMP + management) (§4.5)
  scripts/rabbitmq-init.py      dịch vụ một lần: vhost + user riêng của Tầng 2, nạp topology Tầng 2 khai báo
mot-cua/                        Tầng 2 – bộ máy một cửa, dùng chung cho MỌI thủ tục
  postgrest.env                 PGRST_DB_SCHEMAS=mot_cua
  db/migrations/001…004_*.sql   role, schema mot_cua, RLS (#5), tệp hồ sơ (#7), sự kiện (#9)
  db/migrations/005_*.sql       danh mục nạp từ gói: cột goi/quy_trinh/bien_theo_buoc/json_schema,
                                role dich_vu_danh_muc, RPC nap_thu_tuc, rut_goi_vang (D-009)
  db/seed/002_*.sql             lĩnh vực, danh mục thủ tục, cán bộ, hồ sơ mẫu GIẢ (chỉ khi DXOS_SEED=true)
  db/tests/*.sql                test quyền/RLS, test danh mục gói (make test-sql, make smoke)
  keycloak/realm.json           client role của dxos_api, nhóm, client mot_cua_web, client dịch vụ
                                mot_cua_tep, mot_cua_su_kien, mot_cua_danh_muc, người dùng mẫu
  s3/buckets.conf               bucket S3 (mot-cua-ho-so) (#7)
  rabbitmq/definitions.json     exchange mot_cua.su_kien, queue mot_cua.nhat_ky (+ queue lỗi) (#9)
  backend/main.py               API quy trình mỏng /workflow (#6, §4.2) và API tệp /files (#7, §4.3),
                                dịch vụ mot-cua-api; quy trình và biến từng bước đọc từ danh mục
  backend/nap_thu_tuc.py        bộ nạp gói: dịch vụ một lần nap-thu-tuc, make nap-thu-tuc (§2.4)
  backend/goi_thu_tuc.py        phần thuần của bộ nạp: đọc YAML tập con, kiểm gói (make check --chi-kiem)
  backend/kiem_bpmn.py          luật kiểm BPMN dùng chung cho bộ nạp và scripts/check-bpmn.py (CI)
  backend/tep.py, tests/        phần thuần của API tệp + test đơn vị (make test-backend, trong make check)
  backend/bimat.py              đọc bí mật từ OpenBao (AppRole tang2) (#10)
  backend/worker.py             dịch vụ mot-cua-worker: phát outbox lên RabbitMQ, quét sắp trễ hạn, consumer mẫu (#9)
  backend/su_kien.py, hop_thu.py, stomp.py   định dạng sự kiện, outbox qua PostgREST, client STOMP (#9)
  tests/smoke*.sh               kiểm tra bộ máy và gói thủ tục (make smoke gọi)
thu-tuc/<ma>/                   mỗi thủ tục hành chính một gói (docs/thu-tuc.md)
  thu-tuc.yaml                  mã, tên, lĩnh vực, thời hạn (ngày làm việc), lệ phí, căn cứ pháp lý, process id
  quy-trinh.bpmn20.xml          BPMN 2.0 viết tay; biến từng bước = flowable:formProperty
  thanh-phan-ho-so.schema.json  JSON Schema 2020-12 thành phần hồ sơ (Poka-yoke tuần 3)
  du-lieu-mau.json              hồ sơ mẫu GIẢ khớp schema, biến xử lý mẫu từng bước
  README.md                     mô tả, sơ đồ quy trình
thu-tuc/khai-sinh/              KS01 – Đăng ký khai sinh (1 ngày làm việc)
thu-tuc/chung-thuc-ban-sao/     CT01 – Chứng thực bản sao từ bản chính (trong ngày)
```

| Thứ | Nền tảng `nen-tang/` | Bộ máy `mot-cua/` | Gói `thu-tuc/<ma>/` |
|---|---|---|---|
| Role PostgreSQL | `authenticator` (PostgREST đăng nhập), `anon` | `cong_dan`, `can_bo`, `lanh_dao`, role dịch vụ + `GRANT … TO authenticator` | – |
| Schema | `dxos` (hàm đọc claim, sổ migration; không phơi ra API) | `mot_cua` (phơi ra API qua `postgrest.env`) | một dòng `mot_cua.thu_tuc` + các dòng `thanh_phan_yeu_cau` do bộ nạp ghi |
| RLS | hàm `dxos.jwt_sub()`, `dxos.jwt_claim()` dùng trong policy | policy trên mọi bảng `mot_cua`, theo vai trò và lĩnh vực cán bộ phụ trách (§2.7) | lĩnh vực của thủ tục quyết định cán bộ nào thấy hồ sơ |
| Keycloak | realm `dxos`, khóa, OTP, client `dxos_api`, `dxos_cli` | client role của `dxos_api`, nhóm, client web, client dịch vụ, người dùng mẫu, OTP bắt buộc | – |
| Workflow | Flowable REST, CSDL riêng; không tự quét thư mục nào | API `/workflow` khởi tạo quy trình theo `thu_tuc.quy_trinh`, kiểm biến theo `thu_tuc.bien_theo_buoc`; bộ nạp deploy BPMN | `quy-trinh.bpmn20.xml`: các bước, nhóm xử lý (mã lĩnh vực hoặc `lanh_dao`), biến từng bước |
| APISIX | `/public/*`, `/api/*`, `/workflow/*`, `/files/*`, `/files/s3/*` (không nêu tên tài nguyên); upstream `mot-cua-api`, `garage-s3` | tài nguyên công khai = bảng đã `GRANT SELECT … TO anon`; endpoint dưới `/workflow`, `/files` do `backend/main.py` quyết định | không cần route: danh mục có ở `/public/thu_tuc` ngay khi nạp |
| Object storage | Garage, ClamAV; tạo bucket và **một khóa S3 riêng** cho Tầng 2, chỉ có quyền trên bucket đã khai báo | `s3/buckets.conf`; khóa object, loại tệp nhận, quyền xem do backend + RLS quyết định | thành phần hồ sơ nào bắt buộc: `thanh-phan-ho-so.schema.json` |
| Bí mật | OpenBao, policy theo danh tính; nhánh `dxos/tang2/mot-cua/` cho Tầng 2 (khóa S3, client secret, RabbitMQ) | đọc bí mật qua AppRole `tang2` (`backend/bimat.py`) | không có bí mật |
| Hàng đợi | RabbitMQ một nút; **vhost + user riêng** cho Tầng 2 (không tag quản trị, không quyền configure) | `rabbitmq/definitions.json`; loại sự kiện, định dạng, consumer (§4.5) | sự kiện mang mã thủ tục (`thuTuc`) và lĩnh vực của gói |

### 2.3 Khởi động

```mermaid
flowchart LR
  BAO[("openbao")] --> BI["bao-init (một lần)<br/>unseal, policy, AppRole"]
  BI -->|exit 0| AG["agent *-secrets (một lần)<br/>render tệp bí mật"]
  AG -->|exit 0| PG & KC & PGR & FL & S3
  PG[("postgres<br/>initdb: nen-tang/postgres")] -->|healthy| MIG["tang2-migrate (một lần)<br/>mot-cua/db/*.sql"]
  PG -->|healthy| DBI["db-init (một lần)<br/>role + CSDL dịch vụ"]
  DBI -->|exit 0| KC & PGR & FL
  KC["keycloak<br/>import nen-tang/keycloak/realm-dxos.json"] -->|healthy| REALM["tang2-realm (một lần)<br/>mot-cua/keycloak/realm.json"]
  KC -->|healthy| JWKS["jwks-init (một lần)"]
  MIG -->|exit 0| PGR["postgrest<br/>env_file mot-cua/postgrest.env"]
  JWKS -->|exit 0| PGR
  PGR --> GW["apisix<br/>nen-tang/apisix"]
  REALM -->|exit 0| GW
  FL["flowable<br/>(không tự quét BPMN)"] -->|healthy| NAP["nap-thu-tuc (một lần)<br/>thu-tuc/*/ → Flowable + danh mục"]
  MIG -->|exit 0| NAP
  REALM -->|exit 0, secret mot_cua_danh_muc → OpenBao| NAP
  NAP -->|exit 0| BE["mot-cua-api<br/>mot-cua/backend/main.py"]
  PGR --> BE
  S3["garage"] -->|healthy| GI["garage-init (một lần)<br/>mot-cua/s3/buckets.conf"]
  GI -->|exit 0, khóa S3 → OpenBao| BE
  AV["clamav"] -.->|started| BE
  BE -->|healthy| GW
  S3 -->|healthy| GW
  AG -->|exit 0| MQ["rabbitmq<br/>nen-tang/rabbitmq"]
  MQ -->|healthy| RI["rabbitmq-init (một lần)<br/>mot-cua/rabbitmq/definitions.json"]
  RI -->|exit 0, user Tầng 2 → OpenBao| WK["mot-cua-worker<br/>mot-cua/backend/worker.py"]
  FL -->|healthy| WK
  REALM -->|exit 0| WK
```

- `tang2-migrate` (image `postgres`, đã có sẵn): áp dụng `db/migrations/*.sql` theo thứ tự tên, rồi `db/seed/*.sql` nếu `DXOS_SEED=true`. Mỗi tệp chạy **trong một transaction cùng dòng ghi sổ** `dxos.app_migration (ung_dung, loai, tep, sha256)`: lỗi giữa chừng không để lại nửa schema; chạy lại thì bỏ qua tệp đã áp dụng; tệp đã áp dụng mà bị sửa nội dung thì dừng với mã lỗi (phải viết migration mới). Cuối cùng gửi `NOTIFY pgrst, 'reload schema'`.
- `tang2-realm` (image `keycloak`, đã có sẵn, dùng `kcadm.sh`): gọi **Partial Import** của Keycloak vào realm `dxos` với `ifResourceExists=SKIP`: đối tượng đã có thì giữ nguyên, nên chạy lại không lỗi và không ghi đè người dùng đã cài OTP (ghi đè sẽ đổi `sub`, làm hồ sơ cũ mất chủ).
- `nap-thu-tuc` (image `python`): §2.4. Chạy ở mỗi `up`; `mot-cua-api` chỉ khởi động khi bộ nạp xong. Gói lỗi không làm bộ nạp thoát mã khác 0.
- `garage-init` (image `python` đã dùng cho `mot-cua-api`): §4.3. Chạy lại an toàn (layout, khóa, bucket đã có thì giữ).
- `rabbitmq-init` (image `python`): §4.5. Chạy lại an toàn (vhost, user đã có thì giữ, mật khẩu đặt lại theo OpenBao; topology khai báo lại không đổi gì).
- `bao-init`, agent `db-secrets`, `postgrest-secrets`, `keycloak-secrets`, `flowable-secrets`, `garage-secrets` (image `openbao`), `db-init` (image `postgres`): §4.4. Đều chạy lại ở mỗi `up`.
- Chạy lại tay: `make migrate`; nạp dữ liệu mẫu khi đã tắt seed: `make seed`; nạp lại gói thủ tục: `make nap-thu-tuc`.

### 2.4 Hợp đồng giữa các lớp

**Nền tảng ↔ dịch vụ Tầng 2.** Dịch vụ một lần của nền tảng chỉ biết quy ước thư mục của dịch vụ Tầng 2 được mount vào `/tang2` và tên của nó (`DXOS_TANG2`, cố định `mot-cua` trong `docker-compose.yml`, khóa `x-tang2`; không còn biến chọn ứng dụng trong `.env`). Thiếu thư mục nào thì bước tương ứng được bỏ qua:

1. `postgrest.env`: ít nhất `PGRST_DB_SCHEMAS=<schema>` – các schema PostgREST phơi ra.
2. `db/migrations/NNN_<mo-ta>.sql`: chạy bằng superuser, một lần. Phải tạo role nghiệp vụ `NOLOGIN` và `GRANT <role> TO authenticator`; cấp quyền cho `anon` với những gì công khai.
3. `db/seed/NNN_<mo-ta>.sql`: dữ liệu giả, viết để chạy lại không trùng (`ON CONFLICT DO NOTHING`).
4. `keycloak/realm.json`: định dạng `PartialImportRepresentation` (`roles.client.dxos_api`, `groups`, `clients`, `users`). Mỗi người dùng có **đúng một** client role của `dxos_api`, trùng tên role PostgreSQL (PostgREST đọc `resource_access.dxos_api.roles[0]`). Client có service account (confidential): Keycloak tự sinh client secret, `tang2-realm` ghi vào OpenBao `dxos/tang2/<DXOS_TANG2>/keycloak/<clientId>`.
5. `s3/buckets.conf` (#7): mỗi dòng một tên bucket. `garage-init` tạo bucket và khóa `dxos-tang2-<DXOS_TANG2>` chỉ đọc/ghi trên các bucket này (không tạo được bucket, không phải owner; bucket bỏ khỏi danh sách thì bị thu hồi quyền), ghi thông tin kết nối vào OpenBao `dxos/tang2/<DXOS_TANG2>/s3`.
6. `rabbitmq/definitions.json` (#9): định dạng definitions của RabbitMQ, **chỉ** `exchanges`, `queues`, `bindings`. `rabbitmq-init` tạo vhost `<DXOS_TANG2>`, user `tang2-<DXOS_TANG2>` (không tag, configure `^$`, read/write `.*` trong vhost của mình), nạp topology, ghi thông tin kết nối vào OpenBao `dxos/tang2/<DXOS_TANG2>/rabbitmq`. Khai thêm `users`, `permissions`, `policies`… thì `rabbitmq-init` dừng.
7. Dịch vụ chạy mã của bộ máy (`mot-cua-api`, `mot-cua-worker`, `nap-thu-tuc`) dùng image `python` gốc (chỉ thư viện chuẩn), mount `./mot-cua` vào `/mot-cua`, nhận role_id/secret_id của AppRole `tang2` trong `/run/dxos-secrets/approle/` (volume `tang2-secrets`, chỉ đọc) và đọc bí mật từ OpenBao lúc cần (§4.4).

**Bộ máy ↔ gói thủ tục.** Bộ máy không biết thủ tục nào; gói không chứa mã. Bộ nạp `nap-thu-tuc` (`mot-cua/backend/nap_thu_tuc.py`) quét `thu-tuc/*/` khi `make up` và khi `make nap-thu-tuc`:

1. **Kiểm gói** (`goi_thu_tuc.py`, không gọi mạng; `make check` chạy cùng bước này với `--chi-kiem`, CI chặn PR có gói lỗi): đủ 5 tệp; `thu-tuc.yaml` đúng tập con YAML, đủ khóa, đúng kiểu, không khóa lạ; JSON Schema là 2020-12, đúng dạng `{"thanh_phan": {"<mã>": [<id tệp>]}}`; BPMN qua luật của `kiem_bpmn.py` (giống job CI `bpmn`), đúng một process có id bằng `quy_trinh`, nhóm xử lý chỉ là mã lĩnh vực của gói hoặc `lanh_dao`, assignee chỉ là `${nguoiNopSub}`, biến từng bước khai bằng `flowable:formProperty` kiểu `boolean`/`string`/`long`; `du-lieu-mau.json` khớp schema, không có dãy số giống CMND/CCCD, biến xử lý mẫu khớp BPMN.
2. **Deploy BPMN** lên Flowable qua REST bằng tài khoản `rest-admin`, tên deployment `thu-tuc/<goi>@<12 ký tự SHA-256>`: BPMN không đổi thì không deploy lại (không sinh phiên bản quy trình thừa). Flowable từ chối BPMN thì gói bị bỏ qua.
3. **Ghi danh mục** qua PostgREST: RPC `mot_cua.nap_thu_tuc` bằng token của client dịch vụ `mot_cua_danh_muc` (role `dich_vu_danh_muc`, chỉ có quyền gọi hai RPC nạp/rút). Upsert thủ tục theo mã: tên, lĩnh vực (tạo nếu chưa có), thời hạn, lệ phí, căn cứ pháp lý, `quy_trinh`, `bien_theo_buoc`, `json_schema`; upsert thành phần yêu cầu theo mã, thành phần bỏ khỏi gói thì thôi bắt buộc (không xóa vì hồ sơ cũ còn tham chiếu).
4. **Rút gói**: thủ tục có gói mà thư mục không còn thì thôi có quy trình (hồ sơ mới → 422; quy trình đang chạy trong Flowable chạy tiếp tới khi xong). Gói còn thư mục nhưng lỗi **không** bị rút: bản nạp tốt gần nhất được giữ.

Gói lỗi ở bất kỳ bước nào: in lý do từng dòng, bỏ qua gói, các gói khác vẫn nạp, mã thoát 0 (không làm sập hệ thống). Mã 1 chỉ khi Flowable, Keycloak hay PostgREST không gọi được.

API một cửa (`backend/main.py`) dùng danh mục thay cho bảng gắn cứng: `POST /workflow/ho-so` khởi tạo quy trình `thu_tuc.quy_trinh` của thủ tục (thủ tục chưa có gói → 422, không lưu hồ sơ); `POST /workflow/tasks/{id}/complete` chỉ nhận biến khai trong `thu_tuc.bien_theo_buoc` của bước đó, đúng kiểu, đủ biến bắt buộc. `GET /public/rpc/json_schema_thu_tuc?ma=…` trả đúng schema của gói.

### 2.5 Thêm một thủ tục (cho lập trình viên)

Hướng dẫn 5 bước, có ví dụ đầy đủ: [`docs/thu-tuc.md`](thu-tuc.md). Tóm tắt: chép một gói có sẵn sang `thu-tuc/<ma-moi>/`, sửa `thu-tuc.yaml`, vẽ lại BPMN, khai thành phần hồ sơ, sửa dữ liệu mẫu; `make check` rồi `make nap-thu-tuc`. Không sửa tệp nào trong `nen-tang/`, `mot-cua/`, `docker-compose.yml` hay APISIX. `make smoke` thử đúng việc này với một gói tạm (cắm rồi rút) ở mỗi lần chạy.

Giới hạn hiện tại: một gói chỉ có một quy trình; nhóm xử lý giới hạn trong lĩnh vực của thủ tục và lãnh đạo; biến từng bước chỉ có kiểu `boolean`, `string`, `long`; thủ tục cần bảng dữ liệu riêng (ngoài hồ sơ chung) phải viết migration trong `mot-cua/`.

### 2.6 Nâng cấp từ bản tuần 1

Lên bản gói thủ tục (D-009, #30): `git pull` rồi `make up`, không cần xóa volume. Migration `005_goi_thu_tuc.sql` thêm cột danh mục; `nap-thu-tuc` deploy BPMN của hai gói (Flowable không còn tự quét thư mục) và ghi danh mục; dịch vụ đổi tên (`app-*` → `tang2-*`, `mot-cua-api`, `mot-cua-worker`), danh tính OpenBao `app`/`app-realm` → `tang2`/`tang2-realm`, nhánh bí mật `dxos/apps/…` → `dxos/tang2/…`: `garage-init`, `rabbitmq-init`, `tang2-realm` tự ghi lại khóa S3, mật khẩu RabbitMQ, client secret vào nhánh mới (user RabbitMQ `tang2-mot-cua`, khóa Garage `dxos-tang2-mot-cua` mới; user, khóa và volume `app-*` cũ còn sót có thể xóa tay). Biến `DXOS_APP` trong `.env` cũ không còn được đọc, có thể xóa.

Volume `pg-data` tạo trước khi tách vẫn có schema `mot_cua` cũ nhưng thiếu schema `dxos`; `tang2-migrate` sẽ dừng và hướng dẫn. Dữ liệu tuần 1 là dữ liệu giả, nên xóa volume rồi chạy lại: `docker compose --profile core down -v && make up`. Realm cũ `commune` cũng không còn được dùng (realm mới là `dxos`).

Lên bản có OpenBao (#10): giữ `.env` cũ, `make up` chuyển mật khẩu sang OpenBao, rồi xóa các dòng mật khẩu khỏi `.env` (§4.4.5). Không cần xóa volume.

Từ v0.0.1 lên schema đầy đủ (#5): `make up` (hoặc `make migrate`) áp dụng `002_schema_day_du.sql`, migration này **thay** hai bảng giữ chỗ `thu_tuc`, `ho_so` của 001 (khóa `text`/`bigint`, chỉ có dữ liệu giả) bằng schema mới; seed 001 bị bỏ, seed 002 nạp lại dữ liệu mẫu. Đã chạy thử trên volume tạo từ bản #3: smoke đạt hết. Người dùng mẫu tạo trước đó giữ `sub` ngẫu nhiên (Partial Import bỏ qua người dùng đã có), nên hồ sơ và cán bộ mẫu chỉ khớp người dùng Keycloak khi chạy từ volume trống; muốn khớp thì `docker compose --profile core down -v && make up`.

### 2.7 Tầng dữ liệu của bộ máy `mot-cua` (#5)

Sơ đồ ER, bảng quyền đầy đủ và quy tắc trạng thái: [`mot-cua/README.md`](../mot-cua/README.md). Tóm tắt:

- Schema `mot_cua` (phơi ra API): `linh_vuc`, `thu_tuc`, `thanh_phan_yeu_cau`, `ngay_nghi`, `can_bo`, `can_bo_linh_vuc`, `ho_so`, `thanh_phan_ho_so`; khóa chính UUID, `created_at`/`updated_at`. Hàm RPC công khai `json_schema_thu_tuc(ma)` sinh JSON Schema thành phần hồ sơ (nguồn cho Poka-yoke tuần 3).
- Schema `mot_cua_noi_bo` (không phơi ra API): hàm tính hạn theo ngày làm việc, hàm kiểm "cán bộ đang gọi có phụ trách lĩnh vực này", trigger.
- RLS bật và ép (`FORCE`) trên mọi bảng. Công dân: hồ sơ của mình (`nguoi_nop_sub = dxos.jwt_sub()`). Cán bộ: hồ sơ thuộc lĩnh vực mình phụ trách, tra theo `sub` trong `can_bo` + `can_bo_linh_vuc` (không cần claim riêng trong JWT; đổi phân công có hiệu lực ngay, không phải chờ token mới). Lãnh đạo: đọc tất cả. `anon`: chỉ danh mục công khai.
- Dữ liệu cá nhân tối thiểu: `sub`, họ tên, số điện thoại (không bắt buộc); không lưu CCCD, ngày sinh, địa chỉ. Giấy tờ chỉ lưu metadata, tệp ở Garage (#7).
- Kiểm tra: `mot-cua/db/tests/rls.sql` (63 kiểm tra, một transaction rồi ROLLBACK, không phụ thuộc seed) + smoke qua APISIX bằng token thật từng vai trò (§8.3).

## 3. Ánh xạ 4 dịch vụ bắt buộc của đề

| Yêu cầu của đề (Tầng 1) | Thành phần | Bằng chứng trong repo |
|---|---|---|
| Identity / SSO | Keycloak 26, realm lõi `dxos`; vai trò và người dùng do bộ máy một cửa nạp; cán bộ và lãnh đạo của `mot-cua` bắt buộc cấu hình OTP | `nen-tang/keycloak/realm-dxos.json`, `mot-cua/keycloak/realm.json` |
| API Gateway | Apache APISIX 3.13 chế độ standalone (không cần etcd); route `/public`, `/api`, `/workflow`, `/files`; kiểm JWT, giới hạn tần suất, CORS, chặn API quản trị Flowable | `nen-tang/apisix/config.yaml`, `nen-tang/apisix/apisix.yaml`, §4.1, §8.5 |
| Quản trị dữ liệu có cấu trúc | PostgreSQL 17 + Row-Level Security, PostgREST sinh REST API cho schema của bộ máy; migration theo dịch vụ Tầng 2; pgAudit 17.1 (log DDL, quyền, truy cập bảng dữ liệu cá nhân) và nhật ký kiểm toán chuỗi băm SHA-256 của bộ máy (§4.6) | `nen-tang/postgres/`, `nen-tang/scripts/tang2-migrate.sh`, `mot-cua/db/` |
| Quản trị dữ liệu phi cấu trúc | Garage v2.4.1 (S3, một nút), ClamAV 1.5.4 quét **trước khi lưu**, kiểm loại tệp bằng magic bytes, link GET ký ngắn hạn; Meilisearch CE để tìm toàn văn (tuần 5) | `nen-tang/garage/`, `nen-tang/scripts/garage-init.py`, `mot-cua/backend/`, §4.3, §8.6 |
| Workflow engine | Flowable REST 8.0.0 (CSDL riêng `flowable` trong PostgreSQL), BPMN 2.0 viết tay trong gói `thu-tuc/<ma>/quy-trinh.bpmn20.xml`, bộ nạp `nap-thu-tuc` kiểm và deploy qua REST; Tầng 2 dùng qua `/workflow` (API một cửa) | `docker-compose.yml` (`flowable`, `db-init`, `nap-thu-tuc`, `mot-cua-api`), `thu-tuc/`, `mot-cua/backend/`, §4.2, §7, §8.4, §8.5 |

## 4. Luồng xác thực: JWT Keycloak → APISIX → PostgREST → RLS

```mermaid
sequenceDiagram
  autonumber
  participant App as Ứng dụng Tầng 2
  participant KC as Keycloak (realm dxos)
  participant GW as APISIX
  participant API as PostgREST
  participant DB as PostgreSQL

  App->>KC: Đăng nhập (Authorization Code + PKCE)<br/>cán bộ nhập thêm mã OTP
  KC-->>App: access token (RS256)<br/>resource_access.dxos_api.roles = ["can_bo"]
  App->>GW: GET /api/ho_so<br/>Authorization: Bearer TOKEN
  GW->>GW: openid-connect: kiểm chữ ký bằng JWKS,<br/>hạn token, issuer. Sai → 401
  GW->>API: GET /ho_so (giữ nguyên header Authorization)
  API->>API: Kiểm lại chữ ký (JWKS do jwks-init tải),<br/>aud = dxos_api
  API->>DB: SET ROLE can_bo<br/>set request.jwt.claims (sub, roles)
  DB->>DB: Policy RLS của role can_bo lọc dòng
  DB-->>API: Các dòng được phép
  API-->>GW: 200 JSON
  GW-->>App: 200 JSON
```

Chi tiết cách claim vai trò thành role PostgreSQL:

1. Lõi: realm `dxos` có client `dxos_api` **không có role nào**. Ứng dụng `mot-cua` thêm 3 client role `cong_dan`, `can_bo`, `lanh_dao` của `dxos_api` và gán cho nhóm `/cong-dan`, `/can-bo`, `/lanh-dao` (tệp `mot-cua/keycloak/realm.json`).
2. Vì token có client role của `dxos_api`, Keycloak thêm `dxos_api` vào `aud`. PostgREST đặt `PGRST_JWT_AUD=dxos_api` nên token cấp cho mục đích khác bị từ chối.
3. PostgREST đọc role từ `PGRST_JWT_ROLE_CLAIM_KEY=.resource_access.dxos_api.roles[0]` rồi `SET ROLE` sang role PostgreSQL trùng tên (role này do migration của bộ máy tạo). Không có token (route `/public/*`) → role `anon` của lõi.
4. Ràng buộc: mỗi người dùng chỉ có **đúng một** client role của `dxos_api`. Nếu sau này một người kiêm nhiệm, chuyển sang cách dùng `db-pre-request` để chọn role.
5. Trong PostgreSQL, policy RLS của bộ máy dùng hàm lõi `dxos.jwt_sub()` (claim `sub`): công dân chỉ thấy và chỉ nộp hồ sơ của chính mình; cán bộ được tra `sub` trong bảng `can_bo` để biết lĩnh vực phụ trách. Quyền theo cột chặn công dân tự đặt trạng thái, người nộp, hạn xử lý hay cán bộ xử lý.

| Role PostgreSQL | Đăng nhập | Danh mục (`thu_tuc`…) | `ho_so`, `thanh_phan_ho_so` |
|---|---|---|---|
| `authenticator` (lõi) | có (PostgREST) | — | — (chỉ chuyển role) |
| `anon` (lõi) | không | đọc thủ tục công khai (`/public/thu_tuc`) | không có quyền |
| `cong_dan` | không | đọc thủ tục công khai | đọc và nộp hồ sơ **của mình**; sửa khi hồ sơ đang chờ bổ sung |
| `can_bo` | không | đọc tất cả | đọc và xử lý hồ sơ thuộc **lĩnh vực phụ trách**, khi hồ sơ chưa đóng |
| `lanh_dao` | không | đọc tất cả | chỉ đọc tất cả |

Bảng đầy đủ theo từng bảng và cột: `mot-cua/README.md`.

Vì sao kiểm JWT hai lần: APISIX chặn sớm request không hợp lệ và giới hạn tần suất; PostgREST vẫn tự kiểm để CSDL không tin bất kỳ thứ gì đứng trước nó (Zero-Trust, nguyên lý B4).

OpenAPI: `GET /api/` (có token) hoặc `GET /public/` trả đặc tả OpenAPI do PostgREST sinh, với `PGRST_OPENAPI_MODE=follow-privileges` – chỉ liệt kê bảng, cột, RPC mà role của request được quyền (anon chỉ thấy danh mục công khai), nên không lộ cấu trúc ngoài quyền. `PGRST_DB_MAX_ROWS=1000` chặn trên số dòng mỗi response.

JWKS cho PostgREST: PostgREST không tự tải khóa từ URL, nên dịch vụ một lần `jwks-init` tải `.../realms/dxos/protocol/openid-connect/certs` vào volume `jwks`, PostgREST đọc qua `PGRST_JWT_SECRET=@/jwks/jwks.json`. Realm chỉ khai báo một khóa RSA dùng để ký (RS256), không có khóa mã hóa, để JWKS gọn. Khi xoay khóa Keycloak: `docker compose --profile core up -d --force-recreate jwks-init postgrest`.

### 4.1 Bảng route của gateway (`nen-tang/apisix/apisix.yaml`)

| Route | Phương thức | Xác thực | Đích | Giới hạn / ghi chú |
|---|---|---|---|---|
| `/public/*` | GET, HEAD, OPTIONS | không; header `Authorization` bị bỏ → role `anon` | PostgREST | 60 req/phút/IP, vượt → 429 (JSON); chỉ đọc những gì bộ máy `GRANT … TO anon` (gồm danh mục thủ tục nạp từ gói) |
| `/api/*` | mọi | JWT Keycloak (APISIX + PostgREST kiểm) | PostgREST, `SET ROLE` theo `resource_access.dxos_api.roles[0]` → RLS | 600 req/phút/IP |
| `/workflow/*` | mọi (backend chỉ nhận GET/POST) | JWT Keycloak (APISIX + backend kiểm) | `mot-cua-api:8000` (API một cửa), bỏ tiền tố `/workflow` | 300 req/phút/IP; endpoint: `mot-cua/README.md` |
| `/workflow/{repository,management,identity,runtime,history,query,form,flowable-rest}/*`, `/flowable-rest/*` | mọi | – | không chuyển tiếp | luôn 403: API quản trị/REST thô của Flowable không mở qua gateway |
| `/files/*` | mọi (backend nhận GET/POST) | JWT Keycloak (APISIX + backend kiểm) | `mot-cua-api:8000`, giữ nguyên đường dẫn | 120 req/phút/IP; body ≤ 10 MiB (`client-control`, vượt → 413); endpoint: `mot-cua/README.md` |
| `/files/s3/*` | GET, HEAD | chữ ký SigV4 trong URL (Garage kiểm chữ ký và hạn) | Garage S3 `garage:3900`, bỏ tiền tố, Host viết lại `garage:3900` | 120 req/phút/IP; bỏ header `Authorization`, `Cookie`; thêm `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` |
| `/can-bo`, `/can-bo/*` (ưu tiên -5) | GET, HEAD | không (trang tĩnh) | `mot-cua-web:8080`: cổng cán bộ, cùng bản build với cổng công dân (#55) | 300 req/phút/IP; bỏ `Authorization`, `Cookie`; `X-Robots-Tag: noindex, nofollow`. Dữ liệu đi qua `/api`, `/workflow`, `/files` bằng token client `mot_cua_can_bo` (mật khẩu + OTP); luồng: [`cong-can-bo.md`](cong-can-bo.md) |
| `/*` (còn lại, ưu tiên thấp nhất) | GET, HEAD | không (trang tĩnh) | `mot-cua-web:8080`: cổng công dân, nginx không đặc quyền phục vụ bản build React (#57) | 600 req/phút/IP; bỏ `Authorization`, `Cookie`. nginx trả `index.html` cho route SPA (`/thu-tuc/…`, `/nop-ho-so/…`, `/dang-nhap/…`, 200) và đường dẫn lạ (404); CSP không `unsafe-inline`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin`; `/cau-hinh.js` (Keycloak, realm, client) sinh từ biến môi trường lúc chạy |

- Toàn cục: plugin `cors` với `allow_origins` = origin của gateway (`DXOS_GATEWAY_URL`, nơi cổng công dân được phục vụ) + biến môi trường `DXOS_CORS_ORIGINS` (`.env`, mặc định `http://localhost:5173`, nhiều origin cách nhau bởi dấu phẩy); APISIX đọc biến trong `apisix.yaml` bằng `${{DXOS_CORS_ORIGINS}}`, biến được khai báo ở `nginx_config.envs` của `config.yaml`. PostgREST cũng chỉ cho cùng danh sách origin (`PGRST_SERVER_CORS_ALLOWED_ORIGINS`), origin lạ không nhận header CORS.
- Cấu hình `openid-connect` (bearer only, JWKS của realm `dxos`) đặt một lần trong `plugin_configs` `jwt-dxos`, các route cần token tham chiếu `plugin_config_id`.
- Không mở cổng ra host: PostgREST, `mot-cua-api`, `mot-cua-web`, Garage (S3 và Admin API), ClamAV. Flowable chỉ có cổng debug trên `127.0.0.1` (smoke, quản trị viên); Keycloak mở cổng 8080 cho trình duyệt đăng nhập.

### 4.2 Luồng `/workflow`: API quy trình mỏng của bộ máy một cửa

Luồng hồ sơ đăng ký khai sinh theo BPMN `dang_ky_khai_sinh` (làn công dân, cán bộ hộ tịch, lãnh đạo; hẹn giờ quá hạn), kèm lời gọi API và sự kiện phát ra ở từng bước:

<p align="center">
  <img src="images/luong-ho-so.svg" alt="Luồng hồ sơ khai sinh chi tiết: công dân nộp, cán bộ hộ tịch tiếp nhận và thẩm định, lãnh đạo phê duyệt; thiếu thành phần thì công dân bổ sung; hẹn giờ đánh dấu quá hạn" width="100%">
</p>

Flowable REST chỉ có Basic auth bằng tài khoản của chính nó, không hiểu JWT Keycloak và không biết công dân nào sở hữu hồ sơ nào. Hai cách đã cân nhắc:

| Cách | Vì sao không/có chọn |
|---|---|
| APISIX proxy thẳng `/workflow/*` → Flowable, lọc đường dẫn, gateway gắn Basic auth | **Không chọn**: mọi người dùng thành `rest-admin` trong mắt Flowable; lọc đường dẫn không ngăn công dân liệt kê task của người khác, hoàn thành task tiếp nhận hay khởi tạo quy trình với biến tùy ý |
| API mỏng `mot-cua/backend/main.py` gọi Flowable thay người dùng | **Chọn**: kiểm quyền theo `sub`, vai trò và lĩnh vực trước mỗi lời gọi; Python thư viện chuẩn, chỉ thêm `jsonschema` (MIT) cho Poka-yoke phía máy chủ (#59; image `python` gốc + `requirements.txt`, mã mount chỉ đọc) |

```mermaid
sequenceDiagram
  autonumber
  participant App as Web Tầng 2
  participant GW as APISIX
  participant BE as mot-cua-api (mot-cua)
  participant API as PostgREST
  participant FL as Flowable REST

  Note over App: Poka-yoke lớp 1: tệp đã chọn khớp JSON Schema<br/>của gói, thiếu → không gửi request nào
  App->>GW: POST /api/ho_so → hồ sơ moi (RLS: người nộp = sub)
  App->>GW: POST /files/ho-so/{id}/tep × n (ClamAV quét, Garage)
  App->>GW: POST /workflow/ho-so/{id}/khoi-tao<br/>Bearer TOKEN công dân
  GW->>GW: openid-connect (JWKS). Sai → 401
  GW->>BE: POST /ho-so/{id}/khoi-tao (giữ Authorization)
  BE->>BE: kiểm lại RS256, exp, iss, aud = dxos_api
  BE->>API: GET /ho_so?id=… kèm thu_tuc(quy_trinh, json_schema)<br/>(token người dùng, RLS)
  BE->>API: GET /thanh_phan_ho_so?ho_so_id=… (tệp đã quét sạch)
  BE->>BE: Poka-yoke lớp 2: jsonschema Draft 2020-12<br/>thiếu → 422, không khởi tạo, không ghi sự kiện
  BE->>FL: POST runtime/process-instances (Basic rest-admin)<br/>businessKey = mã hồ sơ, biến lấy từ CSDL
  FL-->>BE: process instance, task tiep_nhan (nhóm ho_tich)
  BE-->>App: 201 hồ sơ + processInstanceId + bước đang mở
```

- **Ai thấy task nào** (`GET /workflow/tasks`): task giao đích danh cho `sub` của người gọi (bước `bo_sung` của công dân) cộng task chưa ai nhận của nhóm người gọi. Nhóm = `candidateGroups` trong BPMN: lãnh đạo → `lanh_dao`; cán bộ → mã các lĩnh vực đang phụ trách, tra trong `mot_cua.can_bo` + `can_bo_linh_vuc` **bằng token của chính cán bộ** (đổi phân công có hiệu lực ngay, giống RLS). Công dân không có nhóm.
- **Hoàn thành task** (`POST /workflow/tasks/{id}/complete`): chỉ người được giao, hoặc người thuộc nhóm ứng viên khi task chưa ai nhận; backend nhận (`claim`) task cho `sub` rồi hoàn thành, nên lịch sử Flowable ghi đúng người xử lý. Chỉ nhận biến khai báo cho bước đó bằng `flowable:formProperty` trong BPMN của gói (danh mục `thu_tuc.bien_theo_buoc`, ví dụ khai sinh: `hopLe`, `datYeuCau`, `pheDuyet`, `ghiChu`), đúng kiểu, đủ biến bắt buộc; biến hệ thống (`hoSoId`, `nguoiNopSub`, `hanXuLyLuc`, `quaHan`, `ketQua`) client không đặt được.
- **Hồ sơ** luôn đọc/ghi qua PostgREST bằng token người dùng: khởi tạo quy trình hay xem tiến độ hồ sơ người khác → 404 vì RLS không trả dòng. Thủ tục chưa có gói (`thu_tuc.quy_trinh` rỗng) → 422 trước khi lưu hồ sơ.
- **Bí mật**: mật khẩu `rest-admin` chỉ nằm trong biến môi trường của `flowable` và `mot-cua-api` (sau này lấy từ OpenBao, #10); client không bao giờ cầm.
- **Zero-Trust**: backend tự kiểm chữ ký RS256 theo JWKS của Keycloak (tải lại khi gặp `kid` lạ), hạn, issuer, audience; token sửa chữ ký hoặc sửa payload (đổi role) gọi thẳng vào backend trong mạng nội bộ → 401.
- **Sự kiện** (#9, §4.5): khởi tạo quy trình thành công → `ho_so.moi`; hoàn thành task → `ho_so.chuyen_buoc`, và `ho_so.hoan_tat` | `ho_so.tu_choi` nếu quy trình vừa kết thúc. Gọi thẳng Flowable REST (cổng debug, smoke mục 5) không qua API này nên không phát sự kiện ngay; vòng đối soát của `mot-cua-worker` sửa trạng thái theo Flowable và ghi sự kiện sau (#73).
- **Poka-yoke 2 lớp** (#53, #59): cổng công dân kiểm tệp đã chọn theo JSON Schema 2020-12 của gói (`@cfworker/json-schema`, không cần `unsafe-eval` nên hợp CSP của cổng), thiếu thì không gửi request nào; `mot-cua-api` kiểm lại cùng schema với tệp **đã lưu và quét sạch** trong CSDL (`jsonschema`, `mot-cua/backend/poka_yoke.py`) trước khi gọi Flowable, nên gọi thẳng API khi thiếu giấy tờ → 422 kèm lỗi từng thành phần, không khởi tạo quy trình. `POST /workflow/ho-so` (nộp gộp) chỉ còn dùng được cho thủ tục không có thành phần bắt buộc. Chi tiết: [`mot-cua/README.md`](../mot-cua/README.md) mục `/workflow`.
- **Trạng thái hồ sơ** (#73): sau mỗi lời gọi Flowable thành công, `mot-cua-api` tra ánh xạ bước → trạng thái của gói (`thu_tuc.trang_thai_buoc`) và gọi một RPC `mot_cua.dong_bo_trang_thai`: đổi `ho_so.trang_thai`, ghi `lich_su_trang_thai` và sự kiện vào hộp thư đi trong cùng transaction. Flowable trước, CSDL sau; CSDL lỗi thì request vẫn thành công và `mot-cua-worker` đối soát lại. Bảng trạng thái, thứ tự gọi, xử lý lỗi: [`mot-cua/README.md`](../mot-cua/README.md#trạng-thái-hồ-sơ); cách khai trong gói: [`docs/thu-tuc.md`](thu-tuc.md#trạng-thái-hồ-sơ-theo-bước).

### 4.3 Dữ liệu phi cấu trúc: tải tệp, quét ClamAV, link ký ngắn hạn (#7)

Garage (AGPL-3.0) và ClamAV (GPL-2.0) chạy như **dịch vụ riêng bằng image gốc, không sửa mã**, chỉ nói chuyện qua mạng (S3 HTTP, giao thức TCP của `clamd`) – D-004, `NOTICE`. Backend của bộ máy tự ký SigV4 và nói giao thức `clamd` bằng thư viện chuẩn Python (`mot-cua/backend/tep.py`), không nhúng thư viện nào của hai dự án.

```mermaid
sequenceDiagram
  autonumber
  participant App as Web Tầng 2
  participant GW as APISIX
  participant BE as mot-cua-api (mot-cua)
  participant API as PostgREST
  participant AV as ClamAV (clamd)
  participant S3 as Garage (S3)

  App->>GW: POST /files/ho-so/{id}/tep?ten=to-khai.pdf<br/>Bearer TOKEN công dân, Content-Type: application/pdf, body = tệp
  GW->>GW: JWT (JWKS) sai → 401; body > 10 MiB → 413
  GW->>BE: chuyển nguyên request
  BE->>BE: kiểm lại JWT; tên, đuôi pdf/jpg/png, Content-Type khớp đuôi → sai: 415
  BE->>API: GET /ho_so?id=… (token người dùng, RLS)
  Note over BE: chỉ công dân, hồ sơ của mình (không thấy → 404),<br/>trạng thái moi/cho_bo_sung (khác → 409)
  BE->>AV: INSTREAM (toàn bộ nội dung)
  alt nhiễm (vd. EICAR)
    BE->>API: POST /nhat_ky_tep tu_choi_ma_doc (token dịch vụ)
    BE-->>App: 422 + tên mẫu virus. KHÔNG lưu gì
  else sạch
    BE->>BE: magic bytes khớp đuôi? Không → nhật ký tu_choi_loai_tep, 415
    BE->>S3: PUT mot-cua-ho-so/ho-so/{id}/{uuid}.pdf (khóa S3 của bộ máy, SigV4)
    BE->>API: POST /thanh_phan_ho_so (token dịch vụ dich_vu_tep): object_key, sha256,<br/>kích thước, người tải, ket_qua_quet=sach, phiên bản ClamAV
    Note over BE,S3: ghi metadata lỗi → xóa object vừa lưu
    BE->>API: POST /nhat_ky_tep tai_len
    BE-->>App: 201 metadata
  end
  App->>GW: GET /files/tep/{id}?ttl=60 (Bearer)
  GW->>BE: chuyển tiếp (đã kiểm JWT)
  BE->>API: đọc metadata bằng token người dùng (RLS); không thấy mà tệp có thật → 403, không có → 404
  BE->>API: nhật ký cap_link
  BE-->>App: link = /files/s3/mot-cua-ho-so/…?X-Amz-…&X-Amz-Expires=60
  App->>GW: GET link (không cần token)
  GW->>S3: GET (Host garage:3900)
  S3-->>App: tệp (sửa URL → 403; quá hạn → 400 "Date is too old")
```

**Thứ tự kiểm.** Kiểm rẻ trước khi đọc body (token, tên, đuôi, Content-Type, kích thước, quyền trên hồ sơ); sau khi nhận body thì **quét mọi tệp trước**, rồi mới kiểm magic bytes: tệp nhiễm luôn được ghi nhật ký kể cả khi sai loại. `clamd` không trả lời → 503, không lưu (fail-closed). Không có đường nào ghi object mà chưa qua quét: chỉ `mot-cua-api` cầm khóa S3, route `/files/s3/*` chỉ cho GET/HEAD.

**Ai ghi metadata.** Từ migration 003, công dân không còn quyền `INSERT` vào `thanh_phan_ho_so`: nếu backend ghi bằng token người dùng thì người dùng cũng tự ghi được qua `/api` với `object_key`, `sha256`, kết quả quét giả. Backend kiểm quyền bằng token người dùng, còn dòng metadata và nhật ký ghi bằng token **Client Credentials của client dịch vụ `mot_cua_tep`** (role `dich_vu_tep`). RLS vẫn là lớp thứ hai cho cả dịch vụ: chỉ gắn được tệp có `object_key` dưới tiền tố `ho-so/<ho_so_id>/`, do chính người nộp tải, đã quét sạch, vào hồ sơ đang `moi`/`cho_bo_sung`; dịch vụ không sửa, không xóa được metadata hay hồ sơ.

| Vai trò | Tải lên | Xem/link tệp |
|---|---|---|
| `cong_dan` | hồ sơ của mình, khi `moi` hoặc `cho_bo_sung` | hồ sơ của mình |
| `can_bo` | không (403) | hồ sơ thuộc lĩnh vực đang phụ trách; lĩnh vực khác → 403 |
| `lanh_dao` | không (403) | mọi hồ sơ (chỉ xem) |
| `dich_vu_tep` (service account) | ghi metadata/nhật ký sau khi backend đã kiểm | đọc để kiểm tồn tại; không cấp link |

**Nhật ký tệp** `mot_cua.nhat_ky_tep`: `tai_len`, `tu_choi_ma_doc` (kèm tên mẫu virus, sha256), `tu_choi_loai_tep`, `cap_link`; chỉ thêm – trigger chặn `UPDATE`/`DELETE`/`TRUNCATE` kể cả superuser; lãnh đạo đọc được qua `/api/nhat_ky_tep`. Log kiểm toán chuỗi băm SHA-256 của toàn hệ thống là việc tuần 4.

**Bí mật, không có trong repo hay `.env`** (nằm trong OpenBao, §4.4):

| Bí mật | Sinh bởi | Nằm ở (KV `dxos/`) | Ai đọc |
|---|---|---|---|
| `rpc_secret`, `admin_token` của Garage | `bao-init` (32 byte ngẫu nhiên) | `core/garage` | `garage` (tệp do agent render), `garage-init` |
| Khóa S3 `dxos-tang2-mot-cua` (access key + secret) | Garage (`CreateKey`), `garage-init` ghi lại khi đổi | `tang2/mot-cua/s3` | `mot-cua-api` (đọc lúc cần, chỉ trong RAM) |
| Client secret `mot_cua_tep` | Keycloak khi nạp realm, `tang2-realm` ghi | `tang2/mot-cua/keycloak/mot_cua_tep` | `mot-cua-api` |

Không bí mật nào được in ra log; client chỉ nhận link đã ký (chứa access key ID, không chứa secret). Xoay khóa S3: xóa khóa `dxos-tang2-mot-cua` bằng CLI `garage key delete` (`docker compose exec garage /garage …`) rồi `make up` và `docker compose --profile core up -d --no-deps --force-recreate mot-cua-api` (khóa mới được tạo và ghi vào OpenBao; `mot-cua-api` đọc lại ở lần gọi đầu).

**Garage một nút.** `replication_factor = 1`, `db_engine = sqlite`, dung lượng khai báo `GARAGE_CAPACITY_BYTES` (mặc định 10 GiB). Đủ cho máy local và chung kết; triển khai thật cần ≥ 3 nút ở các zone khác nhau và `replication_factor = 3`. Link quá hạn Garage trả **400 `InvalidRequest: Date is too old`** (AWS S3 trả 403); sửa đường dẫn hay chữ ký → 403.

**ClamAV.** Image `clamav/clamav:1.5.4-debian` (đa kiến trúc; bản Alpine chỉ có amd64), có sẵn CSDL virus nên volume trống không phải tải ~300 MB; `freshclam` trong container cập nhật vào volume `clamav-db`. Nạp CSDL mất khoảng 30–60 giây và cần ~1–1,5 GB RAM; trong lúc đó API tải tệp trả 503. ClamAV nằm trong profile `core` (không phải `docs`) vì quét là điều kiện bắt buộc để lưu tệp.

### 4.4 Quản lý bí mật: OpenBao (#10)

Không có mật khẩu, khóa hay token nào trong repo hay `.env`. **OpenBao 2.7.1** (MPL-2.0, nhánh mã nguồn mở của Vault do Linux Foundation quản lý; HashiCorp Vault bị loại vì giấy phép BSL) là nguồn duy nhất của mọi bí mật dịch vụ. Chạy như dịch vụ riêng bằng image gốc `openbao/openbao`, không sửa mã. Cấu hình và mã khởi tạo: `nen-tang/openbao/`.

#### 4.4.1 Thiết kế và lý do

| Quyết định | Chọn | Vì sao / thay thế khi triển khai thật |
|---|---|---|
| Chế độ chạy | Server thường (`bao server`, **không** `-dev`), web UI tắt (lõi headless) | `-dev` giữ dữ liệu trong RAM, tự unseal, root token cố định: không chứng minh được vòng đời bí mật thật |
| Storage | `raft` (integrated storage) một nút, volume `bao-data` | Không cần dịch vụ ngoài; thêm nút bằng `retry_join` mà không đổi storage; có `bao operator raft snapshot` để sao lưu. `file` đơn giản hơn nhưng không mở rộng được |
| Mạng | Chỉ nghe trong mạng nội bộ Docker, không publish cổng, không qua APISIX; TLS tắt | Triển khai thật: TLS bằng chứng thư từ step-ca của lõi |
| Khởi tạo | `bao-init` (Python thư viện chuẩn, HTTP API) chạy ở **mỗi** `make up`, idempotent | Volume trống và volume cũ cùng một lệnh; không có bước tay nào để quên |
| Unseal | Shamir 1 phần, ngưỡng 1 (`BAO_KEY_SHARES`, `BAO_KEY_THRESHOLD`); `BAO_UNSEAL=file`: `bao-init` tự unseal bằng tệp khóa trên máy — **chỉ cho máy dev** | Thật: 5 phần / ngưỡng 3 chia cho nhiều người (`BAO_UNSEAL=manual`), hoặc auto-unseal bằng KMS/HSM hay một OpenBao khác (transit); thu hồi root token sau khi cấu hình |
| Danh tính | Mỗi dịch vụ (nhóm dịch vụ cùng vai trò) một **AppRole** + policy `dxos-<tên>` chỉ đọc/ghi đúng đường dẫn của mình; token 15 phút (backend: 1 giờ, đăng nhập lại khi hết hạn) | role_id/secret_id nằm trong volume riêng của danh tính đó, chủ là uid của dịch vụ, quyền 0400. Thật: secret_id có hạn + response wrapping, `secret_id_bound_cidrs` |
| Cách dịch vụ nhận bí mật | (a) Image không tự gọi HTTP được (PostgreSQL, PostgREST, Keycloak, Flowable, Garage): **`bao agent` một lần** đăng nhập AppRole, render tệp 0400 vào volume riêng `<danh tính>-secrets` rồi thoát; dịch vụ đọc bằng cơ chế sẵn có (`POSTGRES_PASSWORD_FILE`, `PGPASSFILE`, `PGRST_DB_URI=@tệp`, Spring Boot `configtree`, `*_file` của Garage; Keycloak qua `nen-tang/scripts/kc-start.sh`). (b) `tang2-realm` (bash), `garage-init`, `mot-cua-api` (Python): **tự gọi HTTP API**, bí mật chỉ nằm trong bộ nhớ | Agent một lần không tốn RAM khi chạy (laptop 16 GB). Đánh đổi: tệp render nằm trong volume Docker (trong VM của Docker Desktop), mỗi volume chỉ dịch vụ đó mount. Thật: agent chạy lâu dài làm sidecar, tệp trên tmpfs, tự render lại khi bí mật đổi |
| Bí mật lõi | `bao-init` sinh ngẫu nhiên (32 ký tự `[A-Za-z0-9_-]`, an toàn trong URI; khóa Garage 32 byte hex) khi chưa có; không bao giờ ghi đè | Bí mật do dịch vụ khác sinh (khóa S3 do Garage, client secret do Keycloak) được `garage-init`/`tang2-realm` ghi vào OpenBao bằng quyền chỉ-ghi của chúng |
| Kiểm toán | Audit device `file` ra stdout (`docker compose logs openbao`), giá trị bí mật và token được băm HMAC | Khai báo trong `config.hcl` (OpenBao không cho bật audit qua API). Thật: chuyển log về kho log tập trung |
| Xoay vòng | Đổi giá trị trong KV rồi `make up`: `db-init` đặt lại mật khẩu role PostgreSQL, agent render lại; khởi động lại dịch vụ dùng nó (`docker compose up -d --force-recreate <dịch vụ>`) | Khóa S3: xóa khóa `dxos-tang2-<app>` bằng `docker compose exec garage /garage key delete …` rồi `make up` (`garage-init` tạo và ghi khóa mới) |

#### 4.4.2 Sơ đồ

```mermaid
flowchart LR
  subgraph host["Máy chạy (ngoài git)"]
    INIT[".data/openbao/tên-project.json<br/>unseal key + root token, quyền 600"]
  end
  BI["bao-init (một lần)<br/>init · unseal · KV · policy · AppRole"] <-->|root token| BAO[("openbao<br/>KV v2 dxos/ · raft · audit")]
  INIT <--> BI
  BI -->|role_id + secret_id| V1["volume db-secrets"] & V2["postgrest-secrets"] & V3["keycloak-secrets"] & V4["flowable-secrets"] & V5["garage-secrets"] & V6["tang2-realm-secrets"] & V7["garage-init-secrets"] & V8["tang2-secrets"]
  BAO -->|"bao agent một lần<br/>(AppRole riêng)"| V1 & V2 & V3 & V4 & V5
  V1 --> PG["postgres · db-init · tang2-migrate"]
  V2 --> PGR["postgrest"]
  V3 --> KC["keycloak"]
  V4 --> FL["flowable"]
  V5 --> GA["garage"]
  V6 --> AR["tang2-realm"] <-->|"đọc admin Keycloak<br/>ghi client secret"| BAO
  V7 --> GI["garage-init"] <-->|"đọc admin_token<br/>ghi khóa S3"| BAO
  V8 --> BE["mot-cua-api"] <-->|"đọc lúc cần, giữ trong RAM"| BAO
```

Thứ tự khởi động: `openbao` → `bao-init` (exit 0) → agent `*-secrets` (exit 0) → `postgres` → `db-init` → `keycloak`, `postgrest`, `flowable` → `tang2-realm`, `garage-init` → `mot-cua-api` (xem §2.3).

#### 4.4.3 Dịch vụ ↔ đường dẫn KV ↔ policy

KV v2 gắn ở `dxos/`; policy viết theo đường dẫn API `dxos/data/<đường dẫn>`. `${DXOS_TANG2}` trong policy được `bao-init` thay bằng tên dịch vụ Tầng 2 (`mot-cua`), nên Tầng 2 chỉ chạm nhánh của chính mình.

| Danh tính (AppRole, policy `dxos-…`) | Dịch vụ dùng | Đọc | Ghi | Nhận bằng |
|---|---|---|---|---|
| `db` | `postgres` (initdb), `db-init`, `tang2-migrate` | `core/db/*` (`postgres`, `authenticator`, `keycloak`, `flowable`) | – | agent `db-secrets` (uid 70): `postgres_password`, `pgpass`, mật khẩu từng role |
| `postgrest` | `postgrest` | `core/db/authenticator` | – | agent `postgrest-secrets` (uid 1000): `db-uri` |
| `keycloak` | `keycloak` | `core/db/keycloak`, `core/keycloak/admin` | – | agent `keycloak-secrets` (uid 1000): `db_password`, `admin_password` |
| `flowable` | `flowable` | `core/db/flowable`, `core/flowable/rest-admin` | – | agent `flowable-secrets` (uid 100): `flowable/spring.datasource.password`, `flowable/flowable.rest.app.admin.password` |
| `garage` | `garage` | `core/garage` (`rpc_secret`, `admin_token`) | – | agent `garage-secrets` (root): `rpc_secret`, `admin_token` |
| `garage-init` | `garage-init` | `core/garage`, `tang2/${DXOS_TANG2}/s3` | `tang2/${DXOS_TANG2}/s3` | HTTP API (Python) |
| `tang2-realm` | `tang2-realm` | `core/keycloak/admin` | `tang2/${DXOS_TANG2}/keycloak/*` (chỉ ghi, không đọc lại) | HTTP/1.0 qua `/dev/tcp` (image Keycloak không có curl) |
| `tang2` | `mot-cua-api`, `mot-cua-worker`, `nap-thu-tuc` | `tang2/${DXOS_TANG2}/*` (gồm `rabbitmq`), `core/flowable/rest-admin` | – | HTTP API (`mot-cua/backend/bimat.py`), chỉ trong RAM |
| `rabbitmq` (#9) | `rabbitmq` | `core/rabbitmq/admin` | – | agent `rabbitmq-secrets` (uid 100): `conf.d/20-admin.conf` (`default_user`/`default_pass`, chỉ áp dụng khi volume `rabbitmq-data` trống) |
| `rabbitmq-init` (#9) | `rabbitmq-init` | `core/rabbitmq/admin`, `tang2/${DXOS_TANG2}/rabbitmq` | `tang2/${DXOS_TANG2}/rabbitmq` | HTTP API (Python) |

`make smoke` kiểm ma trận này bằng chính AppRole của từng dịch vụ (`nen-tang/openbao/kiem-quyen.py`, `scripts/smoke-openbao.sh`): 38 cặp (27 từ #10, 11 thêm ở #9) danh tính × đường dẫn, gồm cả `tang2` không đọc được `tang2/<dịch vụ khác>/…`, `garage-init` không ghi được `core/garage`, `keycloak` không ghi được bí mật của chính mình. Phép thử ghi dùng check-and-set `cas=0` lên đường dẫn đã có nên không bao giờ đổi bí mật thật.

#### 4.4.4 Khởi tạo, unseal, khởi động lại

```
make up            # docker compose --profile core up -d; bao-init chạy trước mọi dịch vụ dùng bí mật
make bao-init      # chạy riêng bước khởi tạo/unseal (idempotent)
make bao-status    # initialized / sealed
```

- Lần đầu (volume `bao-data` trống): `bao-init` gọi `sys/init`, ghi **unseal key + root token** vào `${BAO_INIT_DIR:-./.data/openbao}/<tên compose project>.json` (thư mục 700, tệp 600; `.data/` đã nằm trong `.gitignore`), rồi unseal, bật KV v2 + AppRole, ghi policy, sinh bí mật lõi, cấp AppRole.
- **Không xóa, không commit tệp này.** Mất tệp khi OpenBao đang seal = mất mọi bí mật (phải xóa volume và khởi tạo lại từ đầu). `git clean -fdx` xóa cả `.data/`: sao lưu tệp ra ngoài repo. Mỗi compose project một tệp, nên project tạm (`COMPOSE_PROJECT_NAME=…`) không ghi đè khóa của project chính. Nếu volume `bao-data` bị xóa mà tệp cũ còn, `bao-init` đổi tên tệp cũ thành `…json.<thời điểm>.bak` thay vì ghi đè.
- Khởi động lại (`make down` rồi `make up`, khởi động lại Docker, `docker compose restart openbao`): OpenBao luôn về trạng thái **seal**. `make up` chạy lại `bao-init` → unseal → dịch vụ chạy tiếp. Khi đang seal, agent thoát mã 1 sau khoảng 1 giây, dịch vụ phụ thuộc không khởi động (fail-closed); dịch vụ đang chạy giữ bí mật đã nhận.
- `BAO_UNSEAL=manual`: `bao-init` không đọc unseal key từ tệp; unseal tay `docker compose exec openbao bao operator unseal` (lặp đủ ngưỡng) rồi `make bao-init`.

#### 4.4.5 Chuyển từ `.env` cũ (volume tạo trước #10)

Volume cũ có mật khẩu role PostgreSQL, quản trị Keycloak, `rest-admin` của Flowable đã đặt theo `.env`. Không cần xóa volume:

1. Giữ nguyên `.env` cũ (còn `POSTGRES_PASSWORD`, `PGRST_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `FLOWABLE_DB_PASSWORD`, `FLOWABLE_ADMIN_PASSWORD`), chạy `make up`. Bí mật nào **chưa có** trong OpenBao thì `bao-init` lấy từ biến `.env` tương ứng (truyền vào dưới tên `LEGACY_*`); `rpc_secret`/`admin_token` của Garage lấy từ volume `garage-secrets` cũ. Log ghi rõ `ĐÃ CHUYỂN từ .env sang OpenBao: …` (chỉ tên biến). Tệp rõ cũ `s3.json`, `keycloak-*.secret` trong volume `tang2-secrets` bị xóa (khóa S3 và client secret được `garage-init`/`tang2-realm` ghi lại vào OpenBao ngay lần chạy đó).
2. Xóa 6 dòng mật khẩu khỏi `.env`, chạy lại `make up` và `make smoke`.
3. Lỡ chạy `make up` bản mới với `.env` đã xóa mật khẩu trên volume cũ (bí mật mới sinh ngẫu nhiên, Keycloak/Flowable không đăng nhập được CSDL): đưa lại các dòng cũ vào `.env` rồi `make bao-import-env` (ghi đè bằng giá trị `.env`), sau đó `make up`.

Đã chạy thử trên volume tạo bằng `develop` trước #10 (project tạm `commune-b10m`, smoke cũ 277/277 để có dữ liệu): §8.7.

#### 4.4.6 Xem và đổi một bí mật (quản trị viên)

Root token đọc từ tệp trên máy, đi qua biến môi trường của lệnh, không in ra:

```
TK="$(python3 -c 'import json; print(json.load(open(".data/openbao/commune.json"))["root_token"])')"
docker compose exec -e BAO_TOKEN="$TK" openbao bao kv metadata get dxos/core/db/flowable   # phiên bản, không hiện giá trị
docker compose exec -e BAO_TOKEN="$TK" openbao bao kv patch dxos/core/db/flowable password="$(openssl rand -hex 16)"
make up                                                # db-init đặt lại mật khẩu role, agent render lại
docker compose --profile core up -d --no-deps --force-recreate flowable
```

Quy trình xoay vòng này mới kiểm bằng tay từng bước (chưa có trong `make smoke`).

### 4.5 Sự kiện hồ sơ qua RabbitMQ (#9)

RabbitMQ (MPL-2.0) chạy như **dịch vụ riêng bằng image gốc** `rabbitmq:4.3.6-alpine`, một nút, cấu hình `nen-tang/rabbitmq/` (D-004, `NOTICE`). Plugin bật: `rabbitmq_stomp` (cổng 61613, Tầng 2 phát/nhận) và `rabbitmq_management` (HTTP API quản trị 15672). **Không cổng nào mở ra host, không có route APISIX**: chỉ dịch vụ trong mạng nội bộ Docker gọi được. Danh mục sự kiện và payload: [`mot-cua/README.md`](../mot-cua/README.md#sự-kiện-hồ-sơ-rabbitmq-9).

#### 4.5.1 Thiết kế và lý do

| Quyết định | Lý do |
|---|---|
| **Ứng dụng phát sau khi gọi Flowable thành công**, qua **hộp thư đi (transactional outbox) trong PostgreSQL**, không dùng listener trong BPMN | Listener HTTP của Flowable phải cầm thông tin đăng nhập vào backend, chạy trong transaction của engine (lỗi mạng làm hỏng bước quy trình hoặc phát sự kiện cho bước đã rollback) và phải lặp lại trong mọi tệp BPMN. Backend đã đứng giữa người dùng và Flowable (§4.2) nên biết chắc bước nào vừa xong. Ghi vào bảng rồi `mot-cua-worker` mới phát nên request không phụ thuộc broker: RabbitMQ dừng → request vẫn 200, sự kiện chờ trong bảng |
| Phát **at-least-once**, consumer **chống trùng theo id** | Publisher chỉ đánh dấu `da_phat_luc` sau khi RabbitMQ trả RECEIPT (publisher confirm). Mất kết nối giữa RECEIPT và lúc đánh dấu → phát lại cùng id; consumer ghi `nhat_ky_su_kien` với khóa chính = id (`ON CONFLICT DO NOTHING`) |
| **Sắp trễ hạn** = tác vụ định kỳ trong `mot-cua-worker`, chống trùng bằng ràng buộc `UNIQUE` | Hạn xử lý đúng nằm trong CSDL (`ho_so.han_xu_ly`, tính theo ngày làm việc, có thể gia hạn), không phải trong biến Flowable. Mỗi `DXOS_SU_KIEN_QUET_GIAY` (300) giây: hồ sơ chưa xong (trạng thái không phải `hoan_tat`/`tu_choi` **và** còn quy trình đang chạy trong Flowable), chưa quá 17:00 ngày hạn, còn ≤ `DXOS_SU_KIEN_SAP_TRE_NGAY` (1) ngày làm việc (bỏ thứ Bảy, Chủ nhật, `ngay_nghi`) → ghi `ho_so.sap_tre_han` với `khoa_chong_trung = ho_so.sap_tre_han:<hồ sơ>:<hạn>`. Quét lại, chạy nhiều worker hay khởi động lại đều không phát trùng; gia hạn sang ngày khác thì được cảnh báo lại. Quá hạn đã có hẹn giờ trong BPMN (`quaHan`, #8) |
| **STOMP** thay vì AMQP 0-9-1 | Backend chỉ dùng thư viện chuẩn Python (không cài `pika`). STOMP là giao thức văn bản (`mot-cua/backend/stomp.py`, ~150 dòng) và RabbitMQ hỗ trợ đủ: SEND có `receipt` (sau publisher confirm), `ack: client-individual` + `prefetch-count`, NACK `requeue: false` → dead-letter |
| Lõi không biết tên exchange/queue nghiệp vụ | Bộ máy khai `rabbitmq/definitions.json`; `rabbitmq-init` tạo **vhost riêng** `mot-cua` và user `tang2-mot-cua`: không tag (bị HTTP API quản trị từ chối), configure `^$` (không tự khai báo/xóa exchange, queue), read/write trong vhost của mình |
| Sự kiện **không chứa dữ liệu cá nhân** | Chỉ id nội bộ + mã hồ sơ, mã lĩnh vực, mã thủ tục. Role `dich_vu_su_kien` chỉ được `SELECT` các cột `id, ma_ho_so, thu_tuc_id, trang_thai, han_xu_ly` của `ho_so` (quyền cột: đọc họ tên, số điện thoại, sub người nộp → 42501); `su_kien.kiem()` từ chối sự kiện có khóa như `hoTen`, `soDienThoai`, `nguoiNopSub` |

#### 4.5.2 Sơ đồ

```mermaid
sequenceDiagram
  autonumber
  participant App as Tầng 2 (JWT)
  participant BE as mot-cua-api
  participant FL as Flowable
  participant PG as PostgreSQL<br/>mot_cua.hop_thu_su_kien
  participant WK as mot-cua-worker
  participant MQ as RabbitMQ<br/>vhost mot-cua
  App->>BE: POST /workflow/tasks/{id}/complete
  BE->>FL: complete task (rest-admin)
  FL-->>BE: 200, bước kế tiếp
  BE->>PG: INSERT ho_so.chuyen_buoc (token dịch vụ mot_cua_su_kien)
  BE-->>App: 200 (không chờ broker)
  loop mỗi 2 giây
    WK->>PG: SELECT … WHERE da_phat_luc IS NULL
    WK->>MQ: STOMP SEND /exchange/mot_cua.su_kien/ho_so.chuyen_buoc (receipt)
    MQ-->>WK: RECEIPT (đã ghi vào queue bền vững)
    WK->>PG: UPDATE da_phat_luc = now()
  end
  MQ->>WK: MESSAGE từ queue mot_cua.nhat_ky (consumer mẫu)
  WK->>PG: INSERT nhat_ky_su_kien ON CONFLICT (su_kien_id) DO NOTHING
  WK->>MQ: ACK
  loop mỗi DXOS_SU_KIEN_QUET_GIAY
    WK->>PG: hồ sơ chưa xong, hạn ≤ 1 ngày làm việc
    WK->>FL: còn quy trình đang chạy?
    WK->>PG: INSERT ho_so.sap_tre_han ON CONFLICT (khoa_chong_trung) DO NOTHING
  end
```

Topology của `mot-cua` (`mot-cua/rabbitmq/definitions.json`):

```mermaid
flowchart LR
  P["mot-cua-worker<br/>(publisher)"] -->|"routing key = loại sự kiện"| EX{{"mot_cua.su_kien<br/>topic"}}
  EX -->|"ho_so.#"| Q[["mot_cua.nhat_ky<br/>quorum, delivery-limit 5"]]
  Q --> C["consumer mẫu<br/>→ nhat_ky_su_kien"]
  Q -. "NACK / quá 5 lần giao" .-> DLX{{"mot_cua.su_kien.loi<br/>fanout"}}
  DLX --> QL[["mot_cua.nhat_ky.loi"]]
```

Thêm consumer mới (thông báo, tuần 3): thêm queue + binding (ví dụ `ho_so.sap_tre_han`, `ho_so.chuyen_buoc`) vào `definitions.json`, `make up` (rabbitmq-init nạp), viết vòng nhận theo mẫu `worker.vong_nhan`. Mỗi consumer một queue riêng nên không lấy tin của nhau.

#### 4.5.3 Bí mật và quản trị

- Tài khoản quản trị khởi tạo `RABBITMQ_ADMIN` (mặc định `admin`), mật khẩu sinh ngẫu nhiên trong OpenBao `dxos/core/rabbitmq/admin`; agent `rabbitmq-secrets` render `default_user`/`default_pass` vào `/run/dxos-secrets/conf.d/20-admin.conf` (quyền 0400), RabbitMQ nạp cùng `nen-tang/rabbitmq/rabbitmq.conf` (`RABBITMQ_CONFIG_FILE` + `RABBITMQ_CONFIG_FILES`). Giống `POSTGRES_PASSWORD`, giá trị này **chỉ áp dụng khi volume `rabbitmq-data` còn trống**; đổi sau đó: `docker compose exec rabbitmq rabbitmqctl change_password admin '<mật khẩu mới>'` rồi đặt cùng giá trị vào OpenBao (§4.4.6).
- User Tầng 2: mật khẩu ở `dxos/tang2/mot-cua/rabbitmq`; đổi trong OpenBao rồi `make up` (rabbitmq-init đặt lại, worker đọc lại khi kết nối lại).
- `hostname: rabbitmq` cố định trong compose: tên nút `rabbit@rabbitmq` quyết định thư mục dữ liệu, tạo lại container không mất queue và tin bền vững.
- Xem nhanh: `docker compose exec rabbitmq rabbitmqctl -q list_queues -p mot-cua name type messages`.

### 4.6 Nhật ký kiểm toán chuỗi băm và pgAudit (#75)

Hai lớp, bổ sung cho nhau:

| Lớp | Ở đâu | Ghi gì | Chống gì |
|---|---|---|---|
| **Nhật ký kiểm toán nghiệp vụ** `mot_cua.nhat_ky_kiem_toan` | bộ máy `mot-cua` (migration 007): nghiệp vụ nên không nằm ở `nen-tang/` | mỗi thao tác quan trọng một bản ghi: nộp hồ sơ, chuyển trạng thái, cập nhật hồ sơ, xử lý bước quy trình (người xử lý), tải tệp (SHA-256 nội dung tệp), kiểm tra tệp, nạp/rút gói thủ tục, phân công lĩnh vực cán bộ | sửa, xóa, chèn lặng lẽ: chuỗi băm SHA-256 + xác minh được qua API |
| **pgAudit 17.1** (PostgreSQL License) | nền tảng: image `nen-tang/postgres/Dockerfile`, tham số khởi động của dịch vụ `postgres` | log PostgreSQL dòng `AUDIT: SESSION,…` cho lớp lệnh `DXOS_PGAUDIT_LOG` (mặc định `ddl,role`: đổi schema, role, quyền) và `AUDIT: OBJECT,…` cho mọi câu lệnh chạm bảng mà role `dxos_kiem_toan` có quyền (Tầng 2 tự GRANT bảng có dữ liệu cá nhân: `ho_so`, `thanh_phan_ho_so`, `can_bo`, `can_bo_linh_vuc`) | thao tác ngoài API (SQL quản trị, đổi quyền), truy cập dữ liệu cá nhân ở mức câu lệnh |

#### 4.6.1 Thiết kế và lý do

| Quyết định | Lý do |
|---|---|
| Ghi kiểm toán **bằng trigger và trong RPC**, cùng transaction với thao tác | Không đường nào (API, quy trình, đối soát, SQL tay) đổi hồ sơ mà thiếu bản ghi; thao tác rollback thì bản ghi cũng không có. Không cần sửa `mot-cua-api`: RPC `dong_bo_trang_thai` (#73) đã nhận người xử lý và bước, nay ghi thêm `quy_trinh.xu_ly_buoc` kèm các sự kiện vừa vào hộp thư đi |
| `bam = hex(SHA-256(bam_truoc ‖ nội dung chuẩn))`, nội dung chuẩn là văn bản `jsonb` của bản ghi, giờ UTC micro giây | `jsonb::text` ổn định (khóa sắp theo độ dài rồi byte), không phụ thuộc múi giờ hay cấu hình phiên, dựng lại được ngoài CSDL. Dùng `sha256()` có sẵn của PostgreSQL, không cần `pgcrypto` |
| **Khóa tuần tự** bằng dòng duy nhất `dau_chuoi_kiem_toan` (`SELECT … FOR UPDATE`) | Hai transaction ghi đồng thời không thể cùng đọc một `bam_truoc`: người sau chờ người trước commit rồi nối tiếp, `stt` liền, không trùng. Ở mức cô lập cao hơn READ COMMITTED thì báo lỗi tuần tự hóa thay vì làm đứt chuỗi. Đổi lại các transaction có ghi kiểm toán xếp hàng ở bước commit; request PostgREST ngắn nên chấp nhận được ở quy mô xã |
| Chặn `UPDATE`/`DELETE`/`TRUNCATE` bằng trigger, không role nào có quyền ghi | Trigger chặn cả superuser và chủ bảng. Superuser vẫn tắt được trigger: không ngăn được, nhưng **phát hiện được** (mục 4.6.2). Đầu chuỗi chỉ tiến đúng một bước tới bản ghi vừa thêm |
| Không ghi dữ liệu cá nhân vào nhật ký | `du_lieu` chỉ có mã hồ sơ, mã thủ tục, trạng thái, bước, **tên** cột đã đổi, SHA-256 tệp; không họ tên, số điện thoại, tên tệp. pgAudit tắt `log_parameter` nên log không chứa giá trị |
| Trình xác minh độc lập `mot-cua/backend/kiem_toan.py` | Người kiểm tra không phải tin hàm chạy trong chính CSDL được kiểm: công cụ (chỉ thư viện chuẩn Python) đọc bản ghi qua `/api` bằng token lãnh đạo, tự tính lại chuỗi, báo cùng định dạng với RPC |
| pgAudit biên dịch từ mã nguồn ghim SHA-256, chép sang image gốc `postgres:17.6-alpine` | Image gốc không có pgAudit; gói Alpine không khớp bản PostgreSQL tự biên dịch của image. Không sửa PostgreSQL, image cuối không có công cụ biên dịch. `test-sql` và CI vẫn dùng image gốc: migration không phụ thuộc pgAudit |

#### 4.6.2 Xác minh toàn vẹn

`GET /api/rpc/xac_minh_kiem_toan` (chỉ `lanh_dao`; công dân, cán bộ → 403) duyệt cả chuỗi theo `stt`, dừng ở chỗ hỏng đầu tiên:

```json
{"hopLe": false, "soBanGhi": 41, "sttCuoi": 41, "bamCuoi": "…", "dauChuoi": {"stt": 97, "bam": "…"},
 "loi": {"stt": 42, "loai": "noi_dung_bi_sua", "moTa": "Nội dung bản ghi 42 không khớp bam đã lưu"}}
```

| `loi.loai` | Nghĩa |
|---|---|
| `noi_dung_bi_sua` | bản ghi `stt` bị sửa (băm tính lại khác băm đã lưu) |
| `lien_ket_dut` | bản ghi trước bị sửa **và** tính lại băm (bản ghi `stt` không còn trỏ đúng), hoặc bản ghi `stt` bị thay |
| `thieu_ban_ghi` | bản ghi `stt` bị xóa (hở số thứ tự) |
| `dau_chuoi_lech` | bản ghi cuối bị xóa, hoặc có bản ghi chèn ngoài chuỗi |
| `moc_khong_khop` | chuỗi bị viết lại toàn bộ từ trước mốc: bản ghi `stt` khác mốc `p_stt_moc`/`p_bam_moc` đã lưu ở ngoài |

Kẻ có quyền superuser có thể viết lại toàn bộ chuỗi và đầu chuỗi cho khớp. Cách chặn: định kỳ lưu `sttCuoi:bamCuoi` ra ngoài hệ thống (biên bản, email, kho khác) rồi xác minh kèm mốc:

```bash
# Token lãnh đạo (có OTP) lấy như §8; mốc từ lần xác minh trước
DXOS_TOKEN=<token> python3 mot-cua/backend/kiem_toan.py --api http://localhost:9080/api --moc 41:<bam>
curl -H "Authorization: Bearer <token>" "http://localhost:9080/api/rpc/xac_minh_kiem_toan?p_stt_moc=41&p_bam_moc=<bam>"
# Log pgAudit
docker compose logs postgres | grep 'AUDIT:'
```

### 4.7 Giấy tờ có ký số: step-ca + Gotenberg + pyHanko (#77)

Hồ sơ được tiếp nhận vào quy trình thì có **biên nhận** (giấy tiếp nhận hồ sơ và hẹn trả kết quả), hoàn tất thì có **thông báo kết quả**: PDF ký số PAdES bằng chứng thư của xã, lưu trên Garage, SHA-256 vào nhật ký kiểm toán (§4.6). Sổ văn bản đến/đi dùng lại lớp này ở issue riêng (#78).

```mermaid
sequenceDiagram
  autonumber
  participant BAO as OpenBao
  participant CA as step-ca<br/>(CA nội bộ)
  participant CI as ca-init<br/>(một lần, mỗi make up)
  participant API as mot-cua-api
  participant GT as Gotenberg<br/>(Chromium)
  participant S3 as Garage
  participant PG as PostgreSQL
  CI->>BAO: AppRole ca-init: đọc mật khẩu provisioner
  CI->>CA: xin chứng thư ký tài liệu (JWK provisioner, mẫu ky-tai-lieu.tpl)
  CI->>BAO: ghi khóa + chuỗi chứng thư + root → dxos/tang2/mot-cua/ky-so
  Note over API: khởi tạo quy trình xong (biên nhận) / bước cuối hoàn tất (kết quả): luồng nền
  API->>BAO: AppRole tang2: đọc ky-so
  API->>GT: HTML từ mot-cua/mau-giay-to/ → PDF A4
  API->>API: pyHanko ký PAdES B-B (chuỗi chứng thư tới root)
  API->>S3: PUT ho-so/<id>/giay-to/<loai>-<uuid>.pdf
  API->>PG: INSERT giay_to_ky (dich_vu_tep) → trigger kiểm toán giay_to.ky + SHA-256
```

| Quyết định | Lý do |
|---|---|
| **step-ca làm CA nội bộ hai tầng** (root + intermediate), một provisioner JWK chỉ để ký tài liệu | Xã có CA riêng, không phụ thuộc dịch vụ ngoài; khóa CA mã hóa trong volume `step-ca-data`, mật khẩu ở OpenBao (`dxos/core/step-ca/ca`), không có khóa nào trong git. Mẫu `nen-tang/step-ca/ky-tai-lieu.tpl`: Key Usage `digitalSignature` + `contentCommitment` (chống chối bỏ), không phải CA, không có tên miền (không dùng được cho TLS), hạn 1 năm |
| **ca-init** cấp chứng thư rồi ghi vào OpenBao; backend chỉ đọc | Giống `garage-init` ghi khóa S3: danh tính `ca-init` chỉ đọc mật khẩu provisioner (không đọc mật khẩu khóa CA) và chỉ ghi `ky-so` của dịch vụ Tầng 2; `tang2` chỉ đọc. Chạy mỗi `make up`: còn hạn hơn 30 ngày, cùng tên và cùng root thì giữ; không thì cấp mới (khóa RSA 3072 mới) |
| **Gotenberg** bản chỉ có Chromium, không mở ra host, chặn mạng | Sinh PDF đúng bố cục giấy tờ hành chính từ HTML/CSS, phông Noto Serif có tiếng Việt sẵn trong image. Chromium bị cấm truy cập mọi địa chỉ mạng (`--chromium-deny-private-ips`, `--chromium-deny-public-ips`), tắt JavaScript, webhook, downloadFrom: mẫu tự chứa, không SSRF được qua nội dung hồ sơ |
| Mẫu trong **bộ máy** `mot-cua/mau-giay-to/`, nền tảng không biết giấy tờ nào | `nen-tang/` chỉ có dịch vụ (CA, Gotenberg). Dữ liệu đưa vào mẫu đã thoát HTML (họ tên người nộp không chèn được thẻ) |
| **pyHanko** ký trong `mot-cua-api`, PAdES B-B, một chữ ký phủ toàn bộ tệp | Thư viện MIT thuần Python; Adobe Reader và các phần mềm đọc PDF có hỗ trợ chữ ký số nhận ra chữ ký, tin cậy khi người dùng tin root của xã. Chưa có dấu thời gian (TSA) hay LTV: hiệu lực dựa vào thời hạn chứng thư và SHA-256 trong nhật ký kiểm toán |
| Phát hành **trong luồng nền** ngay sau Flowable, cộng endpoint "phát hành nếu chưa có" | Request nộp/xử lý không chậm thêm 1–3 giây và không lỗi khi Gotenberg hay CA tạm dừng; bấm tải sau đó phát hành lại. Mỗi hồ sơ một giấy tờ mỗi loại (`UNIQUE`), phát hành trùng thì xóa object thừa |
| Metadata ghi bằng tài khoản dịch vụ tệp, không sửa được, SHA-256 vào chuỗi kiểm toán | Người dùng không tự khai giấy tờ; thay tệp trên Garage thì SHA-256 không khớp CSDL và nhật ký kiểm toán; RLS: ai xem được hồ sơ thì xem được giấy tờ |

API (qua APISIX `/files`, token Keycloak):

| Endpoint | Làm gì |
|---|---|
| `POST /files/ho-so/{id}/giay-to/{bien_nhan\|ket_qua}` | phát hành nếu chưa có (201) hoặc trả bản đã có (200), kèm link tải ký sẵn ngắn hạn; hồ sơ chưa vào quy trình → 409 biên nhận; chưa hoàn tất → 409 kết quả; không xem được hồ sơ → 404 |
| `GET /files/ho-so/{id}/giay-to`, `GET /files/giay-to/{id}` | danh sách, metadata + link |
| `POST /files/xac-minh` (body PDF) | pyHanko kiểm chữ ký theo root của xã: `hopLe` = toàn vẹn + chữ ký đúng + tin cậy + phủ toàn bộ tệp; `phatHanh` = giấy tờ đã phát hành có cùng SHA-256 (nếu có) |

Kết quả xác minh mẫu (một byte bị sửa sau khi ký):

```json
{"hopLe": false, "coChuKy": true, "toanVen": false, "chuKyDung": true, "tinCay": true, "phuToanBo": true,
 "nguoiKy": "UBND xã Mẫu – Bộ phận Một cửa", "loi": "Nội dung đã bị sửa sau khi ký", "phatHanh": null, "sha256": "…"}
```

Vận hành: đổi tên cơ quan (`DXOS_KY_SO_TEN`) rồi `make up` → chứng thư mới. Mất volume `step-ca-data` = CA mới: giấy tờ đã ký trước đó vẫn toàn vẹn nhưng không còn tin cậy khi xác minh, nên sao lưu volume này cùng OpenBao. Mật khẩu khóa CA chỉ dùng lúc khởi tạo; đổi trong OpenBao sau đó thì step-ca không mở được khóa.

## 5. MFA cho cán bộ

- Hiện tại: chính sách OTP (TOTP 6 số, 30 giây) nằm ở realm lõi; bộ máy một cửa quyết định ai bị bắt OTP. Người dùng mẫu `canbo01`, `lanhdao01` của `mot-cua` có required action `CONFIGURE_TOTP`, nên lần đăng nhập đầu phải quét mã QR bằng ứng dụng OTP (FreeOTP, Google Authenticator…). Từ lần sau, luồng browser mặc định của Keycloak hỏi OTP vì người dùng đã cấu hình.
- Tuần 2: thay bằng luồng xác thực riêng có "Condition – user role": mọi người có role `can_bo`/`lanh_dao` đều bị hỏi OTP, kể cả tài khoản tạo mới chưa có required action. Cần cấu hình tương tự cho luồng direct grant.
- Client lõi `dxos_cli` bật password grant chỉ để thử bằng curl và `make smoke` trong môi trường dev; tắt khi triển khai thật.
- `make smoke` kiểm luồng có OTP thật (#5): tạo người dùng tạm role `can_bo`/`lanh_dao` có sẵn credential OTP (Partial Import qua stdin), chỉ mật khẩu → không có token, mật khẩu + mã TOTP sinh trong script → có token, gọi API qua APISIX, rồi xóa người dùng tạm.

## 6. Chia profile docker-compose

| Profile | Dịch vụ | Trạng thái | Ghi chú tài nguyên |
|---|---|---|---|
| `core` | PostgreSQL, Keycloak, PostgREST, APISIX (+ dịch vụ một lần `jwks-init`, `tang2-migrate`, `tang2-realm`) | chạy thử 17/10 và 20/10/2026 | mục tiêu laptop 16 GB |
| `core` | Flowable REST (+ dịch vụ một lần `db-init`, trước #10 là `flowable-db-init`) | chạy thử 20/10/2026 (#8) | JVM `-Xmx512M` |
| `core` | `mot-cua-api`, `mot-cua-worker`, `nap-thu-tuc` (bộ máy một cửa, image `python` gốc) | chạy thử 21/10/2026 (#6) | ~20 MB RAM |
| `core` | Garage (+ dịch vụ một lần `garage-secrets`, `garage-init`), ClamAV | chạy thử 21/10/2026 (#7) | Garage ~30 MB RAM; ClamAV ~1–1,5 GB RAM cho CSDL virus |
| `core` | OpenBao (+ dịch vụ một lần `bao-init`, 5 agent `*-secrets`) | chạy thử 21/10/2026 (#10) | agent chạy khoảng 1 giây rồi thoát, không giữ RAM |
| `core` | RabbitMQ (+ dịch vụ một lần `rabbitmq-secrets`, `rabbitmq-init`), `mot-cua-worker` | chạy thử 21/10/2026 (#9) | RabbitMQ ~150 MB RAM, chặn publisher ở 40% RAM; `mot-cua-worker` ~20 MB |
| `core` | step-ca (+ dịch vụ một lần `step-ca-secrets`, `ca-init`), Gotenberg | chạy thử 23/10/2026 (#77) | đo 23/10/2026: step-ca ~70 MB RAM; Gotenberg (Chromium) ~470 MB sau khi sinh PDF, image ~1,7 GB; image `mot-cua-api` 157 MB (thêm pyHanko ~55 MB) |
| `docs` | Meilisearch CE | TODO tuần 5 | |
| `ai` | Ollama + Qwen2.5 7B, PaddleOCR/VietOCR | TODO tuần 5 | cần ~8 GB RAM |
| `bi` | Apache Superset | TODO tuần 4 | |

Chạy: `make up` (= `docker compose --profile core up -d`), kiểm tra: `make smoke`. Thêm profile: `docker compose --profile core --profile docs up -d`.
Mọi image ghim phiên bản cụ thể, lấy từ dự án gốc (bảng ở `DEPENDENCIES.md`). Cấu hình qua `.env` (mẫu `.env.example`).

## 7. Viết BPMN khi không có modeler

D-004: image `flowable-ui` (có modeler) dừng ở 6.8.0 (2022), bpmn-js bị cấm vì giấy phép bpmn.io không phải OSI. Cách làm:

1. Viết tay tệp `thu-tuc/<ma>/quy-trinh.bpmn20.xml` của gói thủ tục ([`docs/thu-tuc.md`](thu-tuc.md)) theo chuẩn BPMN 2.0, namespace `http://www.omg.org/spec/BPMN/20100524/MODEL` và `http://flowable.org/bpmn`. Dòng thứ 2–3 là `<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->` và `<!-- SPDX-License-Identifier: GPL-3.0-or-later -->` (`make license` tự thêm sau khai báo `<?xml ?>`).
2. Chỉ dùng tập phần tử nhỏ: `startEvent`, `userTask` (có `flowable:candidateGroups` = mã lĩnh vực của thủ tục hoặc `lanh_dao`, biến người xử lý đặt khai bằng `flowable:formProperty`), `serviceTask`, `exclusiveGateway`, `boundaryEvent` + `timerEventDefinition` cho cảnh báo trễ hạn, `endEvent`.
3. Không cần phần `bpmndi` (tọa độ vẽ): Flowable chạy được khi thiếu phần này. Sơ đồ cho tài liệu và slide vẽ bằng Mermaid `flowchart` đặt cạnh tệp XML.
4. Kiểm tra hai lớp: `make check` (và CI) chạy `scripts/check-bpmn.py` và bộ nạp ở chế độ `--chi-kiem` (cùng luật `mot-cua/backend/kiem_bpmn.py`) – XML hợp lệ, id không trùng, mũi tên trỏ đúng phần tử, nút nào cũng có đường vào/ra, gateway có `default` và điều kiện, userTask có người nhận, biến có kiểu hợp lệ; khi deploy, Flowable từ chối tệp sai ngữ nghĩa và bộ nạp bỏ qua gói đó (`make smoke` kiểm quy trình đã lên và chạy được).
5. Triển khai: `make nap-thu-tuc` (không cần khởi động lại Flowable; BPMN không đổi thì không deploy lại). Không gọi REST `repository/deployments` tay để tránh hai nguồn sự thật.
6. Khi số quy trình tăng: nhiều thủ tục dùng chung một mẫu quy trình (tiếp nhận → thẩm định → phê duyệt) có thể sinh `quy-trinh.bpmn20.xml` từ `thu-tuc.yaml` bằng script Python của đội; gói vẫn là đơn vị cắm–rút.

## 8. Chạy thử

Cách nhanh nhất: `make up` rồi `make smoke` (`scripts/smoke.sh` + `mot-cua/tests/smoke*.sh`). Smoke đặt mật khẩu ngẫu nhiên cho người dùng mẫu (realm không chứa mật khẩu), không in mật khẩu hay token, không xóa dữ liệu có sẵn (chỉ xóa người dùng và cán bộ tạm do chính smoke tạo); mỗi lần chạy thêm một hồ sơ thử của `congdan01`. Kết quả gần nhất ở mục 8.3. Thử tay từng bước:

```bash
cp .env.example .env            # không có mật khẩu nào cần điền
make up
docker compose ps -a            # postgres, keycloak, apisix "healthy"; jwks-init, tang2-migrate, tang2-realm "Exited (0)"

# 1. Không token → 401 từ APISIX
curl -i http://localhost:9080/api/ho_so

# 2. Đọc công khai (role anon), giới hạn 60 request/phút/IP
curl -i http://localhost:9080/public/thu_tuc

# 3. Đặt mật khẩu cho người dùng mẫu (realm không chứa mật khẩu; scripts/demo-users.sh dùng
#    tài khoản quản trị Keycloak đọc từ tệp bí mật trong container, nguồn là OpenBao)
DXOS_DEMO_PASSWORD='mat-khau-thu-nghiem' make demo-users

# 4. Lấy token công dân và gọi lại → 200, danh sách rỗng (công dân mới chưa có hồ sơ)
TOKEN=$(curl -s http://localhost:8080/realms/dxos/protocol/openid-connect/token \
  -d grant_type=password -d client_id=dxos_cli \
  -d username=congdan01 -d password='mat-khau-thu-nghiem' | jq -r .access_token)
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:9080/api/ho_so

# 5. Nộp hồ sơ → 201 (mã hồ sơ, hạn xử lý do CSDL tính); gọi lại bước 4 → thấy đúng hồ sơ của mình
TT=$(curl -s 'http://localhost:9080/public/thu_tuc?ma=eq.KS01&select=id' | jq -r '.[0].id')
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  -d "{\"thu_tuc_id\":\"$TT\",\"ho_ten_nguoi_nop\":\"Nguyễn Văn Mẫu\"}" http://localhost:9080/api/ho_so

# 5b. Danh mục kèm thành phần hồ sơ, JSON Schema cho Poka-yoke (không cần token)
curl -s 'http://localhost:9080/public/thu_tuc?select=ma,ten,so_ngay_xu_ly,thanh_phan_yeu_cau(ma,ten,bat_buoc)'
curl -s 'http://localhost:9080/public/rpc/json_schema_thu_tuc?ma=KS01'

# 5c. Nộp hồ sơ và khởi tạo quy trình khai sinh trong một lời gọi qua /workflow (§4.2), xem task, tiến độ
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"thu_tuc_id\":\"$TT\",\"ho_ten_nguoi_nop\":\"Nguyễn Văn Mẫu\"}" http://localhost:9080/workflow/ho-so | jq
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:9080/workflow/tasks | jq
# API quản trị Flowable không mở qua gateway → 403
curl -i http://localhost:9080/workflow/repository/deployments

# 6. Token sai chữ ký → 401
curl -i -H "Authorization: Bearer ${TOKEN%?????}AAAAA" http://localhost:9080/api/ho_so

# 7. Chạy lại migration và vai trò Keycloak → bỏ qua phần đã áp dụng, không lỗi
make migrate
```

Người dùng `canbo01`, `lanhdao01` phải cài OTP trước khi lấy được token: đăng nhập một lần qua trình duyệt (client `mot_cua_web`) và quét mã QR, sau đó gửi thêm `-d totp=<mã 6 số>` khi lấy token bằng `dxos_cli`. Lưu ý: gõ sai hai lần trong vòng 1 giây sẽ bị khóa tạm 60 giây (brute-force protection của realm).

### 8.1 Kết quả chạy thử 17/10/2026

Bản tuần 1, trước khi tách lõi: realm `commune`, client `commune_api`/`commune_cli`, route công khai `/api/thu_tuc`.

| Kiểm tra | Kết quả |
|---|---|
| Khởi động | `postgres`, `keycloak`, `apisix` healthy; `jwks-init` Exited (0); `postgrest` chạy, APISIX báo upstream `healthy` qua `/ready` |
| JWKS | chỉ có 1 khóa `RS256`, `"use":"sig"` |
| Claim token công dân | `iss=http://localhost:8080/realms/commune`, `aud=commune_api`, `resource_access.commune_api.roles=["cong_dan"]` |
| `/api/ho_so` không token / token sửa chữ ký / token hợp lệ | **401 / 401 / 200** |
| Gọi thẳng PostgREST (bỏ qua APISIX) không token hoặc token sửa chữ ký | 401 / 401 |
| MFA (Admin REST API) | `canbo01`, `lanhdao01`: `requiredActions=["CONFIGURE_TOTP"]`; `congdan01`: `[]` |
| MFA (token endpoint) | `congdan01` lấy được token; `canbo01`, `lanhdao01`: `invalid_grant – Account is not fully set up` |
| MFA (trình duyệt) | sau mật khẩu, Keycloak hiện trang cài OTP; sau khi cài: không gửi OTP → `Invalid user credentials`, OTP đúng → có token |
| RLS `anon` | `/api/thu_tuc` 200 (3 dòng); `ho_so` bị chặn (401) |
| RLS `cong_dan` | trước khi nộp `[]`; POST → 201, `nguoi_nop_sub` = `sub` của token; GET sau đó chỉ thấy 1 hồ sơ của mình; tự đặt `trang_thai` → 403; PATCH → 403 |
| RLS `can_bo` | thấy cả 3 hồ sơ; PATCH `trang_thai` → 200; PATCH hồ sơ đã `hoan_tat` → `[]` (policy chặn); POST → 403 |
| RLS `lanh_dao` | thấy cả 3 hồ sơ; PATCH → 403 |
| Rate limit `/api/thu_tuc` | 62 request liên tiếp: 59 × 200, 3 × 429 |

Đã sửa sau lần chạy đầu:
- Cổng PostgreSQL mặc định trên host đổi từ 5432 sang 55432 (máy dev thường đã có PostgreSQL chiếm cổng 5432).
- PostgREST v13.0.4 không có cờ `--ready`, và image amd64 dựng `FROM scratch` (không có shell), nên bỏ healthcheck Docker của `postgrest`. APISIX kiểm chủ động `http://postgrest:3001/ready` (khối `checks` của upstream).

### 8.2 Kết quả chạy thử 20/10/2026 (sau khi tách `core/` và `apps/`, #3)

Docker Desktop, macOS arm64, project tạm `COMPOSE_PROJECT_NAME=commune-r9` (volume trống), `DXOS_APP=mot-cua`, `DXOS_SEED=true`. `make up` xong trong khoảng 25 giây (image đã tải); `make smoke`: **45 đạt, 0 trượt**.

| Kiểm tra | Kết quả |
|---|---|
| Khởi động từ volume trống | `postgres`, `keycloak`, `apisix` healthy; `jwks-init`, `app-migrate`, `app-realm` Exited (0) |
| `app-migrate` lần 1 | áp dụng `migration 001_schema_mot_cua.sql`, `seed 001_du_lieu_mau.sql`; PostgREST nạp 2 bảng của `mot_cua` |
| `app-realm` lần 1 | `added=10` (3 client role, 3 nhóm, 1 client, 3 người dùng) |
| Lõi không chứa nghiệp vụ | schema `dxos` chỉ có bảng `app_migration`; realm lõi không có role hay người dùng |
| Chạy lại (`make migrate`, smoke) | `app-migrate`: mã 0, bỏ qua cả 2 tệp; `app-realm`: mã 0, `added=0 skipped=10` |
| Tệp migration đã áp dụng bị sửa (giả lập bằng cách đổi `sha256` trong sổ) | `app-migrate` dừng, mã 1, báo phải viết migration mới |
| JWKS realm `dxos` | 1 khóa `RS256`, `use=sig` |
| `/api/ho_so` không token / token sửa chữ ký / token công dân | **401 / 401 / 200** |
| `/api/` token rác (route lõi, không gắn tài nguyên) | 401 |
| Claim token công dân | `iss=http://localhost:8080/realms/dxos`, `aud` chứa `dxos_api`, `resource_access.dxos_api.roles=["cong_dan"]` |
| MFA | `canbo01`, `lanhdao01`: `requiredActions=["CONFIGURE_TOTP"]`, lấy token bằng mật khẩu → `Account is not fully set up`; `congdan01`: `[]`, lấy được token |
| RLS `anon` | `/public/thu_tuc` 200 (3 dòng); `/public/ho_so` 401; POST `/public/ho_so` 404 (route chỉ GET); `SET ROLE anon` → `permission denied for table ho_so` |
| RLS `cong_dan` (qua APISIX) | POST → có id, `nguoi_nop_sub` = `sub` của token; GET thấy thêm đúng 1 hồ sơ, mọi dòng đều của mình; tự đặt `trang_thai` → 403; PATCH → 403; trong CSDL với `sub` giả `…c001` → 1 dòng |
| RLS `can_bo` (trong CSDL) | thấy tất cả; đóng hồ sơ đang mở → 1 dòng, sửa tiếp hồ sơ đã đóng → 0 dòng (transaction rồi ROLLBACK); INSERT → `permission denied` |
| RLS `lanh_dao` (trong CSDL) | thấy tất cả; UPDATE → `permission denied` |

`can_bo`, `lanh_dao` bắt buộc OTP nên smoke không lấy được token của hai vai trò này; RLS của chúng được kiểm trong CSDL bằng `SET ROLE` + `request.jwt.claims`, đúng cách PostgREST làm cho mỗi request. Luồng có OTP qua trình duyệt đã kiểm tay ngày 17/10 (mục 8.1). Từ #5 smoke kiểm cả hai vai trò này qua APISIX bằng TOTP (mục 8.3).

### 8.3 Kết quả chạy thử 20/10/2026 (schema đầy đủ của `mot-cua`, #5)

Docker Desktop, macOS arm64, `DXOS_APP=mot-cua`, `DXOS_SEED=true`. Ba lần chạy, mỗi lần `make smoke` **126 đạt, 0 trượt** (63 kiểm tra SQL/RLS + kiểm tra lõi + kiểm tra qua API):

| Lần chạy | `app-migrate` | `app-realm` |
|---|---|---|
| Volume trống (project tạm `commune-i5`) | áp dụng migration 001, 002, seed 002 | `added=13` (3 role, 3 nhóm, 1 client, 6 người dùng có `id` cố định) |
| Chạy lại trên volume cũ (`make down` rồi `make up`) | bỏ qua cả 3 tệp | `added=0 skipped=13` |
| Nâng cấp volume v0.0.1 (project `commune-r9`, tạo từ bản #3) | bỏ qua 001, áp dụng 002 + seed 002 | `added=3 skipped=10` (thêm `congdan02`, `canbo02`, `canbo03`) |

Kiểm tra qua APISIX → PostgREST bằng token thật:

| Vai trò | Kết quả |
|---|---|
| `anon` | `/public/thu_tuc` 200, đúng 6 thủ tục công khai; embed `thanh_phan_yeu_cau` 200; `/public/rpc/json_schema_thu_tuc` trả schema đúng thủ tục; `/public/ho_so`, `/public/can_bo` 401; POST 404 |
| `cong_dan` (mật khẩu) | POST hồ sơ → có id, `nguoi_nop_sub` = `sub`, trạng thái `moi`, mã `HS…`, có hạn; GET chỉ hồ sơ của mình, đúng số dòng; tự đặt `trang_thai` → 403; PATCH hồ sơ đã nộp → 0 dòng; PATCH cột cấm → 403; đính kèm giấy tờ → 201; `/api/can_bo` → 403 |
| `can_bo` (mật khẩu + TOTP, người dùng tạm) | chỉ mật khẩu → không có token; có OTP → token role `can_bo`; GET chỉ hồ sơ thuộc lĩnh vực phụ trách, đúng số dòng; nhận xử lý → `dang_xu_ly`, tự giao cho mình; PATCH hồ sơ lĩnh vực khác → 0 dòng; chuyển trạng thái sai → 400; POST → 403 |
| `lanh_dao` (mật khẩu + TOTP, người dùng tạm) | GET thấy tất cả hồ sơ; PATCH → 403; POST → 403 |

Dung lượng ổ hệ thống: 11 GB trống trước khi chạy, 8,6 GB sau khi `make down` + `docker image prune -a -f` + `docker builder prune -f` (Docker Desktop không trả ngay dung lượng của tệp đĩa ảo).

### 8.4 Kết quả chạy thử 20/10/2026 (Flowable + quy trình khai sinh, #8)

Docker Desktop, macOS arm64, image `flowable/flowable-rest:8.0.0` (arm64, 172 MB). Ba lần chạy, mỗi lần `make smoke` **147 đạt, 0 trượt**:

| Lần chạy | Kết quả |
|---|---|
| Volume trống (project tạm `commune-i8`) | `flowable-db-init` tạo role + CSDL `flowable`; Flowable healthy sau khoảng 40 giây, triển khai `dang_ky_khai_sinh` phiên bản 1, không có quy trình demo |
| Chạy lại (`make down` → `make up`) | vẫn 1 deployment, phiên bản 1 (tệp không đổi) |
| Volume có sẵn tạo trước khi có Flowable (`commune-i5`) | `flowable-db-init` tạo CSDL còn thiếu, không cần xóa volume |

Quy trình qua REST (cổng debug `127.0.0.1:8090`): hồ sơ KS01 do công dân nộp qua APISIX → khởi tạo với `businessKey` = mã hồ sơ → `tiep_nhan` (nhóm `ho_tich`) → thiếu thành phần → `bo_sung` (giao đúng `sub` người nộp) → `tiep_nhan` → `tham_dinh` → `phe_duyet` (nhóm `lanh_dao`) → kết thúc `ket_thuc_hoan_tat`, `ketQua=hoan_tat`. Nhánh thẩm định không đạt → `ket_thuc_tu_choi`. Hạn đã qua → hẹn giờ không ngắt quy trình đặt `quaHan=true` trong khoảng 2 giây, task vẫn mở. REST không đăng nhập → 401; CSDL ứng dụng không có bảng `act_*`.

### 8.5 Kết quả chạy thử 21/10/2026 (route gateway + `/workflow`, #6)

Docker Desktop, macOS arm64. Ba lần chạy, mỗi lần `make smoke` **199 đạt, 0 trượt**: volume trống (project tạm `commune-i6`), chạy lại (`make down` → `make up`), volume có sẵn tạo trước khi có `app-backend` (`commune-i8`, không cần xóa volume).

| Route | Kiểm | Kết quả |
|---|---|---|
| `/api/*`, `/workflow/*`, `/files/*` | không token; token rác; token sửa chữ ký | 401 |
| `/api/*` | token công dân, cán bộ (mật khẩu + TOTP), lãnh đạo (mật khẩu + TOTP) | đúng quyền theo RLS (§8.3) |
| `/public/*` | không token: danh mục thủ tục, JSON Schema; hồ sơ, cán bộ | 200; 401 |
| `/public/*` | dùng hết 60 request/phút | 429; `/api` không bị ảnh hưởng |
| `/workflow/ho-so` | công dân nộp hồ sơ KS01, CT01 theo luồng tạo hồ sơ → tải tệp → `…/khoi-tao` | 201, quy trình ở `tiep_nhan`, tệp hiện trong `GET /files/ho-so/{id}/tep`, hồ sơ trong CSDL có người nộp = `sub`, trạng thái `moi`; khởi tạo lại → 409; gọi thẳng `…/khoi-tao` khi thiếu tệp → 422 nêu đúng thành phần thiếu, Flowable không có quy trình, không có sự kiện; `POST /workflow/ho-so` KS01 (cần giấy tờ) → 422, không lưu hồ sơ; thủ tục chưa có quy trình → 422; cán bộ, lãnh đạo nộp → 403 |
| `/workflow/ho-so/{id}/…` | công dân với hồ sơ người khác | 404 (RLS) |
| `/workflow/tasks` | cán bộ chưa/đã được giao lĩnh vực hộ tịch; lãnh đạo; công dân | không thấy/thấy task `tiep_nhan`; số task = số task của các nhóm lĩnh vực phụ trách; lãnh đạo chỉ thấy `phe_duyet`; công dân chỉ thấy `bo_sung` của mình |
| `/workflow/tasks/{id}/complete` | đi hết quy trình bằng token thật | tiep_nhan (thiếu) → bo_sung (công dân) → tiep_nhan → tham_dinh → phe_duyet (lãnh đạo) → `ket_thuc_hoan_tat`; Flowable ghi người xử lý = `sub` cán bộ; biến sai bước hoặc thiếu biến → 400; công dân làm bước của cán bộ, cán bộ làm bước của công dân/lãnh đạo → 403; task đã xong → 404 |
| `/workflow/{repository,management,identity,runtime,query}/…`, `/flowable-rest/…` | gọi kèm cả Basic auth `rest-admin` | 403 |
| `app-backend` gọi thẳng trong mạng nội bộ | token đúng; sửa chữ ký; sửa payload đổi role | 200; 401; 401 |
| CORS | origin `DXOS_CORS_ORIGINS`; preflight `/api`; origin lạ | có header; 200; không có header |
| Cổng host | PostgREST, `app-backend`; Flowable | không mở; chỉ `127.0.0.1` |

Dung lượng ổ hệ thống: 11 GB trống trước khi kéo image, 4,6 GB sau khi `make down` + `docker image prune -a -f` + `docker builder prune -f` (Docker Desktop chưa trả dung lượng tệp đĩa ảo).

### 8.6 Kết quả chạy thử 21/10/2026 (Garage + ClamAV + API tệp, #7)

Docker Desktop, macOS arm64. Ba lần chạy, mỗi lần `make smoke` **277 đạt, 0 trượt**: volume trống (project tạm `commune-i7`), chạy lại trên cùng volume, volume có sẵn tạo trước khi có Garage (`commune-i6`: migration 003 tự áp dụng, `app-realm` thêm client dịch vụ, không cần xóa volume). `make test`: 17 test đơn vị (tên/đuôi/Content-Type, magic bytes, quy tắc quyền, SigV4 theo ví dụ chính thức của AWS, giao thức `clamd`). `db/tests/rls.sql` thêm kiểm tra cho `dich_vu_tep` và nhật ký tệp.

| Kiểm (qua APISIX) | Kết quả |
|---|---|
| Công dân tải PDF hợp lệ (tên tiếng Việt) | 201; Garage có object `ho-so/<id>/<uuid>.pdf`; dòng `thanh_phan_ho_so` có sha256, kích thước, người tải = `sub`, `ket_qua_quet=sach`, phiên bản ClamAV |
| Tệp mẫu EICAR (đặt tên `.pdf`) | 422 kèm tên mẫu virus; không có object, không có dòng metadata; nhật ký `tu_choi_ma_doc` có `sub`, sha256, tên mẫu |
| Tệp giả mạo (đuôi `.pdf`, nội dung HTML); PDF khai `image/png`; PDF đặt tên `.png`; đuôi `.exe` | 415; tệp giả mạo có nhật ký `tu_choi_loai_tep`, không có object |
| Tệp 11 MiB | 413 ở gateway |
| Thành phần yêu cầu không thuộc thủ tục | 400, object vừa lưu bị xóa (không để object mồ côi) |
| Cán bộ, lãnh đạo tải lên; công dân khác tải vào hồ sơ không phải của mình; hồ sơ đang xử lý | 403; 403; 404; 409 |
| Công dân ghi thẳng metadata qua `/api/thanh_phan_ho_so` | 403 |
| Xem tệp: công dân chủ hồ sơ, cán bộ đúng lĩnh vực, lãnh đạo | 200, link tải đúng nội dung (sha256), `Content-Type: application/pdf`, `nosniff` |
| Xem tệp: công dân khác; cán bộ sau khi bỏ phân công lĩnh vực; tệp không tồn tại; không token | 403; 403; 404; 401 |
| Link: sửa chữ ký; đổi sang object khác; không chữ ký; `PUT /files/s3/…`; `ttl` vượt giới hạn | 403; 403; 403; 401; 400 |
| Link `ttl=1`, gọi sau 3 giây | 400 `Date is too old` (không tải được) |
| Hạ tầng | Garage, ClamAV healthy, không mở cổng ra host; Admin API không token → 403; khóa ứng dụng chỉ RW trên `mot-cua-ho-so`, không tạo được bucket; `s3.json` quyền 600, khóa không nằm trong biến môi trường; `garage-init` lần 2 không tạo thêm gì |

Dung lượng ổ hệ thống: 11 GB trống trước khi kéo image, 1,3 GB sau khi `make down` + xóa volume project tạm + `docker image prune -a -f` + `docker builder prune -f` (Docker Desktop không trả dung lượng tệp đĩa ảo cho macOS; cần dọn trước khi chạy lại).

### 8.7 Kết quả chạy thử 21/10/2026 (OpenBao giữ bí mật dịch vụ, #10)

Docker Desktop, macOS arm64, OpenBao 2.7.1. Mỗi lần chạy `make smoke` **328 đạt, 0 trượt** (277 kiểm tra cũ + 51 kiểm tra mới: dịch vụ một lần `bao-init`, 5 agent, `db-init` thoát mã 0, `openbao` healthy, và `scripts/smoke-openbao.sh`).

| Kịch bản | Kết quả |
|---|---|
| Volume trống (project tạm `commune-b10`), `.env` = `.env.example` (không mật khẩu nào) | `make up` một lệnh: init (1 phần khóa), unseal, KV v2, AppRole, 7 bí mật lõi sinh ngẫu nhiên, 8 AppRole; mọi dịch vụ healthy; smoke 328/328 |
| Chỉ khởi động lại OpenBao (`docker compose restart openbao`) | seal; agent `db-secrets` thoát mã 1 sau ~0,5 giây (fail-closed); `make up` unseal lại, giữ nguyên secret_id |
| `make down` rồi `make up` (giữ volume) | unseal tự động, không sinh bí mật mới; smoke 328/328 |
| Volume tạo bằng `develop` trước #10 (project tạm `commune-b10m`, `.env` cũ có 6 mật khẩu, đã chạy smoke cũ 277/277 để có dữ liệu) | `make up`: 6 mật khẩu chuyển từ `.env`, `rpc_secret`/`admin_token` lấy từ volume `garage-secrets` cũ, xóa `s3.json` và `keycloak-mot_cua_tep.secret` dạng rõ trong `app-secrets`; xóa 6 dòng mật khẩu khỏi `.env`, `make up` lại: smoke 328/328, 16 hồ sơ cũ còn nguyên |
| Policy (27 cặp danh tính × đường dẫn bằng AppRole thật) | đúng ma trận §4.4.3, ví dụ `postgrest` đọc `core/db/postgres` → 403, `app` đọc `apps/ung-dung-khac/s3` → 403, `garage-init` ghi `core/garage` → 403 |
| Cấu hình container | không biến môi trường nào chứa mật khẩu/secret/token ở 9 dịch vụ dùng bí mật; tệp render quyền 0400; tệp unseal key quyền 600 và bị git bỏ qua |
| Nhật ký kiểm toán | có dòng đọc `dxos/data/core/flowable/rest-admin`; mật khẩu dạng rõ không xuất hiện trong log OpenBao |
| Quét repo | mọi giá trị bí mật của hai project tạm (KV, root token, unseal key, mật khẩu `.env` cũ) không xuất hiện trong tệp nào mà git theo dõi hoặc chưa bị ignore |

Dung lượng ổ hệ thống: 8,4 GB trống trước khi kéo image, 4,4 GB sau khi `make down` + `down -v` hai project tạm + `docker image prune -a -f` + `docker builder prune -f` (Docker Desktop không trả dung lượng tệp đĩa ảo cho macOS).

### 8.8 Kết quả chạy thử 21/10/2026 (sự kiện hồ sơ qua RabbitMQ, #9)

Docker Desktop, macOS arm64, RabbitMQ 4.3.6. Mỗi lần chạy `make smoke` **405 đạt, 0 trượt** (328 kiểm tra cũ + 77 mới: dịch vụ một lần `rabbitmq-secrets`, `rabbitmq-init`, `rabbitmq` và `app-worker` healthy, 11 cặp policy OpenBao mới, 22 kiểm tra SQL/RLS của `dich_vu_su_kien`, `scripts/smoke-rabbitmq.sh`, `apps/mot-cua/tests/smoke-su-kien.sh`). `make test`: 53 test đơn vị (36 mới).

| Kịch bản | Kết quả |
|---|---|
| Volume trống (project tạm `commune-e9`), `make up` một lệnh | `rabbitmq-init`: tạo vhost `mot-cua`, user `app-mot-cua`, 2 exchange, 2 queue, 2 binding, ghi thông tin kết nối vào OpenBao; mọi dịch vụ healthy; smoke 405/405, chạy lại 405/405 |
| `make down` rồi `make up` (giữ volume) | `rabbitmq-init` không tạo lại gì; queue và 57 dòng nhật ký sự kiện còn nguyên; smoke 405/405 |
| Volume tạo bằng `develop` 29ce3df (project tạm `commune-e9m`, đã chạy smoke cũ 328/328 để có dữ liệu), chuyển sang nhánh #9 | `bao-init` sinh mật khẩu `core/rabbitmq/admin`, cấp 2 AppRole mới; `app-migrate` chỉ áp dụng `004_su_kien.sql`; `app-realm` thêm 3 đối tượng (role, client, service account); 11 hồ sơ cũ còn nguyên; smoke 405/405 |
| Công dân nộp hồ sơ khai sinh qua `/workflow`, cán bộ/công dân/lãnh đạo đi hết quy trình (mục 4d) | consumer nhận đúng `ho_so.moi` ×1, `ho_so.chuyen_buoc` ×5 (tiep_nhan→bo_sung→tiep_nhan→tham_dinh→phe_duyet), `ho_so.hoan_tat` ×1; 7/7 dòng hộp thư đã phát, id khớp nhật ký; không có họ tên, số điện thoại hay `sub` người nộp trong sự kiện |
| Thẩm định không đạt | `ho_so.tu_choi` |
| Đẩy hạn một hồ sơ về ngày làm việc kế tiếp, quét 3 lần | lần 1 tạo cảnh báo, lần 2, 3 tạo 0; đúng 1 `ho_so.sap_tre_han` (`conLaiNgayLamViec` 1) trong hộp thư và nhật ký; ghi trùng khóa → CSDL bỏ qua |
| Tin sai định dạng phát vào exchange | consumer NACK → queue `mot_cua.nhat_ky.loi` +1, không ghi nhật ký |
| `docker compose stop rabbitmq`, cán bộ hoàn thành task | request 200; sự kiện nằm trong hộp thư, chưa phát; `app-worker` thử lại có giãn cách (1, 2, 4 giây…); `start rabbitmq` → phát và consumer nhận đúng 1 lần, queue trống, hộp thư không còn dòng chưa phát |
| Management | không cổng host (15672, 61613 → không kết nối được), không route APISIX (`/rabbitmq/…` → 404); trong mạng nội bộ quản trị → 200, user ứng dụng → 401; không có user `guest`; user ứng dụng chỉ có quyền trong vhost `mot-cua`, configure `^$` |

Dung lượng ổ hệ thống: 10 GB trống trước khi kéo image, 5,6 GB sau khi `make down` + `down -v` hai project tạm + `docker image prune -a -f` + `docker builder prune -f` (Docker Desktop không trả dung lượng tệp đĩa ảo cho macOS).

### 8.9 Kết quả chạy từ máy sạch theo README 21/10/2026 (#12)

Bản clone mới của nhánh #12 trong thư mục tạm ngoài thư mục mã gốc, Docker không có image nào của dự án (chỉ còn `postgres`), không `.env`, không volume, không `.data/`; project tạm `COMPOSE_PROJECT_NAME=commune-c12` để không đụng volume của project chính. Docker Desktop 28.5.1, Compose v2.40.3, macOS arm64 (10 CPU, Docker 7,6 GiB RAM).

| Bước theo README | Kết quả |
|---|---|
| `cp .env.example .env` → `make up` | exit 0 sau **128 giây** (gồm tải 9 image); OpenBao tự init, tệp khóa `.data/openbao/commune-c12.json` quyền 600 |
| `make smoke` | **405 đạt, 0 trượt**, 93 giây |
| `make -C <bản clone> demo-users` gọi từ `/` | đặt mật khẩu 6 người dùng mẫu; token `congdan01` → `/api/ho_so` chỉ trả hồ sơ của mình; `canbo01` qua curl → `Account is not fully set up`; trang account console → đăng nhập `canbo01` chuyển tới trang cài OTP |
| `docker compose restart openbao` → `make bao-status` → `make bao-init` | `Sealed true` → unseal, `Sealed false`, secret_id giữ nguyên |
| `make down` → `make up` → `make smoke` | `make up` 35 giây, smoke 405/405 |
| Dung lượng | 10 image giải nén 4,1 GB (tải nén bản arm64 1,1 GiB); volume ≈ 0,3 GB (`clamav-db` 175 MB, `pg-data` 92 MB); ổ hệ thống giảm ≈ 5 GB; RAM các container ≈ 2,3 GB (ClamAV ~1 GB) |

Đã sửa sau lần chạy: thêm `make demo-users` (README cũ không có cách đặt mật khẩu người dùng mẫu sau #10), bước 3 mục 8 bỏ `KEYCLOAK_ADMIN_PASSWORD` (không còn trong `.env` từ #10). Sau khi chạy: `down -v` project tạm, xóa bản clone, `docker image prune -a -f`, `docker builder prune -f`.

## 9. Việc tiếp theo (tuần 2)

- ~~pgAudit~~: xong ở #75 (§4.6), biên dịch pgAudit từ mã nguồn trên image `postgres:17.6-alpine` gốc.
- MFA theo vai trò bằng luồng xác thực có điều kiện (mục 5).
- Quyền ghi danh mục thủ tục, phân công lĩnh vực qua API (hiện chỉ quản trị bằng migration/SQL): cần role quản trị riêng của ứng dụng.
- Gói thủ tục (D-009): nhiều quy trình hoặc mẫu quy trình dùng chung trong một gói; quyền quản trị danh mục ngoài gói (bật/tắt công khai) qua API.
- Thông báo cho công dân, cán bộ khi có `ho_so.chuyen_buoc`, `ho_so.sap_tre_han` (tuần 3): thêm queue + binding vào `mot-cua/rabbitmq/definitions.json` và một consumer, theo mẫu consumer nhật ký (§4.5). Sự kiện `ho_so.qua_han` khi hẹn giờ quá hạn của BPMN chạy.
- OpenBao khi triển khai thật (§4.4.1): Shamir nhiều phần hoặc auto-unseal, thu hồi root token, TLS từ step-ca, secret_id có hạn + response wrapping, agent sidecar trên tmpfs.
- Tệp: giao diện xem tệp cho cán bộ (tuần 3); OCR đọc tệp đã lưu (tuần 5).
- Log kiểm toán append-only + chuỗi băm SHA-256 (tuần 4).
