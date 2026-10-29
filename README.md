<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo/logo-ngang-nen-trang.png">
    <img src="docs/images/logo/logo-ngang.png" alt="Logo Commune DX-OS: mái nhà công sở che hồ sơ có dấu tích đỏ và hai gói thủ tục cắm vào thanh đế, chữ COMMUNE DX-OS, khẩu hiệu Chính quyền số Cấp xã" width="480">
  </picture>
</p>

<p align="center">
  <img src="docs/images/banner.webp" alt="Ảnh đầu trang có tiêu đề DTU_DZ_2 · OLP PMNM 2026 · COMMUNE DX-OS, Hệ điều hành Chính quyền số Cấp xã: bộ phận một cửa của xã, người dân nộp hồ sơ từ điện thoại, hồ sơ điện tử chuyển giữa các bàn cán bộ" width="100%">
</p>

# Commune DX-OS — Hệ điều hành Chính quyền số Cấp xã

**Người dân nộp hồ sơ một lần, cán bộ xã biết hồ sơ đang ở đâu và còn bao lâu tới hạn.**

[![Giấy phép GPL-3.0-or-later](https://img.shields.io/badge/gi%E1%BA%A5y%20ph%C3%A9p-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Phiên bản](https://img.shields.io/github/v/release/commune-dxos/commune-dxos?label=phi%C3%AAn%20b%E1%BA%A3n)](https://github.com/commune-dxos/commune-dxos/releases)
[![CI](https://github.com/commune-dxos/commune-dxos/actions/workflows/check.yml/badge.svg?branch=develop)](https://github.com/commune-dxos/commune-dxos/actions/workflows/check.yml)
[![Trang tài liệu](https://github.com/commune-dxos/commune-dxos/actions/workflows/tai-lieu.yml/badge.svg?branch=develop)](https://commune-dxos.github.io/commune-dxos/)

Nguồn mở, chạy trên một máy ở xã. Đội DTU_DZ_2 · OLP PMNM 2026 · Đề tài DX-OS Open-Core.

**English:** [summary and quick start below](#english) · [docs in English](docs/en/index.md)

## Trước và sau chuyển đổi số

Tám việc hằng ngày ở bộ phận một cửa của xã, trước và sau khi có Commune DX-OS.

✅ đã phát hành, ghi bản đầu tiên có (mới nhất **v0.6.0**) · 🆕 có trên nhánh **`develop`**, vào bản phát hành tới · ⏳ **chưa làm**, ghi tuần dự kiến nếu đã xếp

| Trước | Sau |
|---|---|
| Người dân đến xã nộp hồ sơ, rồi quay lại vài lần chỉ để hỏi "xong chưa". | Nộp hồ sơ, tải giấy tờ, xem hồ sơ đang ở bước nào qua API. ✅ v0.1.0 · Cổng web cho người dân nộp hồ sơ: ✅ v0.4.0 · Biên nhận và thông báo kết quả PDF có ký số: ✅ v0.5.0 · Tra cứu tiến độ trên cổng web (không cần đăng nhập, bằng mã hồ sơ), nộp bổ sung trực tuyến: ✅ v0.6.0 · Trợ lý hỏi đáp thủ tục, trả lời có dẫn nguồn: ✅ v0.6.0 |
| Thiếu một tờ giấy, cán bộ trả về, người dân đi thêm một chuyến. | Mỗi thủ tục khai thành phần hồ sơ bằng JSON Schema, công khai để xem trước khi nộp. ✅ v0.1.0 · Chặn nộp khi còn thiếu (Poka-yoke), kiểm cả ở web và máy chủ: ✅ v0.5.0 |
| Hồ sơ giấy chuyển qua nhiều bàn, thất lạc, không ai biết đang nằm ở đâu. | Mỗi hồ sơ có mã, trạng thái và lịch sử từng bước của quy trình. Tệp có nhật ký chỉ ghi thêm, không sửa được. ✅ v0.1.0 · Trạng thái hồ sơ đi đúng bước quy trình Flowable: ✅ v0.5.0 |
| Hạn giải quyết tính tay, quá hạn rồi mới biết. | Hạn tự tính theo ngày làm việc, bỏ cuối tuần và ngày lễ. Còn ≤ 1 ngày thì hệ thống phát cảnh báo sắp trễ hạn qua hàng đợi. ✅ v0.1.0 · Cổng cán bộ xếp hồ sơ quá hạn, sắp trễ lên đầu: ✅ v0.5.0 · Thông báo sắp trễ hạn tới cán bộ trên cổng cán bộ, cập nhật ngay (email/SMS giả lập): ✅ v0.6.0 · Thông báo tới người dân: ⏳ chưa xếp tuần |
| Sổ hồ sơ để chung, ai cũng mở được. Giấy tờ gửi qua tin nhắn, không ai kiểm. | Cán bộ chỉ thấy hồ sơ thuộc lĩnh vực mình, đăng nhập phải có mã OTP. Tệp được quét mã độc trước khi lưu. ✅ v0.1.0 · Cổng cán bộ đăng nhập một lần + OTP; sổ văn bản đến/đi có ký số: ✅ v0.5.0 · Wiki văn bản nội bộ, ai thấy gì theo vai và lĩnh vực: ✅ v0.6.0 |
| Thêm một thủ tục mới phải chờ sửa phần mềm. | Thêm một thư mục `thu-tuc/<ma>/` rồi chạy `make nap-thu-tuc`. Không sửa mã. ✅ v0.2.0 · Thêm gói kết hôn, hòa giải tranh chấp đất đai đúng cách đó (4 gói): ✅ v0.6.0 |
| Lãnh đạo xã cộng sổ cuối tháng mới biết bao nhiêu hồ sơ trễ. | Dashboard thời gian giải quyết, tỷ lệ trễ hạn; nhật ký kiểm toán có chuỗi băm. ✅ v0.5.0 |
| Cán bộ gõ lại từng dòng trên giấy tờ người dân mang tới. | Chụp giấy tờ, hệ thống đọc chữ và điền sẵn, cán bộ xác nhận lại. ✅ v0.6.0 |

Kế hoạch từng tuần: [`docs/PLAN.md`](docs/PLAN.md). Đối chiếu yêu cầu đề thi: [`docs/de-thi-mapping.md`](docs/de-thi-mapping.md).

## Thủ tục đang hỗ trợ

| Mã | Thủ tục | Lĩnh vực | Thời hạn | Lệ phí | Gói |
|---|---|---|---|---|---|
| KS01 | Đăng ký khai sinh | Hộ tịch | 1 ngày làm việc | Miễn khi đăng ký đúng hạn | [`thu-tuc/khai-sinh/`](thu-tuc/khai-sinh/) |
| CT01 | Chứng thực bản sao từ bản chính | Chứng thực | Trong ngày | 2.000 đ/trang; từ trang thứ ba 1.000 đ/trang, tối đa 200.000 đ/bản | [`thu-tuc/chung-thuc-ban-sao/`](thu-tuc/chung-thuc-ban-sao/) |
| KH01 | Đăng ký kết hôn | Hộ tịch | 5 ngày làm việc (khi cần xác minh) | Miễn | [`thu-tuc/ket-hon/`](thu-tuc/ket-hon/) |
| DD01 | Hòa giải tranh chấp đất đai tại xã | Đất đai | 20 ngày làm việc | Không thu phí | [`thu-tuc/hoa-giai-dat-dai/`](thu-tuc/hoa-giai-dat-dai/) |

Mỗi gói gồm mô tả (`thu-tuc.yaml`), quy trình BPMN, JSON Schema thành phần hồ sơ và dữ liệu mẫu giả. Bảng trên chép từ `thu-tuc/*/thu-tuc.yaml`. Danh mục đầy đủ (thành phần hồ sơ, các bước, căn cứ pháp lý) tự sinh trên [trang tài liệu](https://commune-dxos.github.io/commune-dxos/danh-muc-thu-tuc/).

**Dữ liệu mở:** danh mục thủ tục kèm JSON Schema thành phần hồ sơ được công bố ở [`du-lieu-mo/thu-tuc-cap-xa/`](du-lieu-mo/thu-tuc-cap-xa/) (JSON, CSV) theo giấy phép **CC-BY-4.0** để xã khác, nhà phát triển dùng lại.

**Thêm thủ tục trong 5 bước:** chép gói có sẵn → sửa `thu-tuc.yaml` → vẽ quy trình → khai thành phần hồ sơ → `make nap-thu-tuc`. Hướng dẫn và ví dụ đầy đủ từ A đến Z: [`docs/thu-tuc.md`](docs/thu-tuc.md#ví-dụ-từ-a-đến-z-gói-xác-nhận-thông-tin-về-cư-trú).

## Hồ sơ đi qua hệ thống thế nào

<p align="center">
  <img src="docs/images/luong-ho-so.webp" alt="Luồng hồ sơ 5 bước: 1 Nộp hồ sơ, 2 Quét virus, 3 Thẩm định, 4 Phê duyệt, 5 Hoàn tất; cảnh báo trễ hạn gắn vào bước thẩm định" width="100%">
</p>

Người dân nộp hồ sơ; hệ thống cấp mã, tính hạn và khởi tạo quy trình của thủ tục. Giấy tờ tải lên được ClamAV quét, sạch mới lưu. Cán bộ lĩnh vực tiếp nhận, yêu cầu bổ sung nếu thiếu, rồi thẩm định. Lãnh đạo xã phê duyệt hoặc trả lại. Mỗi bước phát một sự kiện; hồ sơ sắp tới hạn sinh cảnh báo `ho_so.sap_tre_han`.

## Kiến trúc

<p align="center">
  <img src="docs/images/kien-truc-dong.svg" alt="Sơ đồ kiến trúc 2 tầng. Trên cùng là người dân, cán bộ một cửa, lãnh đạo xã. Tầng 2 mot-cua gồm cổng công dân và cổng cán bộ (tuần 3), mot-cua-api, mot-cua-worker và các gói thủ tục KS01 Khai sinh, CT01 Chứng thực bản sao cắm vào thu-tuc. Tầng 2 chỉ gọi Tầng 1 nen-tang qua APISIX. Tầng 1 headless gồm Keycloak, APISIX, PostgREST và PostgreSQL có RLS, ClamAV và Garage, Flowable, RabbitMQ, OpenBao cấp bí mật. Một hồ sơ KS01 chạy qua 6 bước: nộp qua APISIX và kiểm JWT, kiểm đủ thành phần hồ sơ, lưu, quét và lưu tệp, khởi tạo quy trình, cảnh báo sắp trễ hạn tới cán bộ" width="100%">
</p>

<sub>Ảnh tĩnh cho slide: [docs/images/kien-truc-2-tang.webp](docs/images/kien-truc-2-tang.webp)</sub>

Ba lớp, mỗi lớp một thư mục:

- [`nen-tang/`](nen-tang/): lõi headless Tầng 1. Chỉ có API, không giao diện, không nghiệp vụ.
- [`mot-cua/`](mot-cua/): bộ máy một cửa Tầng 2, chạy mọi thủ tục. Chỉ gọi lõi qua API Gateway.
- [`thu-tuc/`](thu-tuc/): mỗi thủ tục một gói, bộ nạp tự kiểm và nạp khi khởi động.

| Dịch vụ bắt buộc của đề | Thành phần | Cấu hình |
|---|---|---|
| SSO | Keycloak, OTP bắt buộc cho cán bộ và lãnh đạo | [`nen-tang/keycloak/`](nen-tang/keycloak/), [`mot-cua/keycloak/`](mot-cua/keycloak/) |
| API Gateway | Apache APISIX, giới hạn tần suất cho API công khai | [`nen-tang/apisix/`](nen-tang/apisix/) |
| Dữ liệu có cấu trúc và phi cấu trúc | PostgreSQL + RLS + PostgREST; Garage (S3) + ClamAV | [`nen-tang/postgres/`](nen-tang/postgres/), [`nen-tang/garage/`](nen-tang/garage/), [`mot-cua/db/`](mot-cua/db/) |
| Workflow engine | Flowable (BPMN 2.0), quy trình nằm trong từng gói | [`thu-tuc/<ma>/quy-trinh.bpmn20.xml`](thu-tuc/khai-sinh/quy-trinh.bpmn20.xml) |

Hỗ trợ thêm: RabbitMQ (sự kiện hồ sơ), OpenBao (bí mật). Mọi thành phần chạy bằng image gốc; thành phần AGPL/GPL (Garage, ClamAV) chạy như dịch vụ riêng, không sửa. Sơ đồ chi tiết, route gateway, luồng JWT: [`docs/architecture.md`](docs/architecture.md). Danh sách phụ thuộc và giấy phép: [`DEPENDENCIES.md`](DEPENDENCIES.md).

## Chạy thử trong 5 phút

Cần Docker (Compose v2.20+), RAM cho Docker 4 GB, ổ trống 6 GB, `git`, `make`, `curl`, `jq`, `python3`.

```bash
git clone https://github.com/commune-dxos/commune-dxos.git
cd commune-dxos
cp .env.example .env      # không có mật khẩu nào cần điền
make up                   # chạy lõi + bộ máy một cửa + nạp gói thu-tuc/ + cổng công dân
make smoke                # kiểm tra đầu-cuối, kết thúc bằng "0 trượt"
make demo-users           # đặt mật khẩu cho tài khoản mẫu và in ra
```

Lần đầu `make up` mất 2–10 phút tùy mạng, `make smoke` khoảng 1,5 phút. Dừng: `make down` (giữ dữ liệu). Không xóa, không commit `.data/openbao/commune.json`: mất tệp này là mất mọi bí mật.

Mở cổng công dân: **http://localhost:9080/** (APISIX phục vụ, cùng cổng với API; xem danh mục và chi tiết thủ tục không cần đăng nhập, nộp hồ sơ sau khi đăng nhập). Tra cứu tiến độ: **http://localhost:9080/tra-cuu** (mã hồ sơ + 4 số cuối số điện thoại, không cần đăng nhập) hoặc "Hồ sơ của tôi" sau khi đăng nhập. API công khai: http://localhost:9080/public/thu_tuc.

Mở cổng cán bộ: **http://localhost:9080/can-bo** (mật khẩu + mã OTP, lần đầu quét mã QR bằng ứng dụng OTP): hộp việc theo lĩnh vực, hạn xử lý đổi màu khi sắp trễ, chi tiết hồ sơ và tệp, xử lý từng bước tới khi lãnh đạo phê duyệt. Luồng: [`docs/cong-can-bo.md`](docs/cong-can-bo.md).

Tài khoản mẫu (dữ liệu giả): `congdan01` (người dân), `canbo01` (cán bộ hộ tịch), `canbo02` (cán bộ chứng thực), `lanhdao01` (lãnh đạo).

Cổng, tài khoản, gọi API bằng `curl`, xử lý lỗi: [`docs/cai-dat.md`](docs/cai-dat.md).

## Demo

Quay thật trên máy với tài khoản và giấy tờ mẫu giả (`make quay-demo`), mọi lời gọi đi qua APISIX.

**Người dân** xem danh mục, nộp hồ sơ đăng ký khai sinh: thiếu giấy chứng sinh thì cổng chặn ngay, chưa gửi gì lên máy chủ; đủ giấy tờ thì nộp được, nhận mã hồ sơ. Sau đó tra cứu tiến độ bằng mã hồ sơ và 4 số cuối số điện thoại, không cần đăng nhập.

<p align="center">
  <img src="docs/media/demo-cong-dan.gif" alt="Demo cổng công dân: trang chủ có danh mục thủ tục, mở Đăng ký khai sinh, bấm Bắt đầu nộp, đăng nhập, nhập số điện thoại; ở bước Giấy tờ chỉ tải tờ khai thì hiện lỗi Chưa tải giấy chứng sinh; tải đủ, kiểm tra lại, bấm Đồng ý và nộp hồ sơ, hiện Đã nộp hồ sơ kèm mã HS; trang Tra cứu hồ sơ nhập mã và 4 số cuối điện thoại, hiện trạng thái Mới nộp, chờ tiếp nhận" width="100%">
</p>

**Cán bộ hộ tịch** đăng nhập bằng mật khẩu và mã OTP, mở hồ sơ vừa nộp từ hộp việc, xác nhận đủ thành phần và hoàn thành bước tiếp nhận; hồ sơ chuyển sang bước thẩm định.

<p align="center">
  <img src="docs/media/demo-can-bo.gif" alt="Demo cổng cán bộ: trang Cổng cán bộ, đăng nhập Keycloak bằng tên canbo01, mật khẩu và mã OTP (đều hiện dấu chấm); hộp việc; chi tiết hồ sơ HS vừa nộp với người nộp, thành phần hồ sơ; ô Xử lý bước chọn Có ở câu Đủ thành phần hồ sơ?, bấm Hoàn thành bước, hiện Đã hoàn thành Tiếp nhận, bước tiếp theo Thẩm định hồ sơ" width="100%">
</p>

## Đội và cách đóng góp

Đội **DTU_DZ_2**. Việc chia theo tuần, mỗi việc một issue, một PR về `develop`.

| Muốn xem | Ở đâu |
|---|---|
| Việc đang làm | [GitHub Project "Commune DX-OS – Lộ trình"](https://github.com/orgs/commune-dxos/projects/1) |
| Việc theo tuần | [Milestones](https://github.com/commune-dxos/commune-dxos/milestones) |
| Cách làm một việc, nhãn, quy ước commit | [`docs/quy-trinh-lam-viec.md`](docs/quy-trinh-lam-viec.md), [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Đã thay đổi gì | [`CHANGELOG.md`](CHANGELOG.md) (sinh bằng git-cliff), [Releases](https://github.com/commune-dxos/commune-dxos/releases) |
| Báo lỗi, đề xuất thủ tục mới | [Issues](https://github.com/commune-dxos/commune-dxos/issues) |

Trước mỗi commit: `make check`. Cùng lệnh với CI: `make lint` (gồm `reuse lint`: toàn repo đạt đặc tả [REUSE 3.3](https://reuse.software)), `make test`.

Quy tắc ứng xử: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Nguồn hình ảnh: [`docs/images/README.md`](docs/images/README.md).

## Giấy phép

Commune DX-OS phát hành theo **[GNU GPL phiên bản 3 hoặc mới hơn](LICENSE)** (`GPL-3.0-or-later`); mỗi tệp mã có header SPDX.

- **Vì sao GPL-3.0:** phần mềm cho chính quyền số là tài sản công. Copyleft bảo đảm mọi bản sửa đổi được phân phối lại, kể cả của nhà cung cấp, vẫn phải giữ mã nguồn mở cho xã và người dân. Chọn bản 3 vì tương thích với các thành phần Apache-2.0 (Keycloak, APISIX, Flowable), bản 2 thì không.
- **Mốc chuyển:** v0.0.1, v0.1.0, v0.2.0 đã phát hành theo Apache-2.0 và giữ nguyên giấy phép đó; từ bản phát hành sau v0.2.0 là GPL-3.0-or-later (quyết định D-010, [#47](https://github.com/commune-dxos/commune-dxos/issues/47)).
- **Dữ liệu mở:** riêng thư mục [`du-lieu-mo/`](du-lieu-mo/) theo [CC-BY-4.0](LICENSES/CC-BY-4.0.txt) (khai trong `REUSE.toml`): dùng lại tự do, kể cả thương mại, miễn ghi công.
- **Bên thứ ba:** các thành phần giữ giấy phép riêng và chỉ dùng qua image gốc hoặc trình quản lý gói; Garage (AGPL-3.0) và ClamAV (GPL-2.0) chạy như dịch vụ riêng, không liên kết. Xem [`NOTICE`](NOTICE) và [`DEPENDENCIES.md`](DEPENDENCIES.md).

## English

**Commune DX-OS — a digital-government operating system for Vietnamese communes.** Citizens apply once; commune officers always know where an application is and how long is left before its deadline. Open source (GPL-3.0-or-later), runs on a single machine at the commune office. Team DTU_DZ_2 · OLP PMNM 2026 · topic DX-OS Open-Core.

### Before and after

| Before | After (released in) |
|---|---|
| Citizens come back to the office again and again to ask "is it done yet?". | Online application, progress lookup with the application code and last 4 phone digits, digitally signed receipt and result, Q&A assistant with cited sources (v0.1.0 → v0.6.0) |
| One missing paper means another trip. | Required documents declared per procedure as JSON Schema; incomplete applications blocked in the browser and on the server (v0.5.0) |
| Paper files get lost between desks. | Application code, status driven by the BPMN workflow, step history, append-only hash-chained audit log (v0.1.0, v0.5.0) |
| Deadlines counted by hand. | Working-day deadlines (weekends, holidays skipped), near-deadline alerts to officers in real time (v0.1.0, v0.6.0) |
| Anyone can open the register. | Officers see only their own field (row-level security), OTP login, virus scan before storage, internal wiki by role (v0.1.0 → v0.6.0) |
| A new procedure waits for a software change. | Add a `thu-tuc/<code>/` folder and run `make nap-thu-tuc`; four packages ship today (v0.2.0, v0.6.0) |
| Late files counted at month end. | Superset dashboard of processing time and late rate, audit log verifiable by anyone (v0.5.0) |
| Officers retype citizens' papers. | OCR pre-fills the form, an officer confirms (v0.6.0) |

### Supported procedures

Birth registration (KS01), certified copy from original (CT01), marriage registration (KH01), land-dispute mediation at the commune (DD01). Each package holds a description (`thu-tuc.yaml`), a hand-written BPMN workflow, a JSON Schema of required documents and fake sample data. Adding one, step by step with a complete worked example: [`docs/thu-tuc.md`](docs/thu-tuc.md#ví-dụ-từ-a-đến-z-gói-xác-nhận-thông-tin-về-cư-trú) (bilingual). The catalogue is also published as open data under CC-BY-4.0 in [`du-lieu-mo/thu-tuc-cap-xa/`](du-lieu-mo/thu-tuc-cap-xa/).

### How an application moves

The citizen applies; the system assigns a code, computes the deadline and starts the procedure's workflow. Uploaded papers are scanned by ClamAV and stored only when clean. An officer of the right field receives it, asks for missing papers if needed, then reviews it. The commune leader approves or sends it back. Every step emits an event; applications close to their deadline raise `ho_so.sap_tre_han`.

### Architecture

- [`nen-tang/`](nen-tang/): Tier 1 headless core. API only, no UI, no business logic.
- [`mot-cua/`](mot-cua/): Tier 2 one-stop-shop engine that runs every procedure, plus the citizen and staff portals (React). Talks to the core only through the API gateway.
- [`thu-tuc/`](thu-tuc/): one package per procedure, checked and loaded at start-up.

| Contest requirement | Component |
|---|---|
| SSO | Keycloak, OTP mandatory for officers and leaders |
| API gateway | Apache APISIX, rate limit on the public API |
| Structured and unstructured data | PostgreSQL + row-level security + PostgREST; Garage (S3) + ClamAV |
| Workflow engine | Flowable (BPMN 2.0), workflows live in the packages |

Also: RabbitMQ (events), OpenBao (secrets), step-ca + pyHanko + Gotenberg (signed PDFs), Meilisearch CE + pgvector (search), Superset + DuckDB + dbt (reporting). Overview: [`docs/en/architecture.md`](docs/en/architecture.md); full detail (Vietnamese): [`docs/architecture.md`](docs/architecture.md).

### Quick start

Needs Docker with Compose v2.20+, 4 GB of memory for Docker, 6 GB free disk, `git`, `make`, `curl`, `jq`, `python3`.

```bash
git clone https://github.com/commune-dxos/commune-dxos.git
cd commune-dxos
cp .env.example .env      # nothing to fill in
make up                   # core + one-stop-shop engine + procedure packages + citizen portal
make smoke                # end-to-end check, ends with "0 trượt" (0 failed)
make demo-users           # sets a password for the sample users and prints it
```

The first `make up` takes 2–10 minutes depending on the network. Stop with `make down` (data kept). Never delete or commit `.data/openbao/commune.json`: it holds the key to every secret.

Citizen portal: **http://localhost:9080/** · progress lookup: **http://localhost:9080/tra-cuu** · staff portal: **http://localhost:9080/can-bo** (password + OTP). Sample accounts (fake data): `congdan01` (citizen), `canbo01` (civil-status officer), `canbo02` (certification officer), `lanhdao01` (leader).

Requirements, ports, optional profiles (dashboard, OCR, local language model) and troubleshooting: [`docs/en/quick-start.md`](docs/en/quick-start.md).

### Team and contributing

Team **DTU_DZ_2**. Work is planned by week, one issue and one pull request to `develop` per task, tracked on the [project board](https://github.com/orgs/commune-dxos/projects/1) and [milestones](https://github.com/commune-dxos/commune-dxos/milestones). How to contribute: [`docs/en/contributing.md`](docs/en/contributing.md). Changes: [`CHANGELOG.md`](CHANGELOG.md) (generated with git-cliff), [Releases](https://github.com/commune-dxos/commune-dxos/releases). Bugs and proposals: [Issues](https://github.com/commune-dxos/commune-dxos/issues).

### License

**[GNU GPL version 3 or later](LICENSE)** (`GPL-3.0-or-later`), with an SPDX header in every source file; the repository passes `reuse lint` (REUSE 3.3). Software for digital government is a public asset: copyleft keeps every redistributed modification open for communes and citizens. Releases v0.0.1–v0.2.0 remain Apache-2.0. Open data in [`du-lieu-mo/`](du-lieu-mo/) is CC-BY-4.0. Third-party components keep their own licences and run from upstream images; Garage (AGPL-3.0) and ClamAV (GPL-2.0) run as separate services. See [`NOTICE`](NOTICE) and [`DEPENDENCIES.md`](DEPENDENCIES.md).
