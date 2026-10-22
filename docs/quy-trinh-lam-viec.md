<!-- SPDX-License-Identifier: Apache-2.0 -->
# Quy trình làm việc và theo dõi tiến độ

Đội DTU_DZ_2 theo dõi tiến độ ngay trên GitHub, để ai cũng xem được tuần này đội làm gì, việc nào xong, việc nào đang chờ duyệt (D-009 hướng 3, #34).

| Xem ở đâu | Link |
|---|---|
| Milestones theo tuần | <https://github.com/commune-dxos/commune-dxos/milestones?state=all> |
| Bảng Project "Commune DX-OS – Lộ trình" | <https://github.com/orgs/commune-dxos/projects> |
| Kế hoạch 7 tuần (nguồn của milestone) | [Kế hoạch](PLAN.md) |
| Issue đang mở | <https://github.com/commune-dxos/commune-dxos/issues> |

## 1. Milestone theo tuần

Mỗi tuần trong [kế hoạch](PLAN.md) là một milestone `Tuần 1` … `Tuần 7`. Hạn của milestone là ngày cuối tuần trong kế hoạch; `Tuần 7` hết hạn ngày 06/12/2026, trước 17:00 là giờ nộp bài.

| Milestone | Thời gian | Mục tiêu |
|---|---|---|
| Tuần 1 | 15–21/10 | Nền móng → v0.0.1 |
| Tuần 2 | 22–28/10 | Lõi headless → v0.1.0, gói thủ tục, trang tài liệu |
| Tuần 3 | 29/10–04/11 | Luồng nghiệp vụ chính: Poka-yoke, cổng công dân, cổng cán bộ |
| Tuần 4 | 05–11/11 | Tầng [D] + bảo mật + VPS → v0.2.0 |
| Tuần 5 | 12–18/11 | Tầng [I] + demo công khai |
| Tuần 6 | 19–25/11 | Tuần UX + cộng đồng → v0.3.0 |
| Tuần 7 | 26/11–06/12 | Đóng băng PoF, nộp bài → v1.0.0 |

- Mỗi dòng `[ ]` trong kế hoạch là một issue, gắn vào milestone của tuần đó. PR đóng issue gắn cùng milestone.
- Việc làm sớm hơn kế hoạch vẫn để ở milestone của tuần ghi trong kế hoạch. Việc phát sinh giữa chừng vào milestone đang mở gần nhất.
- Milestone đóng khi mọi việc của tuần đã merge. Tỷ lệ phần trăm trên trang Milestones là tiến độ của tuần.
- Nhãn `tuan-2` … `tuan-7` là cách cũ, giữ lại cho các issue đã gắn; việc mới dùng milestone.

## 2. Nhãn

Mỗi issue và PR có ba loại nhãn:

| Loại | Nhãn | Ai gắn |
|---|---|---|
| Thành phần | `nen-tang`, `mot-cua`, `thu-tuc`, `docs`, `ci` | PR: workflow `gan-nhan` tự gắn theo tệp sửa. Issue: người tạo |
| Vai phụ trách | `vai-1-core`, `vai-2`, `vai-3` | Người tạo issue |
| Khác | `pof` (ảnh hưởng điểm kho mã), `bug`, `enhancement`, `user-feedback`… | Người tạo issue |

Nhãn thành phần ứng với thư mục:

| Nhãn | Thư mục, tệp |
|---|---|
| `nen-tang` | `nen-tang/**` – lõi headless Tầng 1 |
| `mot-cua` | `mot-cua/**` – bộ máy một cửa Tầng 2 |
| `thu-tuc` | `thu-tuc/**` – gói thủ tục |
| `docs` | `docs/**`, `mkdocs.yml`, `*.md` ở gốc, trừ `CHANGELOG.md`, `docs/PLAN.md`, `docs/de-thi-mapping.md` |
| `ci` | `.github/**`, `Makefile`, `scripts/**` |

`CHANGELOG.md`, `docs/PLAN.md` và `docs/de-thi-mapping.md` được cập nhật trong hầu hết PR, nên không tính là đổi tài liệu. Quy tắc nằm ở [`.github/labeler.yml`](../.github/labeler.yml), workflow ở [`.github/workflows/gan-nhan.yml`](../.github/workflows/gan-nhan.yml). Workflow chỉ thêm nhãn, không gỡ nhãn người đã gắn, và không phải check bắt buộc của bảo vệ nhánh.

Nhãn `documentation` là nhãn cũ, việc mới dùng `docs`.

## 3. Bảng Project

Project "Commune DX-OS – Lộ trình" của tổ chức `commune-dxos` chứa mọi issue của repo, có ba trường:

| Trường | Giá trị |
|---|---|
| Trạng thái | Cần làm · Đang làm · Chờ duyệt · Xong |
| Tuần | Tuần 1 … Tuần 7, khớp milestone |
| Thành phần | nen-tang · mot-cua · thu-tuc · docs · ci |

Hai view:

- **Kanban** theo Trạng thái: xem tuần này ai đang làm gì, PR nào đang chờ duyệt.
- **Roadmap** theo Tuần: xem cả lộ trình 7 tuần.

Trạng thái chuyển theo luồng ở mục 4: tạo issue → *Cần làm*; tạo nhánh → *Đang làm*; mở PR → *Chờ duyệt*; merge và đóng issue → *Xong*.

## 4. Luồng một việc: issue → nhánh → PR → `develop`

```mermaid
flowchart LR
    A["Issue<br/>milestone Tuần N<br/>nhãn thành phần + vai"] --> B["Nhánh feature/&lt;tên&gt;<br/>tách từ develop"]
    B --> C["PR về develop<br/>Closes #số"]
    C --> D["CI xanh + 1 người duyệt"]
    D --> E["Merge squash vào develop<br/>issue đóng"]
    E --> F["Phát hành: develop → main<br/>tag vX.Y.Z"]
```

1. **Issue.** Tạo bằng mẫu "Việc trong tuần" (hoặc "Thủ tục mới" khi thêm gói `thu-tuc/<ma>/`, mẫu tự gắn nhãn `thu-tuc`). Chọn milestone `Tuần N`, gắn nhãn thành phần và vai. Thêm vào Project, trạng thái *Cần làm*.
2. **Nhánh.** Tách từ `develop` mới nhất, đặt tên `feature/<tên-ngắn>`; một nhánh chỉ làm một issue. Chuyển thẻ sang *Đang làm*.
3. **PR về `develop`.** Điền mẫu PR, có `Closes #<số>`, chọn cùng milestone với issue. Workflow `gan-nhan` tự gắn nhãn thành phần. Chuyển thẻ sang *Chờ duyệt*.
4. **Duyệt và merge.** 6 check bắt buộc xanh và 1 thành viên khác duyệt, rồi merge kiểu squash. Issue đóng, thẻ sang *Xong*; cập nhật dòng tương ứng trong [kế hoạch](PLAN.md).
5. **Cuối tuần.** Mọi việc của tuần đã merge thì đóng milestone. Việc chưa xong chuyển sang milestone tuần sau, ghi lý do trong issue.

Chi tiết về commit, kiểm tra trước khi mở PR và giấy phép: [Hướng dẫn đóng góp](../CONTRIBUTING.md).
