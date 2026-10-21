<sub>English: [README.en.md](README.en.md)</sub>

<p align="center">
  <img src="docs/images/banner.webp" alt="Bộ phận một cửa của xã: hồ sơ giấy được chuyển thành hồ sơ điện tử và đi qua các bước xử lý" width="100%">
</p>

# Commune DX-OS — Hệ điều hành Chính quyền số Cấp xã

Nền tảng nguồn mở giúp chính quyền cấp xã tiếp nhận và xử lý thủ tục hành chính trực tuyến (một cửa), theo dõi trễ hạn, lưu hồ sơ điện tử an toàn và hỗ trợ người dân tra cứu thủ tục.

[![Giấy phép Apache-2.0](https://img.shields.io/badge/gi%E1%BA%A5y%20ph%C3%A9p-Apache--2.0-blue.svg)](LICENSE)
[![Phiên bản](https://img.shields.io/github/v/release/commune-dxos/commune-dxos?label=phi%C3%AAn%20b%E1%BA%A3n)](https://github.com/commune-dxos/commune-dxos/releases)
[![CI](https://github.com/commune-dxos/commune-dxos/actions/workflows/check.yml/badge.svg?branch=develop)](https://github.com/commune-dxos/commune-dxos/actions/workflows/check.yml)

OLP PMNM 2026 · Đề tài DX-OS Open-Core · Đội DTU_DZ_2

Mục lục: [Bài toán](#1-bài-toán) · [Kiến trúc](#2-kiến-trúc) · [Yêu cầu máy](#3-yêu-cầu-máy) · [Chạy từ máy sạch](#4-chạy-từ-máy-sạch) · [Địa chỉ và tài khoản mẫu](#5-địa-chỉ-cổng-và-tài-khoản-mẫu) · [Cấu hình](#6-cấu-hình-trước-khi-chạy) · [Thêm ứng dụng](#7-thêm-một-ứng-dụng-vào-apps) · [Kiểm thử, đóng góp](#8-kiểm-thử-và-đóng-góp) · [Xử lý lỗi](#9-xử-lý-lỗi-thường-gặp) · [Giấy phép](#10-giấy-phép) · [Phiên bản](#11-phiên-bản)

## 1. Bài toán

Ở cấp xã, khối lượng thủ tục hành chính lớn mà phần nhiều vẫn là hồ sơ giấy: người dân phải đến bộ phận một cửa nhiều lần để nộp, bổ sung, hỏi tiến độ; cán bộ khó biết hồ sơ nào sắp trễ hạn; lãnh đạo thiếu số liệu về thời gian giải quyết.

<p align="center">
  <img src="docs/images/mot-cua-so.webp" alt="Công dân nộp hồ sơ khai sinh từ điện thoại; hồ sơ được quét an toàn rồi đi qua các bước tiếp nhận, thẩm định, phê duyệt" width="80%">
</p>

Commune DX-OS đưa luồng này lên mạng, cho bốn nhóm người dùng: **công dân**, **cán bộ một cửa**, **cán bộ chuyên môn**, **lãnh đạo xã**.

- Công dân nộp hồ sơ trực tuyến và tải giấy tờ; mọi tệp được quét mã độc trước khi lưu.
- Hồ sơ chạy theo quy trình BPMN (tiếp nhận → bổ sung nếu thiếu → thẩm định → phê duyệt), mỗi cán bộ chỉ thấy hồ sơ thuộc lĩnh vực mình phụ trách.
- Hạn xử lý tính theo ngày làm việc; hồ sơ sắp trễ hạn phát cảnh báo qua hàng đợi sự kiện.
- Cán bộ và lãnh đạo đăng nhập một lần (SSO) với xác thực hai lớp (OTP).

Bản v0.1.0 đã có lõi và API của ứng dụng một cửa (kiểm chứng bằng `make smoke`, 405 kiểm tra). Cổng web cho công dân và cán bộ, dashboard, ký số, OCR và trợ lý tra cứu thủ tục nằm trong kế hoạch các tuần tiếp theo: [`docs/PLAN.md`](docs/PLAN.md).

## 2. Kiến trúc

<p align="center">
  <img src="docs/images/kien-truc.svg" alt="Sơ đồ kiến trúc: Tầng 2 apps/mot-cua gọi lõi qua APISIX; Tầng 1 core gồm Keycloak, APISIX, PostgREST, PostgreSQL, Flowable, Garage, ClamAV, RabbitMQ, OpenBao" width="100%">
</p>

Hệ thống chia hai tầng, tách bằng thư mục:

- **Tầng 1 – `core/`** là lõi headless: không có giao diện cho người dùng cuối, chỉ có API, và **không chứa nghiệp vụ**. Gồm SSO (Keycloak), API Gateway (APISIX), dữ liệu có cấu trúc (PostgreSQL + Row-Level Security, API tự sinh bằng PostgREST) và phi cấu trúc (Garage S3, quét ClamAV), workflow engine (Flowable BPMN 2.0), hàng đợi (RabbitMQ), két bí mật (OpenBao). Mọi thành phần chạy bằng image gốc của dự án upstream.
- **Tầng 2 – `apps/<tên>/`** là ứng dụng cắm vào lõi, chọn bằng biến `DXOS_APP`. Ứng dụng chính là [`apps/mot-cua/`](apps/mot-cua/) (một cửa cấp xã): schema và RLS, vai trò Keycloak, quy trình BPMN, backend mỏng `/workflow`, `/files` và tác vụ nền phát sự kiện. Tầng 2 chỉ gọi lõi qua APISIX.

Luồng chính trên sơ đồ:

1. Người dùng đăng nhập Keycloak (OIDC + PKCE, cán bộ và lãnh đạo thêm OTP), nhận access token RS256.
2. Mọi request đi qua APISIX với `Bearer JWT`: gateway kiểm chữ ký bằng JWKS, giới hạn tần suất, rồi chuyển `/public`, `/api` tới PostgREST, `/workflow`, `/files` tới backend của ứng dụng. PostgREST và backend kiểm lại token (Zero-Trust); PostgreSQL áp RLS theo vai trò trong token.
3. Tệp tải lên được ClamAV quét **trước**, sạch mới lưu vào Garage; người xem nhận link ký sẵn ngắn hạn.
4. Mỗi bước quy trình ghi một sự kiện vào hộp thư đi (outbox) trong PostgreSQL; `app-worker` phát lên RabbitMQ, nên request không phụ thuộc broker.

Bốn dịch vụ bắt buộc của đề (đánh số 1–4 trên sơ đồ):

| Yêu cầu của đề (Tầng 1) | Thành phần |
|---|---|
| Identity / SSO | Keycloak 26.3, realm `dxos`, MFA (OTP) bắt buộc cho cán bộ |
| API Gateway | Apache APISIX 3.13 (standalone), JWT, rate limit, CORS |
| Dữ liệu có cấu trúc và phi cấu trúc | PostgreSQL 17.6 + RLS + PostgREST 13; Garage 2.4 (S3) + ClamAV 1.5 |
| Workflow engine | Flowable REST 8.0, BPMN 2.0 viết tay trong `apps/<tên>/processes/` |

Luồng hồ sơ đăng ký khai sinh, từ lúc công dân nộp đến khi lãnh đạo phê duyệt:

<p align="center">
  <img src="docs/images/luong-ho-so.svg" alt="Luồng hồ sơ khai sinh: công dân nộp, cán bộ hộ tịch tiếp nhận và thẩm định, lãnh đạo phê duyệt; thiếu thành phần thì công dân bổ sung" width="100%">
</p>

Chi tiết (route gateway, luồng tệp, bí mật, sự kiện, hợp đồng lõi–ứng dụng): [`docs/architecture.md`](docs/architecture.md). Nguồn và giấy phép hình ảnh: [`docs/images/README.md`](docs/images/README.md).

## 3. Yêu cầu máy

| Mục | Tối thiểu | Ghi chú |
|---|---|---|
| Hệ điều hành | Linux, macOS, Windows (WSL2) | CPU **amd64 hoặc arm64** (mọi image đều có cả hai) |
| Docker | Docker Engine **24+** hoặc Docker Desktop **4.25+** | đã thử: Docker Desktop 28.5 (macOS arm64) |
| Docker Compose | **v2.20+** (`docker compose version`) | Docker Desktop đã có sẵn |
| RAM cho Docker | **4 GB**, khuyên **6 GB** (máy 8–16 GB) | đo được ≈ 2,3 GB khi chạy; ClamAV ~1 GB, Keycloak ~0,5 GB, Flowable ~0,4 GB |
| Ổ trống | **6 GB** | đo được: 10 image ≈ 4,1 GB + volume ≈ 0,3 GB (CSDL virus ClamAV 175 MB) |
| Công cụ | `git`, `make`, `bash`, `curl`, `jq`, `python3` (3.10+) | dùng cho `make smoke`, `make test`; Windows: chạy trong WSL2 |
| Mạng | tải ≈ 1,1 GB lần đầu | 10 image nén (bản arm64 đo được 1,1 GiB) |

Không cần cài Java, Node hay PostgreSQL trên máy: mọi dịch vụ chạy bằng image gốc của dự án upstream, không có bước build image riêng.

## 4. Chạy từ máy sạch

Clone vào thư mục nào cũng chạy được (không có đường dẫn tuyệt đối), và gọi được từ thư mục khác: `make -C /duong/dan/commune-dxos up`. Lần đầu `make up` mất khoảng **2–10 phút** tùy mạng (phần lớn là tải image), `make smoke` thêm khoảng 1,5 phút; các lần sau `make up` khoảng 35 giây. Đo được trên bản clone sạch (Docker Desktop, macOS arm64, 21/10/2026): `make up` lần đầu 2 phút 8 giây, `make smoke` 93 giây, 405/405 đạt.

```bash
git clone https://github.com/commune-dxos/commune-dxos.git
cd commune-dxos
cp .env.example .env      # không có mật khẩu nào cần điền
make up                   # lõi + ứng dụng DXOS_APP; tự init + unseal OpenBao
make ps                   # dịch vụ chạy nền "healthy", dịch vụ một lần "Exited (0)"
make smoke                # kiểm tra đầu-cuối: "== Kết quả: 405 đạt, 0 trượt"
make demo-users           # đặt mật khẩu cho người dùng mẫu và in ra
```

- `make up` tự gọi `bao-init`: lần đầu khởi tạo OpenBao, sinh bí mật ngẫu nhiên cho mọi dịch vụ và ghi **unseal key + root token** vào `.data/openbao/commune.json` (quyền 600, ngoài git). Chỉ cần gọi `make bao-init` riêng khi OpenBao bị seal mà không muốn khởi động lại cả hệ thống (mục 9).
- `make up` trả về khi container đã tạo; ClamAV cần thêm 1–2 phút để nạp CSDL virus. `make smoke` tự chờ dịch vụ healthy (tối đa ~3 phút) rồi mới kiểm.
- `make smoke` không xóa dữ liệu: nó thêm hồ sơ thử và đặt mật khẩu **ngẫu nhiên** cho người dùng mẫu, nên chạy `make demo-users` **sau** `make smoke`.
- Dừng: `make down` (giữ dữ liệu). Xóa sạch dữ liệu để chạy lại từ đầu: `docker compose --profile '*' down -v` rồi xóa `.data/openbao/commune.json`.

### Bí mật: OpenBao

Mọi mật khẩu, khóa, token của dịch vụ nằm trong OpenBao (MPL-2.0), không nằm trong repo hay `.env`. **Không xóa, không commit `.data/openbao/commune.json`**: mất tệp khi OpenBao đang seal là mất mọi bí mật; hãy sao lưu ra ngoài repo (`git clean -fdx` cũng xóa `.data/`). Tự unseal bằng tệp **chỉ dùng cho máy dev**; triển khai thật đặt `BAO_UNSEAL=manual` và unseal tay. Mỗi dịch vụ chỉ đọc được bí mật của mình (AppRole + policy). Chi tiết: [`docs/architecture.md` §4.4](docs/architecture.md#44-quản-lý-bí-mật-openbao-10).

```bash
make bao-init             # init (lần đầu) + unseal + policy, chạy lại an toàn
make bao-status           # initialized / sealed
docker compose exec openbao bao operator unseal   # unseal tay khi BAO_UNSEAL=manual
make bao-import-env       # chuyển mật khẩu từ .env cũ (trước v0.1.0)
```

## 5. Địa chỉ, cổng và tài khoản mẫu

| Dịch vụ | Địa chỉ | Ghi chú |
|---|---|---|
| API Gateway – công khai | http://localhost:9080/public/thu_tuc | không token, 60 request/phút/IP |
| API Gateway – dữ liệu (JWT) | http://localhost:9080/api/ho_so | PostgREST qua APISIX, RLS theo vai trò |
| API Gateway – quy trình (JWT) | http://localhost:9080/workflow/tasks | API quy trình của `mot-cua` → Flowable |
| API Gateway – tệp (JWT) | http://localhost:9080/files/ | tải tệp hồ sơ, ClamAV quét trước khi lưu |
| Keycloak – trang tài khoản | http://localhost:8080/realms/dxos/account | đăng nhập thử, cài OTP |
| Keycloak – quản trị | http://localhost:8080/admin/ | user `admin`; mật khẩu: `docker compose exec keycloak cat /run/dxos-secrets/admin_password` |
| PostgreSQL (debug) | `127.0.0.1:55432` | chỉ localhost |
| Flowable REST (debug) | `127.0.0.1:8090` | chỉ localhost; Tầng 2 gọi qua APISIX |

OpenBao, Garage, ClamAV, RabbitMQ, PostgREST không mở cổng ra máy host; chỉ truy cập qua gateway hoặc mạng nội bộ Docker.

**Tài khoản mẫu** (dữ liệu giả, realm `dxos`, mật khẩu do `make demo-users` đặt):

| Người dùng | Vai trò | Thử gì |
|---|---|---|
| `congdan01`, `congdan02` | `cong_dan` – công dân | nộp hồ sơ, chỉ thấy hồ sơ của mình |
| `canbo01` (hộ tịch), `canbo02` (chứng thực), `canbo03` (đất đai) | `can_bo` – cán bộ | task theo lĩnh vực phụ trách; **bắt buộc OTP** |
| `lanhdao01` | `lanh_dao` – lãnh đạo | phê duyệt, chỉ đọc hồ sơ; **bắt buộc OTP** |

```bash
make demo-users                                   # in mật khẩu chung
DXOS_DEMO_PASSWORD='mat-khau-cua-ban' make demo-users   # hoặc tự chọn
PW='<mật khẩu>'
TOKEN=$(curl -s http://localhost:8080/realms/dxos/protocol/openid-connect/token \
  -d grant_type=password -d client_id=dxos_cli -d username=congdan01 -d password="$PW" | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:9080/api/ho_so | jq    # chỉ hồ sơ của congdan01 (3 mẫu + hồ sơ do smoke nộp)
curl -s 'http://localhost:9080/public/rpc/json_schema_thu_tuc?ma=KS01' | jq      # JSON Schema thành phần hồ sơ (không token)
```

Cán bộ, lãnh đạo phải đăng nhập một lần ở trang tài khoản và quét mã QR bằng ứng dụng OTP (FreeOTP, Google Authenticator…); sau đó lấy token bằng curl thì gửi thêm `-d totp=<mã 6 số>`. Thêm lệnh thử từng route: [`docs/architecture.md` §8](docs/architecture.md#8-chạy-thử).

## 6. Cấu hình trước khi chạy

Mọi cấu hình nằm trong `.env` (sao chép từ [`.env.example`](.env.example), có chú thích từng biến), đọc lúc `make up`; không cần sửa mã hay `docker-compose.yml`. `.env` không chứa bí mật. Biến hay đổi:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DXOS_APP` | `mot-cua` | ứng dụng Tầng 2 trong `apps/` được nạp |
| `DXOS_SEED` | `true` | nạp dữ liệu mẫu giả; `false` khi triển khai thật |
| `APISIX_PORT`, `KEYCLOAK_PORT` | `9080`, `8080` | cổng gateway, SSO trên máy host |
| `POSTGRES_PORT`, `FLOWABLE_PORT` | `55432`, `8090` | cổng debug, chỉ 127.0.0.1 |
| `DXOS_CORS_ORIGINS` | `http://localhost:5173` | origin web được gọi API |
| `DXOS_GATEWAY_URL` | `http://localhost:9080` | địa chỉ gateway trong link tải tệp |
| `DXOS_FILE_MAX_BYTES` | `10485760` | cỡ tệp tối đa (≤ 10 MiB) |
| `BAO_UNSEAL` | `file` | `file` (máy dev) hoặc `manual` (triển khai thật) |
| `DXOS_SU_KIEN_QUET_GIAY`, `DXOS_SU_KIEN_SAP_TRE_NGAY` | `300`, `1` | chu kỳ quét và ngưỡng cảnh báo sắp trễ hạn |

Đổi `.env` khi hệ thống đang chạy: `make up` lại (Compose tạo lại dịch vụ bị ảnh hưởng). Đổi `DXOS_APP` sang ứng dụng khác cần CSDL mới (mục 7).

## 7. Thêm một ứng dụng vào `apps/`

Lõi chỉ biết **quy ước thư mục** `apps/<DXOS_APP>/`, không đọc nghiệp vụ. Một ứng dụng mới không sửa tệp nào trong `core/`, `docker-compose.yml` hay APISIX:

| Tệp | Lõi dùng để |
|---|---|
| `app.env` | schema PostgREST phơi ra API (`PGRST_DB_SCHEMAS=…`) |
| `db/migrations/*.sql`, `db/seed/*.sql` | role, schema, RLS; dữ liệu giả khi `DXOS_SEED=true` (`app-migrate`) |
| `keycloak/realm.json` | vai trò, nhóm, client, người dùng mẫu (`app-realm`) |
| `processes/*.bpmn20.xml` | quy trình BPMN, Flowable tự triển khai |
| `backend/main.py`, `backend/worker.py` | backend riêng (`/workflow`, `/files`) và tác vụ nền |
| `s3/buckets.conf`, `rabbitmq/definitions.json` | bucket S3 và exchange/queue riêng của ứng dụng |

```bash
mkdir -p apps/dat-phong-hop/{db/migrations,db/seed,keycloak,tests}
# viết app.env, db/migrations/001_schema.sql, keycloak/realm.json theo mẫu apps/mot-cua/ (nhớ dòng SPDX: make license)
sed -i.bak 's/^DXOS_APP=.*/DXOS_APP=dat-phong-hop/' .env && rm .env.bak
docker compose --profile '*' down -v && rm -f .data/openbao/commune.json   # CSDL mới
make up && make smoke
```

Hướng dẫn đầy đủ, hợp đồng giữa lõi và ứng dụng: [`docs/architecture.md` §2](docs/architecture.md#2-lõi-độc-lập-nghiệp-vụ-core-và-appstên); ứng dụng mẫu: [`apps/mot-cua/README.md`](apps/mot-cua/README.md).

## 8. Kiểm thử và đóng góp

```bash
make check                # SPDX + BPMN + test đơn vị + compose hợp lệ (mọi profile)
make lint                 # shellcheck, yamllint, BPMN (như CI); cài: pip install -r scripts/requirements-lint.txt
make test                 # test đơn vị + SQL/RLS trên PostgreSQL tạm
make smoke                # kiểm tra đầu-cuối trên hệ thống đang chạy
make license              # thêm header SPDX cho tệp mới
```

CI trên GitHub Actions chạy 6 job bắt buộc cho mỗi PR: `make-check`, `shellcheck`, `yamllint`, `bpmn`, `test-backend`, `test-sql`, cùng lệnh như trên máy. Quy trình issue → nhánh `feature/<số>-<tên>` → PR về `develop`, quy ước commit: [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Báo lỗi, đề xuất: [GitHub Issues](https://github.com/commune-dxos/commune-dxos/issues) (có mẫu issue; ghi lệnh đã chạy, output `make ps` và `docker compose version`).

## 9. Xử lý lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `port is already allocated` / `address already in use` (8080, 9080, 55432, 8090) | Đổi cổng trong `.env` (`KEYCLOAK_PORT`, `APISIX_PORT`, `POSTGRES_PORT`, `FLOWABLE_PORT`) rồi `make up`; tìm tiến trình chiếm cổng: `lsof -i :8080` |
| Sau khi khởi động lại máy/Docker, dịch vụ không lên, `*-secrets` thoát mã 1, `make bao-status` báo `Sealed true` | Bình thường: OpenBao luôn seal sau khi khởi động lại. Chạy `make up` (hoặc `make bao-init` rồi `make up`) để unseal bằng `.data/openbao/commune.json` |
| `bao-init: thiếu /bao-init/commune.json: OpenBao đã khởi tạo nhưng không có unseal key/root token trên máy này` | Đã mất tệp `.data/openbao/commune.json`: khôi phục từ bản sao lưu. Không còn bản nào thì chỉ còn cách xóa dữ liệu: `docker compose --profile '*' down -v`, `make up` |
| Container bị `OOMKilled`, Keycloak/Flowable khởi động lại liên tục | Tăng RAM cho Docker lên ≥ 6 GB (Docker Desktop → Settings → Resources); tắt ứng dụng nặng khác |
| `no space left on device` khi tải image | Cần ≥ 5 GB trống. Dọn: `docker image prune -a -f`, `docker builder prune -f`; xem `docker system df` |
| `make smoke` trượt `clamav healthy` (`starting`) | Lần đầu ClamAV tải CSDL virus (~250 MB); chờ 1–2 phút rồi chạy lại |
| `/public/…` trả 429 hoặc `{"error_msg":…}` ngay sau `make smoke` | Bước cuối của smoke cố ý dùng hết hạn mức 60 request/phút; đợi 1 phút (lần smoke kế tiếp tự chờ) |
| `invalid_grant – Account is not fully set up` khi lấy token cán bộ/lãnh đạo | Chưa cài OTP: đăng nhập trang tài khoản một lần (mục 5) |
| `Thiếu .env` | `cp .env.example .env` |
| Muốn chạy song song bản thứ hai | Đặt `COMPOSE_PROJECT_NAME=<tên khác>` và đổi 4 cổng trong `.env`; mỗi project có volume và tệp khóa OpenBao riêng (`.data/openbao/<tên>.json`) |

## 10. Giấy phép

Mã nguồn của dự án phát hành theo [Apache License 2.0](LICENSE); mỗi tệp mã và tệp cấu hình đều có dòng `SPDX-License-Identifier: Apache-2.0`, được kiểm tra bằng `make check` trên mỗi PR. Đội chọn Apache-2.0 vì:

- cho phép cơ quan nhà nước và doanh nghiệp tự do dùng, sửa và triển khai lại, kể cả tích hợp vào hệ thống riêng;
- có điều khoản cấp quyền sáng chế rõ ràng, giảm rủi ro pháp lý cho đơn vị triển khai;
- tương thích với các thành phần lõi (Keycloak, APISIX, Flowable, Superset đều dùng Apache-2.0).

Thành phần bên thứ ba giữ giấy phép riêng, liệt kê trong [`NOTICE`](NOTICE) và [`DEPENDENCIES.md`](DEPENDENCIES.md). Thành phần AGPL/GPL (Garage, ClamAV) chỉ chạy như dịch vụ riêng bằng image gốc, không sửa và không liên kết vào mã của dự án. Hình ảnh trong `docs/images/` do đội tạo (ảnh minh họa bằng công cụ AI tạo ảnh, sơ đồ vẽ tay bằng SVG), phát hành cùng giấy phép Apache-2.0: [`docs/images/README.md`](docs/images/README.md).

## 11. Phiên bản

Phiên bản theo [SemVer](https://semver.org/lang/vi/); thay đổi ghi trong [`CHANGELOG.md`](CHANGELOG.md) (mục `[Unreleased]` là phần đang làm). Bản phát hành kèm gói mã nguồn `.tar.gz`: [Releases](https://github.com/commune-dxos/commune-dxos/releases). Tiến độ theo tuần: [`docs/PLAN.md`](docs/PLAN.md); đối chiếu yêu cầu đề thi: [`docs/de-thi-mapping.md`](docs/de-thi-mapping.md).
