# Cài đặt và chạy Commune DX-OS từ máy sạch

Hướng dẫn đầy đủ cho phần Cài đặt của [README](../README.md): yêu cầu máy, các bước chạy, bí mật OpenBao, địa chỉ và tài khoản mẫu, cấu hình, thêm thủ tục, kiểm thử, xử lý lỗi. Mọi số đo (thời gian, dung lượng, số kiểm tra) lấy từ lần chạy trên bản clone sạch ghi ở [`architecture.md` §8.9](architecture.md#89-kết-quả-chạy-từ-máy-sạch-theo-readme-21102026-12).

Mục lục: [Yêu cầu máy](#1-yêu-cầu-máy) · [Chạy từ máy sạch](#2-chạy-từ-máy-sạch) · [Địa chỉ và tài khoản mẫu](#3-địa-chỉ-cổng-và-tài-khoản-mẫu) · [Cấu hình](#4-cấu-hình-trước-khi-chạy) · [Thêm thủ tục](#5-thêm-một-thủ-tục-vào-thu-tuc) · [Kiểm thử](#6-kiểm-thử) · [Xử lý lỗi](#7-xử-lý-lỗi-thường-gặp)

## 1. Yêu cầu máy

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

## 2. Chạy từ máy sạch

Clone vào thư mục nào cũng chạy được (không có đường dẫn tuyệt đối), và gọi được từ thư mục khác: `make -C /duong/dan/commune-dxos up`. Lần đầu `make up` mất khoảng **2–10 phút** tùy mạng (phần lớn là tải image), `make smoke` thêm khoảng 1,5 phút; các lần sau `make up` khoảng 35 giây. Đo được trên bản clone sạch (Docker Desktop, macOS arm64, 21/10/2026): `make up` lần đầu 2 phút 8 giây, `make smoke` 93 giây, 405/405 đạt.

```bash
git clone https://github.com/commune-dxos/commune-dxos.git
cd commune-dxos
cp .env.example .env      # không có mật khẩu nào cần điền
make up                   # nền tảng + bộ máy mot-cua + nạp gói thu-tuc/ + cổng công dân; tự init + unseal OpenBao
make ps                   # dịch vụ chạy nền "healthy", dịch vụ một lần "Exited (0)"
make smoke                # kiểm tra đầu-cuối: "== Kết quả: 405 đạt, 0 trượt"
make demo-users           # đặt mật khẩu cho người dùng mẫu và in ra
```

- `make up` tự gọi `bao-init`: lần đầu khởi tạo OpenBao, sinh bí mật ngẫu nhiên cho mọi dịch vụ và ghi **unseal key + root token** vào `.data/openbao/commune.json` (quyền 600, ngoài git). Chỉ cần gọi `make bao-init` riêng khi OpenBao bị seal mà không muốn khởi động lại cả hệ thống (mục 7).
- Mở cổng công dân ở **http://localhost:9080/** (APISIX phục vụ bản build của `mot-cua/web-cong-dan/`, dịch vụ `mot-cua-web`). `make up` build image web (`docker compose up --build`); lần đầu thêm khoảng 1 phút để `npm ci` + `vite build`, các lần sau dùng cache, chỉ build lại khi mã web đổi.
- `make up` trả về khi container đã tạo; ClamAV cần thêm 1–2 phút để nạp CSDL virus. `make smoke` tự chờ dịch vụ healthy (tối đa ~3 phút) rồi mới kiểm.
- `make smoke` không xóa dữ liệu: nó thêm hồ sơ thử và đặt mật khẩu **ngẫu nhiên** cho người dùng mẫu, nên chạy `make demo-users` **sau** `make smoke`.
- Dừng: `make down` (giữ dữ liệu). Xóa sạch dữ liệu để chạy lại từ đầu: `docker compose --profile '*' down -v` rồi xóa `.data/openbao/commune.json`.

### Bí mật: OpenBao

Mọi mật khẩu, khóa, token của dịch vụ nằm trong OpenBao (MPL-2.0), không nằm trong repo hay `.env`. **Không xóa, không commit `.data/openbao/commune.json`**: mất tệp khi OpenBao đang seal là mất mọi bí mật; hãy sao lưu ra ngoài repo (`git clean -fdx` cũng xóa `.data/`). Tự unseal bằng tệp **chỉ dùng cho máy dev**; triển khai thật đặt `BAO_UNSEAL=manual` và unseal tay. Mỗi dịch vụ chỉ đọc được bí mật của mình (AppRole + policy). Chi tiết: [`docs/architecture.md` §4.4](architecture.md#44-quản-lý-bí-mật-openbao-10).

```bash
make bao-init             # init (lần đầu) + unseal + policy, chạy lại an toàn
make bao-status           # initialized / sealed
docker compose exec openbao bao operator unseal   # unseal tay khi BAO_UNSEAL=manual
make bao-import-env       # chuyển mật khẩu từ .env cũ (trước v0.1.0)
```

## 3. Địa chỉ, cổng và tài khoản mẫu

| Dịch vụ | Địa chỉ | Ghi chú |
|---|---|---|
| **Cổng công dân** | **http://localhost:9080/** | web Tầng 2 (`mot-cua-web`) qua APISIX; đăng nhập `congdan01` |
| **Hỏi đáp thủ tục** | **http://localhost:9080/hoi-dap** | trợ lý thủ tục hành chính (#91), không cần đăng nhập; mặc định chỉ tìm kiếm, thêm mô hình: mục 4 |
| **Cổng cán bộ** | **http://localhost:9080/can-bo** | cùng web, client `mot_cua_can_bo`; đăng nhập `canbo01`, `lanhdao01` (mật khẩu + OTP); luồng: [`cong-can-bo.md`](cong-can-bo.md) |
| API Gateway – công khai | http://localhost:9080/public/thu_tuc | không token, 60 request/phút/IP |
| API Gateway – dữ liệu (JWT) | http://localhost:9080/api/ho_so | PostgREST qua APISIX, RLS theo vai trò |
| API Gateway – quy trình (JWT) | http://localhost:9080/workflow/tasks | API quy trình của `mot-cua` → Flowable |
| API Gateway – tệp (JWT) | http://localhost:9080/files/ | tải tệp hồ sơ, ClamAV quét trước khi lưu |
| Keycloak – trang tài khoản | http://localhost:8080/realms/dxos/account | đăng nhập thử, cài OTP |
| Keycloak – quản trị | http://localhost:8080/admin/ | user `admin`; mật khẩu: `docker compose exec keycloak cat /run/dxos-secrets/admin_password` |
| PostgreSQL (debug) | `127.0.0.1:55432` | chỉ localhost |
| Flowable REST (debug) | `127.0.0.1:8090` | chỉ localhost; Tầng 2 gọi qua APISIX |

OpenBao, Garage, ClamAV, RabbitMQ, Meilisearch, Ollama, PostgREST, `mot-cua-web`, `tro-ly` không mở cổng ra máy host; chỉ truy cập qua gateway hoặc mạng nội bộ Docker.

**Tài khoản mẫu** (dữ liệu giả, realm `dxos`, mật khẩu do `make demo-users` đặt):

| Người dùng | Vai trò | Thử gì |
|---|---|---|
| `congdan01`, `congdan02` | `cong_dan` – công dân | nộp hồ sơ, chỉ thấy hồ sơ của mình |
| `canbo01` (hộ tịch), `canbo02` (chứng thực), `canbo03` (đất đai) | `can_bo` – cán bộ | cổng cán bộ `/can-bo`: task theo lĩnh vực phụ trách; **bắt buộc OTP** |
| `lanhdao01` | `lanh_dao` – lãnh đạo | cổng cán bộ `/can-bo`: phê duyệt, chỉ đọc hồ sơ; **bắt buộc OTP** |

```bash
make demo-users                                   # in mật khẩu chung
DXOS_DEMO_PASSWORD='mat-khau-cua-ban' make demo-users   # hoặc tự chọn
PW='<mật khẩu>'
TOKEN=$(curl -s http://localhost:8080/realms/dxos/protocol/openid-connect/token \
  -d grant_type=password -d client_id=dxos_cli -d username=congdan01 -d password="$PW" | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:9080/api/ho_so | jq    # chỉ hồ sơ của congdan01 (3 mẫu + hồ sơ do smoke nộp)
curl -s 'http://localhost:9080/public/rpc/json_schema_thu_tuc?ma=KS01' | jq      # JSON Schema thành phần hồ sơ (không token)
```

Cán bộ, lãnh đạo phải đăng nhập một lần ở trang tài khoản và quét mã QR bằng ứng dụng OTP (FreeOTP, Google Authenticator…); sau đó lấy token bằng curl thì gửi thêm `-d totp=<mã 6 số>`. Thêm lệnh thử từng route: [`docs/architecture.md` §8](architecture.md#8-chạy-thử).

## 4. Cấu hình trước khi chạy

Mọi cấu hình nằm trong `.env` (sao chép từ [`.env.example`](../.env.example), có chú thích từng biến), đọc lúc `make up`; không cần sửa mã hay `docker-compose.yml`. `.env` không chứa bí mật. Biến hay đổi:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DXOS_SEED` | `true` | nạp dữ liệu mẫu giả; `false` khi triển khai thật |
| `APISIX_PORT`, `KEYCLOAK_PORT` | `9080`, `8080` | cổng gateway, SSO trên máy host |
| `POSTGRES_PORT`, `FLOWABLE_PORT` | `55432`, `8090` | cổng debug, chỉ 127.0.0.1 |
| `DXOS_CORS_ORIGINS` | `http://localhost:5173` | origin web khác được gọi API (`npm run dev`); origin của gateway luôn được thêm |
| `DXOS_GATEWAY_URL` | `http://localhost:9080` | địa chỉ gateway trong link tải tệp, origin của cổng công dân |
| `DXOS_FILE_MAX_BYTES` | `10485760` | cỡ tệp tối đa (≤ 10 MiB) |
| `BAO_UNSEAL` | `file` | `file` (máy dev) hoặc `manual` (triển khai thật) |
| `DXOS_SU_KIEN_QUET_GIAY`, `DXOS_SU_KIEN_SAP_TRE_NGAY` | `300`, `1` | chu kỳ quét và ngưỡng cảnh báo sắp trễ hạn |
| `DXOS_THONG_BAO_KENH` | `email,sms` | kênh ngoài của thông báo sắp trễ hạn tới cán bộ (#56), để trống = chỉ trong cổng cán bộ; **chỉ giả lập**: ghi CSDL và log, không gửi thật |

| `LLM_PROVIDER` | `tat` | trợ lý thủ tục (#91): `tat` chỉ tìm kiếm · `ollama` (Qwen2.5 7B + bge-m3) · `openai-compatible` (API ngoài) · `gia-lap` (CI, smoke); chi tiết ở [`mot-cua/README.md`](../mot-cua/README.md#trợ-lý-thủ-tục-hành-chính-91) |

Đổi `.env` khi hệ thống đang chạy: `make up` lại (Compose tạo lại dịch vụ bị ảnh hưởng).

### Bật đọc giấy tờ bằng OCR (tùy chọn)

Chức năng "Đọc thông tin từ ảnh" khi nộp hồ sơ và thẻ "Thông tin đọc từ giấy tờ" cho cán bộ xác nhận (#93) cần dịch vụ `ocr` (PP-OCRv5 của PaddleOCR + VietOCR, chạy bằng ONNX Runtime, profile `ai`):

```bash
make up-ocr       # lần đầu build image: ~3 phút trên máy arm64, cần mạng để tải mô hình và mã nguồn OpenCV
```

Đo ngày 26/10/2026 trên arm64: image ~450 MB giải nén (Docker Desktop/OrbStack hiện ~714 MB vì tính cả bản nén 241 MB), trong đó mô hình ONNX 158 MB nằm sẵn trong image; lúc build cần thêm ~1,5 GB cho stage tạm (PyTorch CPU xuất VietOCR sang ONNX, biên dịch OpenCV), xong thì bỏ (`docker builder prune` để thu hồi). Dịch vụ dùng khoảng 0,5 GB RAM, đọc một trang mất 2–4 giây trên CPU. Không tải gì lúc chạy, không ra Internet.

Thử bằng ảnh mẫu GIẢ: http://localhost:9080/mau-gia/giay-to-tuy-than.png, http://localhost:9080/mau-gia/giay-chung-sinh.png (lưu về máy rồi chọn ở bước Giấy tờ khi nộp thủ tục Đăng ký khai sinh). Không bật thì hồ sơ vẫn nộp bình thường.

### Bật mô hình ngôn ngữ cho trợ lý thủ tục (tùy chọn)

Mặc định (`LLM_PROVIDER=tat`) trang Hỏi đáp trả các đoạn tài liệu liên quan nhất, không cần mô hình. Để trợ lý soạn câu trả lời có dẫn nguồn bằng Qwen2.5 7B (Apache-2.0) và tìm theo nghĩa bằng bge-m3 (MIT):

```bash
# .env: LLM_PROVIDER=ollama
make up-ai        # thêm Ollama (profile ai), tải qwen2.5:7b (4,7 GB) + bge-m3 (1,2 GB) lần đầu, nhúng lại kho tri thức
```

Cần thêm khoảng **6,5 GB RAM** cho Docker (đo được Ollama 6,2 GB khi nạp cả hai mô hình) và **13 GB ổ** (image Ollama giải nén 7,0 GB + mô hình 5,84 GB trong volume `ollama-models`). Trọng số tải lúc chạy, không nằm trong repo. Docker trên macOS không dùng được GPU nên Qwen2.5 7B chạy CPU khá chậm (khoảng nửa phút đến một phút mỗi câu trả lời). Nhanh hơn trên Mac: cài Ollama trên máy (dùng GPU Apple), `ollama pull qwen2.5:7b && ollama pull bge-m3`, đặt trong `.env` `LLM_PROVIDER=ollama` và `LLM_BASE_URL=http://host.docker.internal:11434`, rồi `make up && make nap-tri-thuc` (không cần profile `ai`). Dùng API ngoài theo chuẩn OpenAI: `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=https://…/v1`, khóa API đặt vào OpenBao như [`mot-cua/README.md`](../mot-cua/README.md#trợ-lý-thủ-tục-hành-chính-91).

## 5. Thêm một thủ tục vào `thu-tuc/`

Mỗi thủ tục hành chính là một gói `thu-tuc/<ma>/` (D-009); bộ máy một cửa `mot-cua/` chạy mọi thủ tục, nền tảng `nen-tang/` không biết thủ tục nào. Thêm thủ tục **không sửa tệp nào** trong `nen-tang/`, `mot-cua/`, `docker-compose.yml` hay APISIX:

| Tệp trong gói | Dùng để |
|---|---|
| `thu-tuc.yaml` | mã, tên, lĩnh vực, thời hạn (ngày làm việc, `0` = trong ngày), lệ phí, căn cứ pháp lý, process id |
| `quy-trinh.bpmn20.xml` | quy trình BPMN viết tay; biến từng bước khai bằng `flowable:formProperty` |
| `thanh-phan-ho-so.schema.json` | JSON Schema thành phần hồ sơ (Poka-yoke) |
| `du-lieu-mau.json` | hồ sơ mẫu giả khớp schema |
| `README.md` | mô tả, sơ đồ |

```bash
cp -R thu-tuc/chung-thuc-ban-sao thu-tuc/xac-nhan-cu-tru   # chép một gói có sẵn rồi sửa 5 tệp
make check                # kiểm gói (không cần Docker)
make nap-thu-tuc          # nạp vào hệ thống đang chạy: deploy BPMN + ghi danh mục
curl -s 'http://localhost:9080/public/thu_tuc?goi=not.is.null&select=ma,ten,goi'
```

Rút thủ tục: xóa thư mục rồi `make nap-thu-tuc`. Gói lỗi bị báo rõ từng lỗi và bỏ qua, các gói khác vẫn nạp. Hướng dẫn 5 bước đầy đủ: [`docs/thu-tuc.md`](thu-tuc.md); hợp đồng giữa các lớp: [`docs/architecture.md` §2](architecture.md#2-ba-lớp-nen-tang-bộ-máy-mot-cua-gói-thu-tucma-d-009); bộ máy: [`mot-cua/README.md`](../mot-cua/README.md).

## 6. Kiểm thử

```bash
make check                # SPDX + BPMN + kiểm gói thu-tuc/ + test đơn vị + compose hợp lệ (mọi profile)
make lint                 # shellcheck, yamllint, BPMN (như CI); cài: pip install -r scripts/requirements-lint.txt
make test                 # test đơn vị + SQL/RLS trên PostgreSQL tạm
make smoke                # kiểm tra đầu-cuối trên hệ thống đang chạy
make license              # thêm header SPDX cho tệp mới
```

CI trên GitHub Actions chạy 6 job bắt buộc cho mỗi PR: `make-check`, `shellcheck`, `yamllint`, `bpmn`, `test-backend`, `test-sql`, cùng lệnh như trên máy. Quy trình issue → nhánh `feature/<số>-<tên>` → PR về `develop`, quy ước commit: [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md). Báo lỗi, đề xuất: [GitHub Issues](https://github.com/commune-dxos/commune-dxos/issues) (có mẫu issue; ghi lệnh đã chạy, output `make ps` và `docker compose version`).

## 7. Xử lý lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `port is already allocated` / `address already in use` (8080, 9080, 55432, 8090) | Đổi cổng trong `.env` (`KEYCLOAK_PORT`, `APISIX_PORT`, `POSTGRES_PORT`, `FLOWABLE_PORT`) rồi `make up`; tìm tiến trình chiếm cổng: `lsof -i :8080` |
| Sau khi khởi động lại máy/Docker, dịch vụ không lên, `*-secrets` thoát mã 1, `make bao-status` báo `Sealed true` | Bình thường: OpenBao luôn seal sau khi khởi động lại. Chạy `make up` (hoặc `make bao-init` rồi `make up`) để unseal bằng `.data/openbao/commune.json` |
| `bao-init: thiếu /bao-init/commune.json: OpenBao đã khởi tạo nhưng không có unseal key/root token trên máy này` | Đã mất tệp `.data/openbao/commune.json`: khôi phục từ bản sao lưu. Không còn bản nào thì chỉ còn cách xóa dữ liệu: `docker compose --profile '*' down -v`, `make up` |
| Container bị `OOMKilled`, Keycloak/Flowable khởi động lại liên tục | Tăng RAM cho Docker lên ≥ 6 GB (Docker Desktop → Settings → Resources); tắt ứng dụng nặng khác |
| `no space left on device` khi tải image | Cần ≥ 5 GB trống. Dọn: `docker image prune -a -f`, `docker builder prune -f`; xem `docker system df` |
| `make smoke` trượt `clamav healthy` (`starting`) | Lần đầu ClamAV tải CSDL virus (~250 MB); chờ 1–2 phút rồi chạy lại |
| `/public/…` trả 429 hoặc `{"error_msg":…}` ngay sau `make smoke` | Bước cuối của smoke cố ý dùng hết hạn mức 60 request/phút; đợi 1 phút (lần smoke kế tiếp tự chờ) |
| `invalid_grant – Account is not fully set up` khi lấy token cán bộ/lãnh đạo | Chưa cài OTP: đăng nhập trang tài khoản một lần (mục 3) |
| Cổng công dân http://localhost:9080/ báo `Invalid parameter: redirect_uri` khi đăng nhập (máy đã chạy bản v0.4.0 trở về trước, volume cũ) | `tang2-realm` không ghi đè client đã có, nên client `mot_cua_web` cũ chưa có địa chỉ của gateway. Thêm một lần (lệnh bên dưới bảng), không mất dữ liệu |
| `Thiếu .env` | `cp .env.example .env` |
| Muốn chạy song song bản thứ hai | Đặt `COMPOSE_PROJECT_NAME=<tên khác>` và đổi 4 cổng trong `.env`; mỗi project có volume và tệp khóa OpenBao riêng (`.data/openbao/<tên>.json`) |

Thêm địa chỉ gateway vào client `mot_cua_web` trên volume cũ (đổi `9080` nếu đặt `APISIX_PORT` khác):

```bash
docker compose exec -T keycloak bash -c 'k=/opt/keycloak/bin/kcadm.sh; c=/tmp/kc57.config
$k config credentials --config $c --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$(< /run/dxos-secrets/admin_password)"
id=$($k get clients --config $c -r dxos -q clientId=mot_cua_web --fields id --format csv --noquotes)
$k update clients/$id --config $c -r dxos \
  -s "redirectUris=[\"http://localhost:9080/*\",\"http://localhost:5173/*\"]" \
  -s "webOrigins=[\"http://localhost:9080\",\"http://localhost:5173\"]" \
  -s "attributes.\"post.logout.redirect.uris\"=http://localhost:9080/*##http://localhost:5173/*"; rm -f $c'
```
