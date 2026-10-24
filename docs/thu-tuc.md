# Thêm một thủ tục mới trong 5 bước

Commune DX-OS cắm–rút theo **gói thủ tục hành chính** (D-009). Mỗi thủ tục là một thư mục `thu-tuc/<ma>/`; bộ máy một cửa [`mot-cua/`](../mot-cua/) chạy mọi thủ tục, nền tảng [`nen-tang/`](../nen-tang/) không biết thủ tục nào. Thêm thủ tục **không sửa dòng mã nào** trong `mot-cua/`, `nen-tang/`, `docker-compose.yml` hay APISIX: chỉ thêm một thư mục rồi chạy `make nap-thu-tuc`. Rút thủ tục: xóa thư mục rồi chạy lại lệnh đó.

Hai gói có sẵn để chép:

| Gói | Mã | Lĩnh vực | Thời hạn | Quy trình |
|---|---|---|---|---|
| [`thu-tuc/khai-sinh/`](../thu-tuc/khai-sinh/) | KS01 | `ho_tich` | 1 ngày làm việc | tiếp nhận → (bổ sung) → thẩm định → phê duyệt |
| [`thu-tuc/chung-thuc-ban-sao/`](../thu-tuc/chung-thuc-ban-sao/) | CT01 | `chung_thuc` | trong ngày | tiếp nhận → kiểm tra bản chính → ký chứng thực → trả kết quả |

Ví dụ dưới đây thêm thủ tục **xác nhận cư trú** (giá trị mẫu, không phải tư vấn pháp lý).

## Bước 1. Chép một gói có sẵn

```bash
cp -R thu-tuc/chung-thuc-ban-sao thu-tuc/xac-nhan-cu-tru
```

Tên thư mục là chữ thường không dấu, số và `-` (2–60 ký tự). Gói phải có đủ 5 tệp:

| Tệp | Nội dung |
|---|---|
| `thu-tuc.yaml` | mô tả thủ tục |
| `quy-trinh.bpmn20.xml` | quy trình BPMN 2.0 viết tay |
| `thanh-phan-ho-so.schema.json` | thành phần hồ sơ (JSON Schema 2020-12) |
| `du-lieu-mau.json` | hồ sơ mẫu **giả** |
| `README.md` | mô tả ngắn, sơ đồ quy trình cho người đọc |

## Bước 2. Sửa `thu-tuc.yaml`

```yaml
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
ma: XNCT01
ten: Xác nhận thông tin cư trú
linh_vuc: cu_tru
ten_linh_vuc: Cư trú
thoi_han_ngay_lam_viec: 2
le_phi: 0
ghi_chu_le_phi: Không thu phí (giá trị mẫu)
cong_khai: true
quy_trinh: xac_nhan_cu_tru
can_cu_phap_ly:
  - Luật Cư trú 2020
# Không bắt buộc: trạng thái hồ sơ ở từng bước (mục "Trạng thái hồ sơ theo bước" bên dưới).
trang_thai_theo_buoc:
  - tiep_nhan: moi
```

| Khóa | Bắt buộc | Kiểu | Ý nghĩa |
|---|---|---|---|
| `ma` | có | chữ HOA, số, `_`, `-` | mã thủ tục, khóa của danh mục (`mot_cua.thu_tuc.ma`). Trùng mã với thủ tục có sẵn trong dữ liệu mẫu thì gói ghi đè thủ tục đó |
| `ten` | có | chuỗi | tên hiển thị trên cổng công dân |
| `linh_vuc`, `ten_linh_vuc` | có | mã chữ thường; chuỗi | lĩnh vực; chưa có thì bộ nạp tạo. Cán bộ phụ trách lĩnh vực này mới thấy hồ sơ (RLS) và nhận task |
| `thoi_han_ngay_lam_viec` | có | số 0–365 | ngày làm việc (bỏ thứ Bảy, Chủ nhật, ngày nghỉ lễ); `0` = trong ngày tiếp nhận |
| `le_phi` | có | số ≥ 0 | đồng; cách tính chi tiết ghi ở `ghi_chu_le_phi` |
| `can_cu_phap_ly` | có | danh sách chuỗi | văn bản pháp luật |
| `quy_trinh` | có | process id | phải trùng `id` của `<process>` trong BPMN |
| `ghi_chu_le_phi`, `mo_ta` | không | chuỗi | |
| `cong_khai` | không | `true`/`false` | mặc định `true`; `false` thì người ngoài và công dân không thấy |
| `trang_thai_theo_buoc` | không | danh sách `- <bước>: <trạng thái>` | đổi trạng thái mặc định của hồ sơ khi đang ở bước đó ([Trạng thái hồ sơ theo bước](#trạng-thái-hồ-sơ-theo-bước)) |

Tệp dùng **tập con của YAML** (bộ nạp chỉ dùng thư viện chuẩn Python): mỗi dòng `khóa: giá trị`, hoặc `khóa:` rồi các dòng `  - mục`. Không dùng mapping lồng nhau, chuỗi nhiều dòng hay anchor; khóa lạ (gõ sai tên) bị báo lỗi.

## Bước 3. Vẽ lại quy trình trong `quy-trinh.bpmn20.xml`

Đổi `<process id="…">` thành giá trị `quy_trinh` ở bước 2, rồi sửa các bước. Quy ước với bộ máy một cửa:

- **Người xử lý**: `flowable:candidateGroups` là mã lĩnh vực của thủ tục (`cu_tru`) hoặc `lanh_dao`; bước của công dân dùng `flowable:assignee="${nguoiNopSub}"`. Giá trị khác bị bộ nạp từ chối.
- **Biến người xử lý đặt khi hoàn thành bước**: khai trong từng `userTask`. API `/workflow/tasks/{id}/complete` chỉ nhận đúng các biến này, đúng kiểu, đủ biến `required="true"`:

  ```xml
  <userTask id="xac_minh" name="Xác minh thông tin cư trú" flowable:candidateGroups="cu_tru">
    <extensionElements>
      <flowable:formProperty id="dungThongTin" name="Thông tin đúng?" type="boolean" required="true"/>
      <flowable:formProperty id="ghiChu" name="Ghi chú" type="string"/>
    </extensionElements>
  </userTask>
  ```

  Kiểu nhận: `boolean`, `string`, `long`.
- **Biến bộ máy đặt sẵn khi khởi tạo**: `hoSoId`, `maHoSo` (businessKey), `nguoiNopSub`, `hanXuLyLuc` (17:00 ngày hạn, dùng cho hẹn giờ quá hạn).
- **Kết thúc**: đặt `ketQua` = `hoan_tat` hoặc `tu_choi` ở `endEvent` (xem gói mẫu) để bộ máy phát sự kiện `ho_so.hoan_tat` / `ho_so.tu_choi`.

- **Trạng thái hồ sơ** đi theo bước, không phải khai gì nếu dùng mặc định: xem mục [Trạng thái hồ sơ theo bước](#trạng-thái-hồ-sơ-theo-bước).

Cách viết BPMN không có modeler: [`docs/architecture.md` §7](architecture.md#7-viết-bpmn-khi-không-có-modeler). Sửa luôn sơ đồ Mermaid trong `README.md` của gói.

## Bước 4. Khai thành phần hồ sơ và dữ liệu mẫu

`thanh-phan-ho-so.schema.json`: mỗi thành phần là một khóa trong `properties.thanh_phan.properties` (mã chữ thường), giá trị là mảng id tệp đã tải qua `/files`. Thành phần bắt buộc liệt kê trong `required` và có `minItems` ≥ 1:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Xác nhận thông tin cư trú",
  "type": "object",
  "required": ["thanh_phan"],
  "properties": {
    "thanh_phan": {
      "type": "object",
      "additionalProperties": false,
      "required": ["to_khai"],
      "properties": {
        "to_khai": {"title": "Tờ khai (theo mẫu)", "type": "array", "items": {"type": "string", "format": "uuid"}, "minItems": 1},
        "giay_to_kem_theo": {"title": "Giấy tờ chứng minh chỗ ở", "type": "array", "items": {"type": "string", "format": "uuid"}, "minItems": 0}
      }
    }
  }
}
```

Bộ nạp ghi các thành phần này vào `mot_cua.thanh_phan_yeu_cau`, và `GET /public/rpc/json_schema_thu_tuc?ma=XNCT01` trả đúng tệp này cho Poka-yoke ở cổng công dân.

`du-lieu-mau.json`: hồ sơ mẫu **giả**, phải khớp schema; `xu_ly` (không bắt buộc) là biến mẫu khi hoàn thành từng bước, phải khớp `formProperty` của BPMN. Bộ nạp từ chối dãy 9 hoặc 12 chữ số liền (dạng số CMND/CCCD). Tuyệt đối không dùng giấy tờ hay số định danh thật.

```json
{
  "ho_so": {"ho_ten_nguoi_nop": "Trần Văn Mẫu", "so_dien_thoai": "0900000003"},
  "thanh_phan": {"to_khai": ["11110000-0000-4000-8000-000000000001"]},
  "xu_ly": {"xac_minh": {"dungThongTin": true}}
}
```

## Bước 5. Kiểm, nạp, thử

```bash
make license              # thêm dòng SPDX cho tệp mới (YAML, XML)
make check                # kiểm mọi gói thu-tuc/ (không cần Docker) + BPMN + SPDX + test
make nap-thu-tuc          # hệ thống đang chạy: deploy BPMN lên Flowable + ghi danh mục
curl -s 'http://localhost:9080/public/thu_tuc?ma=eq.XNCT01&select=ma,ten,goi,quy_trinh,so_ngay_xu_ly'
```

Gói lỗi thì bộ nạp in từng lỗi rồi bỏ qua gói đó (các gói khác vẫn nạp, hệ thống không dừng), ví dụ:

```text
nap-thu-tuc: gói xac-nhan-cu-tru LỖI, bỏ qua:
  - quy-trinh.bpmn20.xml: process id 'chung_thuc_ban_sao' khác quy_trinh 'xac_nhan_cu_tru' trong thu-tuc.yaml
```

Nộp thử một hồ sơ (token công dân lấy như `docs/architecture.md` §8) theo luồng tạo hồ sơ `POST /api/ho_so` → tải tệp cho từng thành phần bắt buộc `POST /files/ho-so/{id}/tep` → `POST /workflow/ho-so/{id}/khoi-tao` (ví dụ lệnh: `mot-cua/README.md` mục `/workflow`). Cổng công dân tự sinh form từ `thanh-phan-ho-so.schema.json` của gói mới, không sửa mã web; cả cổng và `mot-cua-api` kiểm đủ thành phần theo đúng schema này (Poka-yoke 2 lớp, #53/#59). Muốn smoke kiểm luôn thủ tục mới, xem mẫu ở `mot-cua/tests/smoke-goi-thu-tuc.sh` (mục 4 chạy hết quy trình chứng thực bằng `du-lieu-mau.json`).

Mở PR theo [`CONTRIBUTING.md`](../CONTRIBUTING.md): job CI `make-check` chạy bộ kiểm gói, job `bpmn` kiểm cấu trúc mọi `thu-tuc/*/quy-trinh.bpmn20.xml`.

## Trạng thái hồ sơ theo bước

Cột `mot_cua.ho_so.trang_thai` đi theo bước Flowable (#73): cổng công dân, cổng cán bộ, báo cáo và RLS đọc cùng một giá trị trong CSDL. Bộ nạp tính trạng thái cho **mọi** `userTask` của gói và ghi vào `mot_cua.thu_tuc.trang_thai_buoc`; gói mới không phải sửa mã.

Mặc định theo người nhận của bước trong BPMN:

| Bước giao cho | Trạng thái khi hồ sơ đang ở bước đó |
|---|---|
| công dân (`flowable:assignee="${nguoiNopSub}"`) | `cho_bo_sung` – công dân sửa hồ sơ, tải thêm tệp được |
| `flowable:candidateGroups` có `lanh_dao` | `cho_phe_duyet` – cán bộ không tự chuyển trạng thái được |
| nhóm lĩnh vực của thủ tục | `dang_xu_ly` |

Quy trình kết thúc ở `endEvent` đặt `ketQua` → `hoan_tat` hoặc `tu_choi` (ngày hoàn tất do CSDL ghi). Đổi mặc định của bước nào thì khai trong `thu-tuc.yaml`, ví dụ để hồ sơ còn "mới nộp" tới khi cán bộ tiếp nhận (hai gói mẫu đều khai):

```yaml
trang_thai_theo_buoc:
  - tiep_nhan: moi
```

Nhận `moi`, `dang_xu_ly`, `cho_bo_sung`, `cho_phe_duyet`. Bước không có trong BPMN, trạng thái lạ, khai hai lần hay khai `hoan_tat`/`tu_choi` cho một bước → bộ nạp báo lỗi và bỏ qua gói. Quy tắc lúc chạy (`mot-cua/backend/trang_thai.py`):

- `moi` chỉ có trước lần tiếp nhận đầu: quay lại bước khai `moi` (ví dụ công dân vừa nộp lại sau bổ sung) thì hồ sơ là `dang_xu_ly`.
- Nhiều bước mở cùng lúc: `cho_bo_sung` > `dang_xu_ly` > `cho_phe_duyet` > `moi`.
- Không còn bước mở mà quy trình chưa kết thúc (đang ở hẹn giờ, service task) thì giữ nguyên trạng thái. Hẹn giờ quá hạn chỉ đặt `quaHan`, không đổi trạng thái.
- Chuyển sang `cho_bo_sung`/`tu_choi` thì `ly_do` = biến `ghiChu` người xử lý nhập ở bước đó (không có thì câu mặc định).

Mỗi lần đổi có một dòng trong `mot_cua.lich_su_trang_thai` (ai, bước nào, nguồn) và sự kiện `ho_so.*` mang `duLieu.trangThai`. Cách cập nhật và xử lý lỗi: [`mot-cua/README.md`](../mot-cua/README.md#trạng-thái-hồ-sơ).

## Bộ nạp làm gì

`make up` chạy dịch vụ một lần `nap-thu-tuc`; `make nap-thu-tuc` chạy lại bằng tay. Với mỗi thư mục trong `thu-tuc/`:

1. **Kiểm gói** (`mot-cua/backend/goi_thu_tuc.py`): đủ tệp, YAML, JSON Schema, BPMN (cùng luật với CI), dữ liệu mẫu.
2. **Deploy BPMN** lên Flowable qua REST; BPMN không đổi thì không deploy lại.
3. **Ghi danh mục** qua PostgREST (RPC `mot_cua.nap_thu_tuc`) bằng tài khoản dịch vụ `mot_cua_danh_muc`, chỉ có quyền gọi RPC nạp/rút gói. Kèm biến từng bước (`bien_theo_buoc`) và trạng thái hồ sơ từng bước (`trang_thai_buoc`).
4. **Rút** thủ tục có gói mà thư mục đã bị xóa: thôi nhận hồ sơ mới, hồ sơ đang chạy vẫn chạy tới khi xong.

Chi tiết thiết kế: [`docs/architecture.md` §2.4](architecture.md#24-hợp-đồng-giữa-các-lớp).

## Giới hạn hiện tại

- Một gói một quy trình; nhóm xử lý chỉ là lĩnh vực của thủ tục và lãnh đạo.
- Biến từng bước chỉ có kiểu `boolean`, `string`, `long`.
- Thủ tục cần bảng dữ liệu riêng ngoài hồ sơ chung phải thêm migration trong `mot-cua/db/migrations/` (sửa bộ máy, không còn là cắm–rút thuần).
- Thành phần bỏ khỏi gói không bị xóa khỏi danh mục (hồ sơ cũ còn tham chiếu), chỉ thôi bắt buộc.
