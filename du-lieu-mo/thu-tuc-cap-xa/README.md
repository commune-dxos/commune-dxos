# Dữ liệu mở: thủ tục hành chính cấp xã – thành phần hồ sơ và quy trình

Bộ dữ liệu mô tả các thủ tục hành chính cấp xã mà Commune DX-OS hỗ trợ: mã, tên, lĩnh vực, thời hạn giải quyết, lệ phí, căn cứ pháp lý, **thành phần hồ sơ dưới dạng JSON Schema 2020-12** và các bước xử lý. Xã khác, nhà phát triển, nhà nghiên cứu có thể dùng lại để dựng form nộp hồ sơ, kiểm hồ sơ đủ giấy tờ trước khi nộp (Poka-yoke) hay so sánh quy trình.

**Giấy phép: [CC-BY-4.0](LICENSE)** (Creative Commons Ghi công 4.0 Quốc tế). Được dùng, chép, sửa, phân phối, kể cả mục đích thương mại, với điều kiện ghi công:

> Nguồn: Commune DX-OS – đội DTU_DZ_2 (OLP PMNM 2026), https://github.com/commune-dxos/commune-dxos, giấy phép CC-BY-4.0.

Mã nguồn của Commune DX-OS (kể cả script sinh bộ dữ liệu này) theo GPL-3.0-or-later; riêng thư mục `du-lieu-mo/` theo CC-BY-4.0 (khai trong [`REUSE.toml`](../../REUSE.toml)). Văn bản pháp luật được dẫn không thuộc đối tượng bảo hộ quyền tác giả.

## Tệp

| Tệp | Nội dung |
|---|---|
| [`danh-muc.json`](danh-muc.json) | danh mục đầy đủ, mỗi thủ tục một mục; khớp [`danh-muc.schema.json`](danh-muc.schema.json) |
| [`danh-muc.csv`](danh-muc.csv) | bảng phẳng mở được bằng bảng tính (UTF-8, phân cách dấu phẩy; nhiều giá trị trong một ô nối bằng ` \| `; số trong ngoặc sau tên thành phần = số tệp tối thiểu) |
| [`danh-muc.schema.json`](danh-muc.schema.json) | JSON Schema 2020-12 của `danh-muc.json` |
| `schema/<MA>.schema.json` | JSON Schema thành phần hồ sơ của từng thủ tục, đúng tệp hệ thống dùng để kiểm hồ sơ; `schema_sha256` trong danh mục để đối chiếu |
| [`LICENSE`](LICENSE) | toàn văn CC-BY-4.0 |

Trường của một thủ tục trong `danh-muc.json`:

| Trường | Ý nghĩa |
|---|---|
| `ma`, `ten` | mã thủ tục trong hệ thống, tên |
| `linh_vuc` | `{ma, ten}` lĩnh vực (ví dụ `ho_tich` – Hộ tịch) |
| `thoi_han_ngay_lam_viec` | số ngày làm việc (bỏ thứ Bảy, Chủ nhật, ngày lễ); `0` = trong ngày tiếp nhận |
| `le_phi`, `ghi_chu_le_phi` | đồng; cách tính chi tiết |
| `can_cu_phap_ly` | danh sách văn bản pháp luật |
| `thanh_phan` | `{ma, ten, bat_buoc, so_tep_toi_thieu, ghi_chu}` từng thành phần hồ sơ |
| `cac_buoc` | `{ma, ten, nguoi_xu_ly}` các bước theo thứ tự trong quy trình; `nguoi_xu_ly`: `can_bo_linh_vuc`, `lanh_dao`, `nguoi_nop` (bước bổ sung hồ sơ) |
| `schema`, `schema_sha256` | đường dẫn và SHA-256 của JSON Schema thành phần hồ sơ |
| `goi` | thư mục gói thủ tục trong kho mã (BPMN, dữ liệu mẫu, README) |

Ví dụ kiểm một hồ sơ (mỗi thành phần là danh sách id tệp đã tải lên) bằng Python:

```python
import json, jsonschema  # pip install jsonschema
schema = json.load(open("schema/KS01.schema.json", encoding="utf-8"))
ho_so = {"thanh_phan": {"to_khai": ["6f1c…"], "giay_chung_sinh": ["8a2d…"]}}
loi = [e.message for e in jsonschema.Draft202012Validator(schema).iter_errors(ho_so)]
print(loi)  # thiếu giay_to_tuy_than → báo lỗi trước khi nộp
```

## Cập nhật

Bộ dữ liệu **sinh tự động** từ các gói [`thu-tuc/<goi>/`](../../thu-tuc/) bằng [`scripts/xuat_du_lieu_mo.py`](../../scripts/xuat_du_lieu_mo.py), dùng đúng bộ kiểm của bộ nạp gói; không sửa tay các tệp trên (trừ README này). Thêm hoặc sửa gói rồi chạy `make du-lieu-mo`; `make check` (và CI) báo lỗi nếu bộ dữ liệu lệch với gói. Chỉ thủ tục `cong_khai: true` được công bố. Mỗi bản phát hành (tag `vX.Y.Z`) là một phiên bản của bộ dữ liệu.

**Lưu ý:** giá trị lấy theo quy định công khai, rút gọn để minh họa; đối chiếu văn bản pháp luật gốc và Cổng Dịch vụ công quốc gia trước khi dùng cho nghiệp vụ thật.

---

## English summary

Open dataset of commune-level administrative procedures in Viet Nam supported by Commune DX-OS: code, name, field, processing time (working days), fee, legal basis, **required documents as JSON Schema 2020-12**, and workflow steps. Files: `danh-muc.json` (catalogue, validated by `danh-muc.schema.json`), `danh-muc.csv` (flat table), `schema/<CODE>.schema.json` (per-procedure document schema, byte-identical to what the system uses for pre-submission checks). Licensed **CC-BY-4.0**; attribute "Commune DX-OS – team DTU_DZ_2, https://github.com/commune-dxos/commune-dxos". Generated from `thu-tuc/*/` by `scripts/xuat_du_lieu_mo.py` (`make du-lieu-mo`); values are simplified for demonstration – check the original legal texts before production use.
