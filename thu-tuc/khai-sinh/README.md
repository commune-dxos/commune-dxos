# Gói thủ tục `khai-sinh` – Đăng ký khai sinh (KS01)

Gói cắm vào bộ máy một cửa (`mot-cua/`) theo mô hình D-009. Cách viết gói: [`docs/thu-tuc.md`](../../docs/thu-tuc.md).

| Tệp | Nội dung |
|---|---|
| `thu-tuc.yaml` | mã `KS01`, lĩnh vực `ho_tich`, hạn 1 ngày làm việc, miễn lệ phí khi đúng hạn, căn cứ pháp lý, process id `dang_ky_khai_sinh` |
| `quy-trinh.bpmn20.xml` | BPMN 2.0 viết tay (#8); biến từng bước khai bằng `flowable:formProperty` |
| `thanh-phan-ho-so.schema.json` | JSON Schema 2020-12: tờ khai, giấy chứng sinh, giấy tờ tùy thân (bắt buộc), giấy kết hôn của cha mẹ (nếu có) |
| `du-lieu-mau.json` | hồ sơ mẫu **giả** khớp schema |

BPMN 2.0 viết tay (không có modeler, bpmn-js bị cấm – D-004). Sửa xong chạy `make check` (kiểm gói và cấu trúc BPMN) rồi `make nap-thu-tuc` (deploy phiên bản mới lên Flowable, không cần khởi động lại). Cách viết: [`docs/architecture.md` §7](../../docs/architecture.md#7-viết-bpmn-khi-không-có-modeler).

## `dang_ky_khai_sinh` – Đăng ký khai sinh (KS01)

```mermaid
flowchart LR
  S((Hồ sơ đã nộp)) --> TN["Tiếp nhận, kiểm tra thành phần<br/><i>nhóm ho_tich</i>"]
  TN --> G1{Đủ thành phần?<br/>hopLe}
  G1 -- đủ --> TD["Thẩm định<br/><i>nhóm ho_tich</i>"]
  G1 -- thiếu --> BS["Công dân bổ sung<br/><i>assignee = nguoiNopSub</i>"]
  BS --> TN
  TD --> G2{Đạt yêu cầu?<br/>datYeuCau}
  G2 -- đạt --> PD["Phê duyệt, ký<br/><i>nhóm lanh_dao</i>"]
  G2 -- không đạt --> TC((Từ chối<br/>ketQua=tu_choi))
  PD --> G3{Phê duyệt?<br/>pheDuyet}
  G3 -- duyệt --> HT((Hoàn tất<br/>ketQua=hoan_tat))
  G3 -- trả lại --> TD
  subgraph QH [Sự kiện con, không ngắt quy trình]
    T((⏰ hanXuLyLuc)) --> M[quaHan = true] --> E(( ))
  end
```

| Biến | Ai đặt | Ý nghĩa |
|---|---|---|
| `hoSoId`, `maHoSo` (= businessKey) | bên khởi tạo | liên kết `mot_cua.ho_so` |
| `nguoiNopSub` | bên khởi tạo | `sub` công dân, người làm bước bổ sung |
| `hanXuLyLuc` | bên khởi tạo | `ho_so.han_xu_ly` dạng ISO 8601 (ví dụ `2026-10-21T17:00:00+07:00`), **bắt buộc** |
| `hopLe`, `datYeuCau`, `pheDuyet`, `ghiChu` | cán bộ, khi hoàn thành task (khai bằng `flowable:formProperty`, `required="true"` = bắt buộc) | rẽ nhánh tại các gateway |
| `ketQua` | quy trình | `hoan_tat` / `tu_choi` khi kết thúc |
| `quaHan` | quy trình | `true` khi tới hạn mà chưa xong |

`candidateGroups` trùng mã lĩnh vực (`mot_cua.linh_vuc.ma`) và vai trò `lanh_dao`, để cổng cán bộ lấy task theo đúng lĩnh vực mà RLS cho cán bộ xem hồ sơ. Chưa làm: đồng bộ `ho_so.trang_thai` theo bước, khởi tạo quy trình sau Poka-yoke (tuần 3).
