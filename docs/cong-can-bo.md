<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Cổng cán bộ: luồng xử lý hồ sơ

Cổng cán bộ (#55) là ứng dụng Tầng 2 cho **cán bộ một cửa, cán bộ chuyên môn, văn thư và lãnh đạo xã**: đăng nhập một lần bằng mật khẩu + OTP, xem hồ sơ thuộc lĩnh vực mình phụ trách, xử lý từng bước của quy trình. Cổng chạy ở **http://localhost:9080/can-bo** sau `make up`, cùng ứng dụng web với cổng công dân ([`mot-cua/web-cong-dan/`](../mot-cua/web-cong-dan/), mã ở `src/can-bo/`) và chỉ gọi lõi qua APISIX.

<p>
  <img src="images/cong-can-bo-hop-viec.webp" alt="Hộp việc của cán bộ hộ tịch trên máy tính: thanh bên có Hộp việc, Quá hạn, Sắp trễ hạn, Tôi đang xử lý; ô số liệu; bảng hồ sơ với hạn xử lý đổi màu" width="100%">
</p>

## Đăng nhập và quyền

| Bước | Ai kiểm | Cách |
|---|---|---|
| Đăng nhập | Keycloak realm `dxos` | client public **`mot_cua_can_bo`** (riêng với `mot_cua_web` của cổng công dân), Authorization Code + PKCE S256, chỉ nhận `redirect_uri` dưới `/can-bo/`. Web không có bí mật nào |
| OTP | Keycloak | tài khoản vai `can_bo`, `lanh_dao`, `van_thu` có required action `CONFIGURE_TOTP`: lần đầu quét mã QR bằng ứng dụng OTP, các lần sau nhập mật khẩu rồi mã 6 số |
| Vào cổng | web | đọc client role `dxos_api` trong access token; không có `can_bo`, `lanh_dao` hay `van_thu` (ví dụ công dân) thì hiện **"Bạn không có quyền vào cổng cán bộ"**, không gọi API nào |
| Thấy hồ sơ nào | PostgreSQL RLS | cán bộ chỉ thấy hồ sơ của lĩnh vực mình phụ trách (`mot_cua.can_bo_linh_vuc`), lãnh đạo thấy tất cả |
| Thấy task nào, xử lý bước nào | `mot-cua-api` | task Flowable giao cho mình hoặc thuộc nhóm ứng viên của mình (`candidateGroups` = mã lĩnh vực, hoặc `lanh_dao`); sai nhóm → 403, sai biến → 400, người khác vừa nhận → 409, web hiện nguyên câu báo |

Web chỉ dùng vai trò để chọn màn hình; mọi quyền thật do APISIX (JWT), `mot-cua-api` (kiểm lại chữ ký, nhóm) và RLS kiểm ở từng request.

## Luồng một hồ sơ khai sinh (KS01)

```mermaid
sequenceDiagram
    autonumber
    actor CD as Công dân
    actor CB as Cán bộ hộ tịch
    actor LD as Lãnh đạo xã
    participant W as Web /can-bo
    participant G as APISIX
    participant API as mot-cua-api
    participant F as Flowable
    CD->>G: nộp KS01 ở cổng công dân (/api, /files, /workflow/ho-so/{id}/khoi-tao)
    CB->>W: đăng nhập (mật khẩu + OTP, client mot_cua_can_bo)
    W->>G: GET /workflow/tasks, GET /api/ho_so?id=in.(…)
    G->>API: task của nhóm ho_tich
    API->>F: query task theo candidateGroups
    W-->>CB: hộp việc, hồ sơ quá hạn / sắp trễ lên đầu
    CB->>W: mở hồ sơ: người nộp, tệp (link ký sẵn /files/tep/{id}), lịch sử bước
    CB->>W: Tiếp nhận: "Đủ thành phần hồ sơ?" Có
    W->>G: POST /workflow/tasks/{id}/complete {"bien": {"hopLe": true}}
    CB->>W: Thẩm định: "Đạt yêu cầu?" Có (chuyển lãnh đạo)
    LD->>W: đăng nhập (mật khẩu + OTP), mở hồ sơ ở bước Phê duyệt
    LD->>W: "Phê duyệt?" Có
    W->>G: POST /workflow/tasks/{id}/complete {"bien": {"pheDuyet": true}}
    F-->>API: kết thúc ket_thuc_hoan_tat (trả kết quả), sự kiện ho_so.hoan_tat
```

| Bước BPMN (KS01) | Ai | Form trên cổng | Kết quả |
|---|---|---|---|
| `tiep_nhan` – Tiếp nhận, kiểm tra thành phần | cán bộ hộ tịch | **Đủ thành phần hồ sơ?** Có / Không; Ghi chú | Có → thẩm định; Không → **yêu cầu bổ sung** (task về công dân) |
| `tham_dinh` – Thẩm định | cán bộ hộ tịch | **Đạt yêu cầu?** Có / Không; Ghi chú | Có → **chuyển lãnh đạo**; Không → **từ chối** |
| `phe_duyet` – Phê duyệt, ký | lãnh đạo | **Phê duyệt?** Có / Không; Ghi chú | Có → **hoàn tất, trả kết quả**; Không → trả lại thẩm định |

Chứng thực bản sao (CT01) có thêm ô số: "Số trang của một bản" (không bắt buộc) và "Số bản đã chứng thực" (bắt buộc, bước trả kết quả).

## Form sinh từ gói thủ tục

Cổng không biết thủ tục nào. Form của mỗi bước sinh từ `flowable:formProperty` trong `thu-tuc/<goi>/quy-trinh.bpmn20.xml`; bộ nạp gói ghi vào cột `thu_tuc.bien_theo_buoc` dạng `{bước: {biến: {kieu, bat_buoc, ten}}}` (nhãn `ten` = thuộc tính `name`):

| `type` của formProperty | Ô trên form | Gửi lên API |
|---|---|---|
| `boolean` | hai lựa chọn Có / Không | `true` / `false` |
| `long` | ô số nguyên | số |
| `string` | ô nhiều dòng | chuỗi (để trống thì không gửi) |

Trường `required="true"` đứng đầu và phải điền: thiếu thì form báo lỗi tại chỗ, **không gửi request nào**; `mot-cua-api` kiểm lại đúng danh sách đó. Thêm thủ tục mới ([`thu-tuc.md`](thu-tuc.md)) là cổng cán bộ có form cho các bước của thủ tục đó, không sửa mã web.

<p>
  <img src="images/cong-can-bo-chi-tiet.webp" alt="Chi tiết hồ sơ khai sinh quá hạn 1 ngày: người nộp, thành phần hồ sơ với tệp đã quét mã độc, nút Xem tệp và Mở tệp, ô Xử lý bước bên phải đang chọn Không ở câu Đủ thành phần hồ sơ? kèm ghi chú yêu cầu bổ sung" width="68%">
  <img src="images/cong-can-bo-dien-thoai.webp" alt="Hộp việc trên điện thoại: danh sách thẻ hồ sơ, thẻ hạn đổi màu" width="28%">
</p>
<p>
  <img src="images/cong-can-bo-xu-ly.webp" alt="Ô Xử lý bước của bước Thẩm định: câu hỏi Đạt yêu cầu? đã chọn Có, ghi chú trình lãnh đạo ký, nút Hoàn thành bước" width="40%">
</p>

## Trạng thái hồ sơ

Chi tiết hồ sơ hiện huy hiệu **Trạng thái hồ sơ** đọc từ `ho_so.trang_thai` qua `/api` (tên hiển thị ở [`src/lib/trang-thai.ts`](../mot-cua/web-cong-dan/src/lib/trang-thai.ts), dùng chung với cổng công dân), cạnh bước hiện tại lấy từ Flowable. Cột này đi theo bước quy trình (#73): mới nộp → chờ công dân bổ sung → đang xử lý → chờ lãnh đạo phê duyệt → hoàn tất / từ chối, nên cán bộ và công dân luôn thấy cùng một giá trị. Bảng trạng thái: [`mot-cua/README.md`](../mot-cua/README.md#trạng-thái-hồ-sơ).

## Hạn xử lý và cảnh báo

- Hạn lấy từ biến `hanXuLyLuc` của quy trình (`mot-cua-api` đặt lúc khởi tạo = `ho_so.han_xu_ly` 17:00 giờ Việt Nam); biến `quaHan` (hẹn giờ trong BPMN) đặt `true` khi tới hạn.
- Thẻ hạn ghi **còn bao lâu** ("Còn 5 giờ", "Quá hạn 1 ngày") và hạn chính xác; **sắp trễ** = còn ≤ 1 ngày (viền đỏ son, nền nhạt), **quá hạn** = nền đỏ son. Mức phân biệt bằng biểu tượng và chữ, không chỉ bằng màu.
- Hộp việc xếp quá hạn, sắp trễ lên đầu; ô số liệu đếm từ dữ liệu đã có, tải lại mỗi phút.
- **Thông báo sắp trễ hạn (#56):** hồ sơ còn ≤ 1 ngày làm việc tới hạn → `mot-cua-worker` phát `ho_so.sap_tre_han` lên RabbitMQ → consumer thông báo ghi cho mỗi cán bộ phụ trách lĩnh vực một thông báo. Chuông ở đầu trang hiện số thông báo mới và cập nhật ngay qua luồng `GET /workflow/thong-bao/luong` (Server-Sent Events); mục **Thông báo** ở thanh bên (`/can-bo/thong-bao`) liệt kê thông báo, nhãn "Mới" cho thông báo chưa đọc, nút "Đánh dấu đã đọc". Email/SMS chỉ giả lập, trang ghi rõ "giả lập, không gửi thật". Thiết kế: `architecture.md` §4.13.
- Bộ lọc (trạng thái nhận, thủ tục, hạn) nằm trên URL: `/can-bo?han=qua_han`, `/can-bo?han=sap_tre`, `/can-bo?trang_thai=cua_toi`, `/can-bo?thu_tuc=KS01`.

## Sổ văn bản đến/đi (#78)

Trang **Sổ văn bản** (`/can-bo/van-ban`, nhóm "Văn bản" ở thanh bên) hiện cho mọi vai của cổng; văn thư đăng nhập là vào thẳng trang này và không thấy mục "Xử lý hồ sơ" (vai `van_thu` không đọc được hồ sơ nào).

| Vai | Làm được |
|---|---|
| `van_thu` | chọn sổ đến hoặc đi (`?chieu=den`, `?chieu=di`); **vào sổ văn bản đến**: chọn tệp quét (PDF, JPEG, PNG), nhập loại, số ký hiệu, ngày, nơi gửi, trích yếu → hệ thống quét mã độc, cấp số đến, PDF có chữ ký số thì hiện kết quả xác minh; **soạn dự thảo văn bản đi**: loại (danh mục cố định), trích yếu, nơi nhận, nội dung |
| `lanh_dao` | xem hai sổ; nút **Ký ban hành** trên dòng dự thảo → cấp số đi, sinh PDF, ký số; báo "Đã ký ban hành văn bản <ký hiệu>." |
| `can_bo` | xem hai sổ, tải tệp |
| mọi vai | **Tải** tệp (link ngắn hạn); thẻ **Xác minh PDF**: chọn một PDF bất kỳ → hợp lệ hay không, người ký, có phải văn bản xã đã phát hành |

Lỗi từ API (mã độc 422, không có quyền 403, đã ký 409) hiện nguyên câu báo trên trang. Thiết kế: [`architecture.md`](architecture.md) §4.11.

## Wiki văn bản nội bộ (#95)

Trang **Wiki văn bản** (`/can-bo/wiki`, nhóm "Văn bản" ở thanh bên) hiện cho mọi vai của cổng. Ô tìm (không dấu cũng được), chọn loại văn bản, "Gồm cả văn bản hết hiệu lực"; tham số nằm trên URL (`/can-bo/wiki?q=tiep+cong+dan&loai=quy_trinh`) để gửi link cho đồng nghiệp. Đoạn khớp được tô đậm. Mỗi văn bản có trang chi tiết (`/can-bo/wiki/<id>`) với nội dung và các phiên bản trước.

| Vai | Thấy | Làm được |
|---|---|---|
| `can_bo` | văn bản toàn xã và văn bản của lĩnh vực mình đang phụ trách | tìm, xem, xem phiên bản cũ |
| `van_thu` | mọi văn bản trừ phạm vi "chỉ lãnh đạo" | thêm (`/can-bo/wiki/moi`), sửa, ngừng hiệu lực / cho hiệu lực lại |
| `lanh_dao` | tất cả | như văn thư, thêm được văn bản "chỉ lãnh đạo" |

Khi bộ tìm kiếm (Meilisearch) tạm dừng, trang báo "Bộ tìm kiếm đang tạm dừng" và vẫn tìm trực tiếp trong CSDL theo đúng quyền. Thiết kế: [`architecture.md`](architecture.md) §4.16.

## Hạ tầng

| Thành phần | Cấu hình |
|---|---|
| APISIX | route `mot-cua-web-can-bo` (`/can-bo`, `/can-bo/*`, chỉ GET/HEAD, 300 request/phút/IP, `X-Robots-Tag: noindex, nofollow`) tới dịch vụ `mot-cua-web` – [`nen-tang/apisix/apisix.yaml`](../nen-tang/apisix/apisix.yaml) |
| nginx của `mot-cua-web` | SPA fallback cho `/can-bo/…`, CSP không `unsafe-inline`, `frame-ancestors 'none'`; `/cau-hinh.js` có `clientIdCanBo` từ biến `DXOS_OIDC_CLIENT_ID_CAN_BO` – [`nginx/default.conf.template`](../mot-cua/web-cong-dan/nginx/default.conf.template) |
| Keycloak | client `mot_cua_can_bo` trong [`mot-cua/keycloak/realm.json`](../mot-cua/keycloak/realm.json), `tang2-realm` tự thêm vào realm có sẵn ở lần `make up` tới |
| Gói JS | cổng cán bộ nạp lười (`cong-can-bo-*.js`), người dân không tải mã của cán bộ |

Không mở cổng nào ra host: web, API, Flowable, Garage chỉ đi qua APISIX ở cổng 9080.

## Chạy thử

```bash
make up && make smoke     # smoke mục 4i: trang /can-bo, client mot_cua_can_bo, E2E cán bộ → lãnh đạo; 4n: sổ văn bản; 4r: wiki văn bản
make demo-users           # đặt mật khẩu chung cho tài khoản mẫu và in ra
```

Mở **http://localhost:9080/can-bo**, đăng nhập:

| Tài khoản (dữ liệu giả) | Vai | Thấy gì |
|---|---|---|
| `canbo01` | cán bộ hộ tịch | task KS01 (tiếp nhận, thẩm định) |
| `canbo02` | cán bộ chứng thực | task CT01; **không** thấy hồ sơ KS01 |
| `canbo03` | cán bộ đất đai | chưa có thủ tục nào có gói: hộp việc trống |
| `lanhdao01` | lãnh đạo | bước phê duyệt, ký của mọi thủ tục; ký ban hành văn bản đi |
| `vanthu01` | văn thư | sổ văn bản đến/đi; không thấy hồ sơ |
| `congdan01` | công dân | trang "không có quyền" |

Lần đầu Keycloak đòi cài OTP: quét mã QR bằng FreeOTP, Google Authenticator… Smoke dùng người dùng tạm có OTP và xóa khi xong, không đụng tài khoản mẫu. Chạy dev (`npm run dev` trong `mot-cua/web-cong-dan/`) thì mở http://localhost:5173/can-bo.
