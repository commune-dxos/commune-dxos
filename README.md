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
cp .env.example .env      # đổi mọi mật khẩu / change every password
make up                   # PostgreSQL, Keycloak, PostgREST, APISIX
make check                # SPDX + docker-compose hợp lệ / SPDX + compose validation
```

| Dịch vụ / Service | Địa chỉ / URL |
|---|---|
| API Gateway (APISIX) | http://localhost:9080/api/ |
| Keycloak (realm `commune`) | http://localhost:8080/admin/ |

Lệnh thử route có/không token: [`docs/architecture.md`](docs/architecture.md#7-chạy-thử).

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
