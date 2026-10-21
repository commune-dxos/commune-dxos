# Commune DX-OS — Hệ điều hành Chính quyền số Cấp xã

> OLP PMNM 2026 · Đề tài DX-OS Open-Core · Giấy phép [Apache-2.0](LICENSE)

**VI:** Nền tảng nguồn mở giúp chính quyền cấp xã tiếp nhận và xử lý thủ tục hành chính trực tuyến, theo dõi trễ hạn và hỗ trợ người dân tra cứu thủ tục bằng trợ lý AI chạy nội bộ.

**EN:** An open-source platform for commune-level governments to receive and process administrative procedures online, track overdue cases, and help citizens with an on-premise AI assistant.

## Trạng thái / Status
Đang xây dựng. Xem [`docs/de-thi-mapping.md`](docs/de-thi-mapping.md), [`docs/architecture.md`](docs/architecture.md) và [`CHANGELOG.md`](CHANGELOG.md).

**EN:** Work in progress. Architecture: [`docs/architecture.md`](docs/architecture.md) (Vietnamese).

## Chạy nhanh / Quick start
Cần Docker Compose v2 và khoảng 3 GB trống cho image của profile `core`.
Requires Docker Compose v2 and about 3 GB free disk for the `core` images.

```bash
cp .env.example .env      # không có mật khẩu nào cần điền / no passwords to fill in; DXOS_APP=mot-cua
make up                   # lõi core/ + ứng dụng apps/$DXOS_APP; tự init + unseal OpenBao / core + app, auto init + unseal OpenBao
make smoke                # JWT, MFA, RLS, policy OpenBao, sự kiện RabbitMQ, migration chạy lại / end-to-end checks
make check                # SPDX + docker-compose hợp lệ / SPDX + compose validation
```

### Bí mật: OpenBao / Secrets: OpenBao
**VI:** Mọi mật khẩu, khóa, token của dịch vụ nằm trong OpenBao (MPL-2.0), không nằm trong repo hay `.env`. Lần `make up` đầu tiên khởi tạo OpenBao, sinh bí mật ngẫu nhiên và ghi **unseal key + root token** vào `.data/openbao/commune.json` (quyền 600, ngoài git). **Không xóa, không commit tệp này** — mất tệp khi OpenBao đang seal là mất mọi bí mật; hãy sao lưu nó ra ngoài repo (`git clean -fdx` cũng xóa `.data/`). Sau mỗi lần khởi động lại, OpenBao ở trạng thái seal: `make up` (hoặc `make bao-init`) tự unseal bằng tệp đó — **chỉ dùng cho máy dev**; triển khai thật đặt `BAO_UNSEAL=manual` và unseal tay. Mỗi dịch vụ chỉ đọc được bí mật của mình (AppRole + policy). Chi tiết, cách chuyển từ `.env` cũ: [`docs/architecture.md` §4.4](docs/architecture.md#44-quản-lý-bí-mật-openbao-10).

**EN:** All service passwords, keys and tokens live in OpenBao (MPL-2.0), never in the repo or `.env`. The first `make up` initialises OpenBao, generates random secrets and writes the **unseal key + root token** to `.data/openbao/commune.json` (mode 600, git-ignored). **Do not delete or commit this file** — losing it while OpenBao is sealed loses every secret; back it up outside the repo. After any restart OpenBao is sealed: `make up` (or `make bao-init`) unseals it from that file — **development only**; in production set `BAO_UNSEAL=manual` and unseal by hand. Each service can read only its own secrets (AppRole + policy).

```bash
make bao-init             # init (lần đầu) + unseal + policy / init (first run) + unseal + policies
make bao-status           # initialized / sealed
docker compose exec openbao bao operator unseal   # unseal tay khi BAO_UNSEAL=manual / manual unseal
make bao-import-env       # chuyển mật khẩu từ .env cũ (trước #10) / migrate passwords from a pre-#10 .env
```

**VI:** Mã chia hai tầng: `core/` là lõi Tầng 1 không chứa nghiệp vụ (PostgreSQL + RLS, Keycloak realm `dxos`, APISIX, PostgREST); `apps/<tên>/` là ứng dụng Tầng 2 cắm vào lõi, chọn bằng biến `DXOS_APP` (ứng dụng chính: [`apps/mot-cua/`](apps/mot-cua/)). Cách viết một ứng dụng mới: [`docs/architecture.md` §2](docs/architecture.md#2-lõi-độc-lập-nghiệp-vụ-core-và-appstên).

**EN:** The code has two layers: `core/` is the business-agnostic Tier-1 core; `apps/<name>/` are Tier-2 applications plugged into it, selected with `DXOS_APP` (main app: [`apps/mot-cua/`](apps/mot-cua/), one-stop administrative services). How to plug in another app: [`docs/architecture.md` §2](docs/architecture.md#2-lõi-độc-lập-nghiệp-vụ-core-và-appstên).


| Dịch vụ / Service | Địa chỉ / URL |
|---|---|
| API Gateway (APISIX) – có JWT / with JWT | http://localhost:9080/api/ |
| API Gateway (APISIX) – công khai / public (`anon`) | http://localhost:9080/public/ |
| API Gateway (APISIX) – quy trình / workflow (JWT) | http://localhost:9080/workflow/tasks |
| Keycloak (realm `dxos`) | http://localhost:8080/admin/ |

Lệnh thử route có/không token: [`docs/architecture.md`](docs/architecture.md#8-chạy-thử).

## Giấy phép / License
**VI:** Mã nguồn của dự án phát hành theo [Apache License 2.0](LICENSE); mỗi tệp mã và tệp cấu hình đều có dòng `SPDX-License-Identifier: Apache-2.0`, được kiểm tra bằng `make check` trên mỗi PR. Đội chọn Apache-2.0 vì:
- cho phép cơ quan nhà nước và doanh nghiệp tự do dùng, sửa và triển khai lại, kể cả tích hợp vào hệ thống riêng;
- có điều khoản cấp quyền sáng chế rõ ràng, giảm rủi ro pháp lý cho đơn vị triển khai;
- tương thích với các thành phần lõi (Keycloak, APISIX, Flowable, Superset đều dùng Apache-2.0).

Thành phần bên thứ ba giữ giấy phép riêng, liệt kê trong [`NOTICE`](NOTICE) và [`DEPENDENCIES.md`](DEPENDENCIES.md). Thành phần AGPL/GPL (Garage, ClamAV) chỉ chạy như dịch vụ riêng bằng image gốc, không sửa và không liên kết vào mã của dự án.

**EN:** The project's source code is released under the [Apache License 2.0](LICENSE); every code and configuration file carries an `SPDX-License-Identifier: Apache-2.0` line, checked by `make check` on each PR. We chose Apache-2.0 because:
- public agencies and companies can freely use, modify and redeploy it, including inside their own systems;
- it includes an explicit patent grant, lowering legal risk for adopters;
- it matches the core components (Keycloak, APISIX, Flowable, Superset are all Apache-2.0).

Third-party components keep their own licenses, listed in [`NOTICE`](NOTICE) and [`DEPENDENCIES.md`](DEPENDENCIES.md). AGPL/GPL components (Garage, ClamAV) run only as separate services from their upstream images, unmodified and not linked into our code.

## Đóng góp / Contributing
Xem [`CONTRIBUTING.md`](CONTRIBUTING.md) và [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
