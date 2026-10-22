# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

### Tái cấu trúc

- **thu-tuc:** Mô hình gói thủ tục nen-tang/ + mot-cua/ + thu-tuc/ ([#30](https://github.com/commune-dxos/commune-dxos/issues/30)) ([#31](https://github.com/commune-dxos/commune-dxos/issues/31))
    - core/ → nen-tang/, apps/mot-cua/ → mot-cua/ (git mv); bỏ DXOS_APP, dịch vụ
      tang2-migrate, tang2-realm, mot-cua-api, mot-cua-worker; nhánh OpenBao dxos/tang2/.
    - thu-tuc/khai-sinh (chuyển BPMN và danh mục KS01) và thu-tuc/chung-thuc-ban-sao (CT01,
      hạn trong ngày): thu-tuc.yaml, quy-trinh.bpmn20.xml, thanh-phan-ho-so.schema.json,
      du-lieu-mau.json, README.md.
    - Bộ nạp nap-thu-tuc (make up, make nap-thu-tuc): kiểm gói, deploy BPMN qua REST, ghi danh
      mục qua RPC mot_cua.nap_thu_tuc (migration 005, client mot_cua_danh_muc); gói lỗi bị bỏ qua.
    - API /workflow đọc quy trình và biến từng bước từ danh mục (flowable:formProperty).
    - make check kiểm gói; CI bpmn kiểm thu-tuc/*/quy-trinh.bpmn20.xml; test bộ nạp, test SQL
      danh mục, smoke cắm–rút và hồ sơ chứng thực qua /workflow; docs/thu-tuc.md.

### Tài liệu

- **readme:** README tiếng Việt có ảnh minh họa, README.en.md, sơ đồ kiến trúc SVG ([#26](https://github.com/commune-dxos/commune-dxos/issues/26)) ([#27](https://github.com/commune-dxos/commune-dxos/issues/27))
    - README.md viết lại thuần tiếng Việt, giữ đủ nội dung đã kiểm chứng ở #12;
      thêm banner, ảnh minh họa bài toán, huy hiệu, mục Bài toán, bảng 4 dịch vụ bắt buộc
    - README.en.md ngắn: mô tả, kiến trúc, chạy từ máy sạch, giấy phép
    - docs/images/kien-truc.svg: sơ đồ kiến trúc vẽ tay theo docker-compose.yml, core/, apps/mot-cua/
    - docs/images/luong-ho-so.svg: luồng hồ sơ khai sinh theo BPMN dang_ky_khai_sinh
    - docs/images/*.webp: ảnh minh họa do đội tạo bằng công cụ AI; nguồn ghi ở docs/images/README.md
- **readme:** README kể chuyện sản phẩm với ảnh minh họa, bỏ README.en.md ([#28](https://github.com/commune-dxos/commune-dxos/issues/28)) ([#29](https://github.com/commune-dxos/commune-dxos/issues/29))
    - README.md thuần tiếng Việt theo trình tự: Giới thiệu, Thách thức, Giải pháp,
      Đối tượng, Chức năng (đã có ở v0.1.0 / sắp có), Kiến trúc, Công nghệ,
      Luồng hồ sơ, Hướng phát triển, Cài đặt từ máy sạch, Đóng góp, Báo lỗi,
      Giấy phép, CHANGELOG.
    - Ảnh mới trong docs/images/: banner có tiêu đề, vòng 6 chức năng, kiến trúc
      tổng quan dạng biểu tượng, luồng hồ sơ 5 bước; nhãn tiếng Việt.
    - Hướng dẫn cài đặt chi tiết chuyển sang docs/cai-dat.md, README giữ các lệnh chính.
    - Sơ đồ SVG chi tiết chỉ dùng trong docs/architecture.md (§1, §4.2).
    - Xóa README.en.md; cập nhật docs/images/README.md, CHANGELOG, de-thi-mapping.
- **tai-lieu:** Trang tài liệu MkDocs trên GitHub Pages, danh mục thủ tục tự sinh ([#32](https://github.com/commune-dxos/commune-dxos/issues/32)) ([#33](https://github.com/commune-dxos/commune-dxos/issues/33))
    - mkdocs.yml: MkDocs 1.6.1 + Material for MkDocs 9.7.7 bản community, giao diện và tìm kiếm
      tiếng Việt, điều hướng theo vai người đọc, dùng lại các tệp trong docs/, loại docs/contest/.
    - scripts/tai_lieu_hooks.py: trang Danh mục thủ tục sinh từ thu-tuc/*/ bằng bộ kiểm của bộ nạp,
      mỗi gói một trang từ README của gói; đưa mot-cua/README.md, CONTRIBUTING.md, CHANGELOG.md lên
      site; neo tiêu đề như GitHub; link ra ngoài docs/ trỏ về GitHub.
    - make tai-lieu (--strict), make xem-tai-lieu; workflow tai-lieu.yml build trên PR, deploy Pages
      khi push main hoặc chạy tay.
    - DEPENDENCIES.md, NOTICE, CHANGELOG, một dòng link trong README; site/ vào .gitignore.

### Hạ tầng và CI

- **tien-do:** Milestone theo tuần, nhãn thành phần tự gắn, mẫu issue ([#34](https://github.com/commune-dxos/commune-dxos/issues/34)) ([#35](https://github.com/commune-dxos/commune-dxos/issues/35))
    - .github/labeler.yml + workflow gan-nhan (actions/labeler, pull_request_target,
      không checkout mã PR): tự gắn nen-tang, mot-cua, thu-tuc, docs, ci theo tệp sửa
    - Mẫu issue "Thủ tục mới" (tự gắn thu-tuc) và "Việc trong tuần" (chọn thành phần)
    - docs/quy-trinh-lam-viec.md: milestone Tuần 1–7, nhãn, bảng Project, luồng
      issue → nhánh → PR → develop; thêm vào mục "Đóng góp" của site
    - CONTRIBUTING.md, docs/PLAN.md, CHANGELOG cập nhật theo

## [0.1.0] - 2026-10-21
### Added
- `apps/mot-cua/db/migrations/002_schema_day_du.sql`: schema `mot_cua` đầy đủ – `linh_vuc`, `thu_tuc` (thời hạn theo ngày làm việc, phí, công khai), `thanh_phan_yeu_cau`, `ngay_nghi`, `can_bo` (liên kết `sub` Keycloak) + `can_bo_linh_vuc`, `ho_so` (mã hồ sơ, hạn xử lý tính theo ngày làm việc, trạng thái `moi → dang_xu_ly → cho_bo_sung → hoan_tat | tu_choi` có trigger chặn bước sai), `thanh_phan_ho_so` (metadata, tệp ở Garage); khóa UUID, `created_at`/`updated_at` (#5).
- RLS bật và `FORCE` trên mọi bảng `mot_cua`: công dân chỉ thấy/nộp hồ sơ của mình và chỉ sửa khi chờ bổ sung; cán bộ chỉ thấy/xử lý hồ sơ thuộc lĩnh vực phụ trách; lãnh đạo chỉ đọc; `anon` chỉ đọc danh mục thủ tục công khai. Quyền GRANT theo cột, hàm nội bộ ở schema `mot_cua_noi_bo` không phơi ra API (#5).
- RPC công khai `json_schema_thu_tuc(ma)`: JSON Schema thành phần hồ sơ của thủ tục, chuẩn bị cho Poka-yoke tuần 3 (#5).
- Seed `002_du_lieu_mau.sql` (dữ liệu giả): 3 lĩnh vực, 6 thủ tục cấp xã kèm thành phần hồ sơ, 3 cán bộ khác lĩnh vực, 6 hồ sơ ở đủ trạng thái, ngày nghỉ 2026; người dùng mẫu `congdan02`, `canbo02`, `canbo03`, `id` Keycloak cố định khớp seed (#5).
- `apps/mot-cua/db/tests/rls.sql`: 63 kiểm tra quyền/RLS từng vai trò, chạy trong một transaction rồi ROLLBACK; `make smoke` chạy tệp này và gọi API qua APISIX bằng token thật của cả 4 vai trò (cán bộ, lãnh đạo dùng người dùng tạm có OTP, mã TOTP sinh trong script) (#5).
- `apps/mot-cua/README.md`: sơ đồ ER, sơ đồ trạng thái, bảng quyền theo vai trò, ghi chú dữ liệu cá nhân tối thiểu; `docs/architecture.md` §2.7, §8.3 (#5).

- Workflow engine Flowable REST 8.0.0 trong profile `core`: CSDL riêng `flowable` (dịch vụ một lần `flowable-db-init`, chạy được với volume cũ), tắt quy trình demo, healthcheck có xác thực, cổng debug chỉ trên 127.0.0.1; biến `FLOWABLE_DB_PASSWORD`, `FLOWABLE_ADMIN_PASSWORD`, `FLOWABLE_PORT` (#8).
- Quy trình `apps/mot-cua/processes/dang_ky_khai_sinh.bpmn20.xml` viết tay: tiếp nhận → (công dân bổ sung) → thẩm định → phê duyệt, nhánh từ chối, hẹn giờ quá hạn không ngắt quy trình; Flowable tự triển khai thư mục `processes/` của ứng dụng khi khởi động (#8).
- `scripts/check-bpmn.py` kiểm cú pháp và cấu trúc BPMN trong `make check` và CI; `make smoke` kiểm Flowable và chạy quy trình khai sinh qua các bước (#8).

- APISIX: route `/workflow/*` (bắt buộc JWT, 300 req/phút/IP) chuyển tới backend của ứng dụng; route chặn 403 các đường dẫn API quản trị Flowable (`repository`, `management`, `identity`, `runtime`, `history`, `query`, `form`, `flowable-rest`); `/files/*` kiểm JWT rồi trả 503 giữ chỗ cho Garage; CORS toàn cục theo biến `DXOS_CORS_ORIGINS`; cấu hình JWT dùng chung bằng `plugin_configs` (#6).
- Dịch vụ `app-backend` trong profile `core`: chạy `apps/<DXOS_APP>/backend/main.py` trên image `python:3.13.16-alpine3.24` (chỉ thư viện chuẩn, không build), không mở cổng ra host (#6).
- `apps/mot-cua/backend/main.py`: API quy trình mỏng – công dân nộp hồ sơ + khởi tạo quy trình trong một lời gọi, xem tiến độ; cán bộ/lãnh đạo lấy task của nhóm mình (lĩnh vực phụ trách tra trong CSDL), nhận và hoàn thành task với biến khai báo cho từng bước. Tự kiểm JWT (RS256 theo JWKS), đọc/ghi hồ sơ qua PostgREST bằng token người dùng (RLS), gọi Flowable bằng tài khoản kỹ thuật – người dùng không cầm mật khẩu Flowable (#6).
- `make smoke` (199 kiểm tra): 401 trên mọi route cần token, 403 khi gọi API quản trị Flowable qua gateway, CORS, cổng không mở ra host, luồng khai sinh đầy đủ qua `/workflow` bằng token thật của công dân, cán bộ, lãnh đạo, chặn chéo vai trò, backend tự kiểm token, `/public` vượt hạn mức → 429 (#6).

- Dữ liệu phi cấu trúc trong profile `core`: Garage v2.4.1 một nút (AGPL-3.0, dịch vụ riêng, image gốc, không mở cổng ra host) và ClamAV 1.5.4 (GPL-2.0, dịch vụ riêng, image gốc, CSDL virus giữ trong volume `clamav-db`) (#7).
- Dịch vụ một lần `garage-secrets` (sinh `rpc_secret`, `admin_token`) và `garage-init` (layout một nút, bucket do ứng dụng khai báo trong `apps/<DXOS_APP>/s3/buckets.conf`, khóa S3 riêng của ứng dụng chỉ đọc/ghi trên bucket đó), chạy lại an toàn; khóa và bí mật sinh lúc khởi tạo vào volume `garage-secrets`, `app-secrets` (quyền 600), không nằm trong repo hay `.env`. TODO #10: chuyển sang OpenBao (#7).
- `app-realm` ghi client secret của client dịch vụ (service account) mà ứng dụng khai báo vào volume `app-secrets` (#7).
- API tệp `apps/mot-cua/backend` (`/files`): công dân tải PDF/JPG/PNG ≤ 10 MiB vào hồ sơ của mình khi `moi`/`cho_bo_sung`; kiểm đuôi, Content-Type và magic bytes (giả mạo → 415); **ClamAV quét trước khi lưu** (tệp nhiễm → 422, không lưu, ghi nhật ký); lưu Garage, ghi metadata (object key, sha256, kích thước, người tải, kết quả quét); xem tệp theo RLS (cán bộ sai lĩnh vực → 403) bằng link GET ký SigV4 ngắn hạn, client không cầm khóa S3 (#7).
- APISIX: `/files/*` chuyển tới backend của ứng dụng (JWT, 120 req/phút/IP, body ≤ 10 MiB → 413) thay cho chỗ giữ 503; `/files/s3/*` cho link ký sẵn tới Garage (chỉ GET/HEAD, `nosniff`) (#7).
- Migration `003_tep_ho_so.sql`: role `dich_vu_tep` (client Keycloak `mot_cua_tep`, Client Credentials) ghi metadata tệp đã quét; cột `nguoi_tai_sub`, `ket_qua_quet`, `may_quet`, `quet_luc`; ràng buộc khóa object nằm dưới tiền tố hồ sơ; bảng `nhat_ky_tep` chỉ thêm (trigger chặn sửa/xóa/TRUNCATE kể cả superuser), lãnh đạo đọc được (#7).
- `make test`: 17 test đơn vị cho API tệp (tên/đuôi, magic bytes, quy tắc quyền, SigV4 theo ví dụ chính thức của AWS, giao thức `clamd`), chạy trong `make check` và CI; `rls.sql` 88 kiểm tra; `make smoke` 277 kiểm tra, có tải EICAR, tệp giả mạo, quá cỡ, link hết hạn (#7).

- OpenBao 2.7.1 (MPL-2.0, dịch vụ riêng, image gốc) trong profile `core`: chế độ server (không `-dev`), storage raft một nút trong volume `bao-data`, không UI, không mở cổng ra host, audit device ra stdout (giá trị bí mật băm HMAC); cấu hình `core/openbao/config.hcl` (#10).
- Dịch vụ một lần `bao-init` (`core/openbao/bao-init.py`, cũng là `make bao-init`), chạy ở mỗi `make up`, idempotent: init lần đầu (unseal key + root token ra `.data/openbao/<project>.json` trên máy, quyền 600, ngoài git), unseal (`BAO_UNSEAL=file` chỉ cho máy dev, `manual` để unseal tay), KV v2 `dxos/`, AppRole, policy theo danh tính `core/openbao/policies/*.hcl`, sinh ngẫu nhiên bí mật lõi chưa có (mật khẩu role PostgreSQL, quản trị Keycloak, `rest-admin` Flowable, `rpc_secret`/`admin_token` Garage); lệnh `make bao-status`, `make bao-import-env` (#10).
- 8 danh tính AppRole (`db`, `postgrest`, `keycloak`, `flowable`, `garage`, `garage-init`, `app-realm`, `app`), mỗi danh tính chỉ đọc/ghi đúng đường dẫn của mình, role_id/secret_id trong volume riêng quyền 0400; 5 agent một lần `*-secrets` (`bao agent`, `core/openbao/agent/*.hcl`) render tệp bí mật cho PostgreSQL, PostgREST, Keycloak, Flowable, Garage (#10).
- `make smoke` thêm 51 kiểm tra (`scripts/smoke-openbao.sh`, `core/openbao/kiem-quyen.py`): két đã unseal, 27 cặp danh tính × đường dẫn kiểm bằng AppRole thật, không mật khẩu trong biến môi trường của 9 dịch vụ, quyền tệp, nhật ký kiểm toán không chứa bí mật dạng rõ, `bao-init` chạy lại không đổi gì; tổng 328 kiểm tra (#10).
- `docs/architecture.md` §4.4 (thiết kế, sơ đồ, bảng dịch vụ ↔ đường dẫn KV ↔ policy, init/unseal, chuyển từ `.env` cũ), §8.7 kết quả chạy thử; README mục Bí mật (#10).

- RabbitMQ 4.3.6 (MPL-2.0, dịch vụ riêng, image gốc `rabbitmq:4.3.6-alpine`) trong profile `core`: một nút, plugin STOMP + management, không mở cổng ra host, không có route APISIX; tài khoản quản trị khởi tạo lấy từ OpenBao (`dxos/core/rabbitmq/admin`, agent `rabbitmq-secrets`, danh tính `rabbitmq`); cấu hình `core/rabbitmq/`; biến `RABBITMQ_ADMIN` (#9).
- Dịch vụ một lần `rabbitmq-init` (`core/scripts/rabbitmq-init.py`, danh tính OpenBao `rabbitmq-init`): vhost riêng `<DXOS_APP>`, user `app-<DXOS_APP>` không tag quản trị, không quyền configure; nạp topology ứng dụng khai báo trong `apps/<DXOS_APP>/rabbitmq/definitions.json` (chỉ exchange, queue, binding); ghi thông tin kết nối vào OpenBao `dxos/apps/<DXOS_APP>/rabbitmq`; chạy lại không đổi gì (#9).
- Dịch vụ `app-worker` trong profile `core`: chạy `apps/<DXOS_APP>/backend/worker.py` (cùng image, cùng AppRole `app` với `app-backend`, không có cổng, healthcheck theo nhịp sống) (#9).
- Sự kiện hồ sơ của `mot-cua` (định dạng JSON phiên bản 1: `id`, `loai`, `luc`, mã hồ sơ, lĩnh vực, thủ tục; không có dữ liệu cá nhân): `ho_so.moi` (khởi tạo quy trình), `ho_so.chuyen_buoc` (hoàn thành task), `ho_so.hoan_tat` / `ho_so.tu_choi` (quy trình kết thúc), `ho_so.sap_tre_han` (còn ≤ 1 ngày làm việc tới hạn, mỗi hồ sơ và hạn một lần). `app-backend` ghi vào hộp thư đi (outbox) sau khi gọi Flowable thành công; `app-worker` phát lên exchange `mot_cua.su_kien` qua STOMP, chờ RabbitMQ xác nhận rồi mới đánh dấu đã phát; RabbitMQ dừng thì sự kiện chờ trong bảng (#9).
- Migration `004_su_kien.sql`: role `dich_vu_su_kien` (client Keycloak `mot_cua_su_kien`) chỉ đọc các cột hồ sơ không phải dữ liệu cá nhân; bảng `hop_thu_su_kien` (khóa chống trùng UNIQUE, nội dung phải khớp dòng, không bỏ phát được), `nhat_ky_su_kien` chỉ thêm (lãnh đạo đọc được) (#9).
- Consumer mẫu trong `app-worker`: nhận từ queue `mot_cua.nhat_ky` (quorum), kiểm định dạng, ghi `nhat_ky_su_kien` chống trùng theo id rồi ACK; tin sai định dạng → queue lỗi `mot_cua.nhat_ky.loi` (dead-letter); quét sắp trễ hạn mỗi `DXOS_SU_KIEN_QUET_GIAY` giây, ngưỡng `DXOS_SU_KIEN_SAP_TRE_NGAY` ngày làm việc (#9).
- `make test` thêm 36 test đơn vị (định dạng sự kiện, ngày làm việc, quy tắc sắp trễ hạn, chống trùng, mã hóa frame STOMP, consumer, publisher); `rls.sql` thêm 22 kiểm tra cho sự kiện (110 tổng); `make smoke` thêm 77 kiểm tra (`scripts/smoke-rabbitmq.sh`, `apps/mot-cua/tests/smoke-su-kien.sh`): management chỉ cho quản trị trong mạng nội bộ, luồng thật qua `/workflow` → queue → consumer, sắp trễ hạn đúng một lần, tin hỏng → queue lỗi, RabbitMQ dừng rồi lên lại; tổng 405 kiểm tra (#9).
- `docs/architecture.md` §4.5 (thiết kế, lý do chọn outbox + STOMP, sơ đồ, topology, bí mật), §8.8 kết quả chạy thử; `apps/mot-cua/README.md` danh mục sự kiện và payload (#9).

- CI tách thành các check riêng, tên ổn định, chạy trên mọi push/PR không lọc đường dẫn: `shellcheck`, `yamllint`, `bpmn`, `test-backend`, `test-sql` bên cạnh `make-check`; action ghim theo tag (`actions/checkout@v5.0.0`, `actions/setup-python@v6.0.0`, chạy Node 24), công cụ lint ghim trong `scripts/requirements-lint.txt` (yamllint 1.38.0, ShellCheck 0.11.0) (#11).
- `make lint` (`scripts/lint.sh`): shellcheck mọi `*.sh`, yamllint theo `.yamllint.yml` (compose, APISIX, workflow), kiểm cấu trúc BPMN + 13 test của chính bộ kiểm (`scripts/tests/test_check_bpmn.py`); thiếu công cụ thì in cách cài (#11).
- `make test` = `test-backend` + `test-sql`; `make test-sql` (`scripts/test-sql.sh`): PostgreSQL trống (service container trên CI, container tạm cùng image compose trên máy) → `10-core.sql` → `app-migrate.sh` hai lần (lần sau phải bỏ qua hết) → `apps/*/db/tests/*.sql` trước và sau khi nạp seed; dòng TRƯỢT hay lỗi psql làm job đỏ (#11).

- `make demo-users` (`scripts/demo-users.sh`): đặt một mật khẩu chung cho 6 người dùng mẫu (dữ liệu giả) để thử tay từng vai trò sau `make smoke`; mật khẩu lấy từ `DXOS_DEMO_PASSWORD` hoặc sinh ngẫu nhiên và in một lần, đi qua stdin vào `kcadm.sh` (#12).
- `docs/architecture.md` §8.9: kết quả chạy từ máy sạch theo README (bản clone mới ngoài thư mục mã, `make up` 128 giây, smoke 405/405, dung lượng image và RAM đo được) (#12).

### Changed
- README viết lại song ngữ Việt – Anh: kiến trúc 3 tầng (Mermaid), yêu cầu máy (Docker/Compose tối thiểu, RAM, ổ, amd64/arm64), chạy từ máy sạch kèm thời gian và dung lượng đo thật, địa chỉ/cổng, tài khoản mẫu theo vai trò, biến cấu hình trong `.env`, thêm ứng dụng vào `apps/`, kiểm thử và đóng góp, xử lý lỗi thường gặp (cổng bị chiếm, OpenBao sealed, thiếu RAM/ổ), giấy phép, phiên bản (#12).
- `docs/architecture.md` §8 bước 3 đặt mật khẩu bằng `make demo-users` thay cho lệnh `kcadm.sh` dùng `KEYCLOAK_ADMIN_PASSWORD` (đã chuyển vào OpenBao ở #10) (#12).
- `make test` cũ đổi tên thành `make test-backend` (`make check` vẫn chạy test đơn vị, không cần Docker) (#11).
- Sửa cảnh báo shellcheck: mẫu `*.bpmn20.xml` thừa trong `scripts/lib-spdx.sh` (đã khớp `*.xml`), `scripts/smoke.sh` khai báo nguồn `.env.example` cho `. ./.env` (CI không có `.env`), chú thích lý do cho biến dùng ở tệp `source` và chuỗi nháy đơn có chủ ý trong `scripts/lib-smoke.sh`, `apps/mot-cua/tests/smoke-tep.sh`; không đổi hành vi (#11).
- Bỏ mọi mật khẩu khỏi `.env`/`.env.example` (`POSTGRES_PASSWORD`, `PGRST_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `FLOWABLE_DB_PASSWORD`, `FLOWABLE_ADMIN_PASSWORD`): nguồn duy nhất là OpenBao. `.env` cũ còn các biến này thì lần `make up` đầu tiên chuyển giá trị sang OpenBao, giữ được volume cũ (#10).
- `flowable-db-init` và `core/postgres/initdb/20-auth.sh` gộp thành dịch vụ một lần `db-init` (`core/scripts/db-init.sh`): role + CSDL riêng của `authenticator`, `keycloak`, `flowable`, đặt mật khẩu theo OpenBao ở mỗi `up` (đổi mật khẩu trong OpenBao là PostgreSQL theo) (#10).
- `garage-secrets` thành agent OpenBao (không còn `core/scripts/garage-secrets.sh`); `garage-init` đọc `admin_token` và ghi khóa S3 của ứng dụng vào OpenBao `dxos/apps/<DXOS_APP>/s3`; `app-realm` đọc mật khẩu quản trị Keycloak và ghi client secret vào `dxos/apps/<DXOS_APP>/keycloak/<client>`; `app-backend` đọc các bí mật này và mật khẩu `rest-admin` từ OpenBao lúc cần (`apps/mot-cua/backend/bimat.py`), chỉ giữ trong bộ nhớ. Tệp rõ `s3.json`, `keycloak-*.secret` cũ trong volume `app-secrets` bị xóa khi nâng cấp (#10).
- Keycloak khởi động qua `core/scripts/kc-start.sh` (đọc mật khẩu từ tệp); Flowable nạp mật khẩu bằng Spring Boot config tree; PostgREST đọc URI kết nối bằng `PGRST_DB_URI=@tệp` (#10).
- Công dân không còn `INSERT` trực tiếp vào `mot_cua.thanh_phan_ho_so` qua `/api`: metadata tệp chỉ ghi qua API tệp `/files` sau khi quét (#7).
- ClamAV chuyển từ profile `docs` sang `core` vì quét là điều kiện bắt buộc để lưu tệp (#7).
- PostgREST: `PGRST_OPENAPI_MODE=follow-privileges` (OpenAPI chỉ liệt kê những gì role của request được quyền), `PGRST_DB_MAX_ROWS=1000`, CORS giới hạn theo `DXOS_CORS_ORIGINS` thay vì mọi origin (#6).
- Route `/public/*` nhận thêm `OPTIONS`, thông báo 429 dạng JSON (#6).
- Migration 002 thay hai bảng giữ chỗ `thu_tuc`, `ho_so` của v0.0.1 (chỉ có dữ liệu giả); bỏ seed `001_du_lieu_mau.sql`. API đổi: `ho_so.thu_tuc_id` (UUID) thay cho `ma_thu_tuc`, trạng thái `moi_nop`/`bo_sung` đổi thành `moi`/`cho_bo_sung` (#5).

## [0.0.1] - 2026-10-20
### Added
- Khung dự án: LICENSE (Apache-2.0), NOTICE, CONTRIBUTING, CODE_OF_CONDUCT, CI kiểm tra giấy phép, mẫu issue.
- `docker-compose.yml` profile `core`: PostgreSQL 17, Keycloak 26, PostgREST v13, APISIX 3.13 (standalone); image ghim phiên bản, có healthcheck; `.env.example`.
- `infra/postgres/initdb/`: schema `mot_cua`, bảng `ho_so` bật RLS, role `anon`/`cong_dan`/`can_bo`/`lanh_dao`, quyền theo cột, dữ liệu mẫu giả.
- `infra/keycloak/realm-commune.json`: realm `commune`, client `commune_api`/`commune_web`/`commune_cli`, vai trò ánh xạ sang role PostgreSQL, OTP bắt buộc cho cán bộ và lãnh đạo.
- `infra/apisix/`: route `/api/*` kiểm JWT Keycloak (openid-connect + JWKS), route công khai `/api/thu_tuc` có giới hạn tần suất.
- `docs/architecture.md`: sơ đồ Mermaid 3 tầng, luồng JWT → RLS, chia profile, cách viết BPMN không có modeler, lệnh chạy thử.
- `DEPENDENCIES.md`: khai báo image, thư viện npm/pip, mô hình AI kèm phiên bản, giấy phép, nguồn.
- README: mục "Giấy phép / License" song ngữ.
- CI `.github/workflows/check.yml` chạy `make check` trên mỗi push/PR.
- `.github/PULL_REQUEST_TEMPLATE.md`: mô tả, issue liên quan, checklist `make check`, SPDX, CHANGELOG, tài liệu, bí mật (#1).
- `DEPENDENCIES.md` mục 5: danh sách thành phần không dùng kèm lý do giấy phép và thành phần thay thế (#1).
- `apps/mot-cua/`: ứng dụng Tầng 2 đầu tiên – migration (role `cong_dan`/`can_bo`/`lanh_dao`, schema `mot_cua`, RLS), seed dữ liệu giả, vai trò/nhóm/người dùng Keycloak, `app.env`, smoke riêng (#3).
- Dịch vụ một lần `app-migrate` (áp dụng `apps/<DXOS_APP>/db/` một lần mỗi tệp, ghi sổ `dxos.app_migration` kèm SHA-256, dừng nếu tệp đã áp dụng bị sửa) và `app-realm` (Keycloak Partial Import, bỏ qua đối tượng đã có) (#3).
- Biến `DXOS_APP`, `DXOS_SEED` trong `.env.example`; lệnh `make migrate`, `make seed`, `make smoke` (`scripts/smoke.sh`, `scripts/lib-smoke.sh`) (#3).
- `docs/architecture.md` §2: vì sao lõi độc lập nghiệp vụ, hợp đồng lõi–ứng dụng, cách cắm một ứng dụng khác; §8.2 kết quả chạy thử 20/10/2026 (#3).

### Changed
- NOTICE theo kết quả xác minh giấy phép 17/10/2026: Meilisearch Community Edition (MIT), dbt-core từ PyPI (không dùng dbt Fusion), image `flowable/flowable-rest`, Qwen2.5 chỉ bản 7B/14B; trạng thái "Đã xác minh 17/10/2026".
- `scripts/check-license.sh`, `scripts/add-license-header.sh` (dùng chung `scripts/lib-spdx.sh`): quét thêm Dockerfile, Makefile, `.env.example`, `.yml/.yaml`, `.toml`, `.conf`, `.ini`, `.properties`, `.css`, `.xml/.bpmn`; bỏ qua `.json` và thư mục bên thứ ba.
- `make check` kiểm compose với mọi profile, dùng `.env.example` khi chưa có `.env`.
- `CONTRIBUTING.md` viết lại: quy trình issue → nhánh `feature/<số>-<tên>` từ `develop` → PR → 1 người duyệt → squash; Conventional Commits; quy tắc không commit bí mật và dữ liệu thật (#1).
- Mẫu issue "Việc cần làm" có ô "Tuần" và "Vai phụ trách" khớp nhãn `tuan-*`, `vai-*` (#1).
- `NOTICE` và `LICENSE` (dòng bản quyền trong APPENDIX): `Copyright 2026 DTU_DZ_2` (#1).
- **Tách lõi khỏi nghiệp vụ (D-005, D-008):** `infra/` đổi thành `core/`; init SQL của lõi chỉ còn role `authenticator`/`anon` và schema `dxos` (hàm `dxos.jwt_claims()`, `dxos.jwt_claim()`, `dxos.jwt_sub()`, sổ migration); realm lõi đổi thành `dxos` với client `dxos_api` (không có role) và `dxos_cli`; PostgREST lấy schema từ `apps/<DXOS_APP>/app.env`, đọc role ở `resource_access.dxos_api.roles[0]` (#3).
- APISIX: route công khai đổi từ `/api/thu_tuc` thành `/public/*` (chỉ GET/HEAD, bỏ header Authorization, chạy với role `anon`), lõi không còn nêu tên bảng nghiệp vụ (#3).
- Volume `pg-data` tạo trước bản này không tương thích: `docker compose --profile core down -v && make up` (#3).
- `docs/PLAN.md` theo lộ trình mới: gán vai V1/V2/V3 từng dòng, tách `core/`/`apps/` đầu tuần 2, VPS + tên miền tuần 4, tuần UX và 2 lần tập trình bày, bộ JSON Schema thủ tục dạng dữ liệu mở, module mẫu thứ hai, đóng băng PoF trước 17:00 06/12/2026 (#1).

### Fixed
- Chạy thử profile `core` (17/10/2026): cổng PostgreSQL trên host mặc định đổi sang 55432 để không đụng PostgreSQL cài sẵn; bỏ healthcheck `postgrest --ready` (v13.0.4 không có cờ này, image amd64 không có shell), thay bằng health check chủ động của APISIX tới `/ready` (cổng admin 3001).
- Bỏ các tham chiếu tới tệp không có trong kho (`DEPENDENCIES.md`, `docs/PLAN.md`, CHANGELOG); thông tin nộp bài ghi thẳng trong `docs/PLAN.md` (#1).

### Removed
- `.github/workflows/ci.yml` (thay bằng `check.yml`; job `docker compose build` cũ không có gì để build).

[Unreleased]: https://github.com/commune-dxos/commune-dxos/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/commune-dxos/commune-dxos/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/commune-dxos/commune-dxos/releases/tag/v0.0.1
