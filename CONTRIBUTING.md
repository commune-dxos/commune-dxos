<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Đóng góp

Cảm ơn bạn quan tâm tới Commune DX-OS. Tài liệu này mô tả cách đội DTU_DZ_2 làm việc trên kho mã; người ngoài đội đóng góp cũng theo đúng các bước này.

## 1. Nhánh

| Nhánh | Dùng cho | Ai được đẩy |
|---|---|---|
| `main` | Chỉ chứa bản phát hành (`v0.1.0`, …, `v1.0.0`), nhận PR từ `develop` khi phát hành | Không ai đẩy thẳng; chỉ qua PR |
| `develop` | Nhánh tích hợp hằng ngày, luôn phải `make check` đạt | Không ai đẩy thẳng; chỉ qua PR |
| `feature/<số-issue>-<tên-ngắn>` | Một việc, tách từ `develop` | Người phụ trách issue |

`main` và `develop` được bảo vệ: bắt buộc PR, 1 người duyệt, CI xanh (xem mục 6), nhánh phải cập nhật theo đích, cấm force-push.

## 2. Quy trình một việc: issue → nhánh → PR

1. **Issue.** Mỗi việc trong [`docs/PLAN.md`](docs/PLAN.md) là một issue, tạo bằng mẫu "Việc trong tuần" (thêm gói thủ tục thì dùng mẫu "Thủ tục mới"). Chọn milestone `Tuần N`, gắn nhãn thành phần (`nen-tang`, `mot-cua`, `thu-tuc`, `docs`, `ci`), nhãn vai (`vai-1-core`, `vai-2`, `vai-3`), thêm `pof` nếu việc ảnh hưởng điểm kho mã (giấy phép, release, build, tài liệu). Giao issue cho đúng người phụ trách. Milestone, nhãn và bảng Project: [`docs/quy-trinh-lam-viec.md`](docs/quy-trinh-lam-viec.md).
2. **Nhánh.** Tách từ `develop` mới nhất:
   ```bash
   git switch develop && git pull --ff-only
   git switch -c feature/12-garage-s3
   ```
   Tên nhánh: số issue + vài từ không dấu, nối bằng gạch ngang. Một nhánh chỉ làm một issue.
3. **Commit** nhỏ, mỗi commit một ý (xem mục 3). Trước khi đẩy chạy `make check`, `make lint`, `make test` (mục 6).
4. **PR về `develop`.** Điền mẫu PR (mô tả, `Closes #<số>`, checklist), chọn cùng milestone với issue. Nhãn thành phần do workflow `gan-nhan` tự gắn theo tệp sửa; nhãn vai gắn như issue.
5. **Duyệt.** Ít nhất **1 thành viên khác** đọc và duyệt; người viết không tự duyệt. Người duyệt chạy thử (`make up` + `make smoke`) khi PR đụng tới `docker-compose.yml`, `nen-tang/`, `mot-cua/` hay gói `thu-tuc/`.
6. **Merge bằng squash.** Tiêu đề squash giữ đúng định dạng Conventional Commits và số issue, ví dụ `feat(storage): Garage S3 + quét ClamAV (#12)`. Xóa nhánh sau khi merge.
7. **Phát hành.** CHANGELOG và ghi chú phát hành sinh bằng git-cliff từ commit; workflow `phat-hanh` tự tạo Release khi đẩy tag. Các bước: [`docs/quy-trinh-lam-viec.md`](docs/quy-trinh-lam-viec.md) mục 6.

## 3. Commit theo Conventional Commits

```
<loại>(<phạm vi>): <mô tả ngắn bằng tiếng Việt> (#<số-issue>)
```

- Loại: `feat` (tính năng), `fix` (sửa lỗi), `docs` (tài liệu), `chore` (việc vặt, cấu hình), `refactor`, `test`, `ci`.
- Phạm vi gợi ý: `nen-tang`, `thu-tuc`, `keycloak`, `apisix`, `postgres`, `postgrest`, `flowable`, `storage`, `mot-cua`, `web`, `ocr`, `rag`, `bi`.
- Commit đóng issue thì thêm dòng `Closes #<số>` ở thân commit hoặc trong PR.
- Ví dụ: `fix(apisix): giới hạn tần suất cổng công dân theo IP (#18)`.
- Commit sinh ra CHANGELOG, nên loại và phạm vi quyết định commit nằm ở mục nào: [`docs/quy-trinh-lam-viec.md`](docs/quy-trinh-lam-viec.md) mục 5.

**Ai làm thì người đó commit, bằng tài khoản GitHub của mình.** Lịch sử commit là bằng chứng đóng góp của từng thành viên.

## 4. Không commit bí mật và dữ liệu thật

- Không commit `.env`, mật khẩu, token, khóa API, khóa riêng (`*.pem`, `*.key`), tệp xuất realm có client secret thật. Bí mật khi chạy lấy từ `.env` (máy cá nhân) hoặc OpenBao.
- Biến mới: thêm vào `.env.example` với **giá trị mẫu rõ ràng là giả** (ví dụ `changeme`).
- Không đưa token vào URL git (`https://<token>@github.com/...`) hay vào log CI.
- Lỡ commit bí mật: báo trưởng nhóm ngay, **thu hồi và cấp lại** bí mật đó. Xóa khỏi lịch sử git là chưa đủ vì kho đã công khai.
- Dữ liệu mẫu là dữ liệu giả. Tuyệt đối không dùng giấy tờ, số CCCD, ảnh của người thật.

## 5. Giấy phép

- Dự án phát hành theo **GPL-3.0-or-later** ([`LICENSE`](LICENSE)) từ sau v0.2.0 (D-010); v0.0.1–v0.2.0 là Apache-2.0.
- **Inbound = outbound:** gửi đóng góp (commit, PR) là bạn đồng ý cấp phép phần đóng góp đó theo GPL-3.0-or-later, cùng giấy phép của dự án. Không cần ký CLA. Chỉ gửi mã do bạn viết hoặc có quyền cấp phép như vậy.
- Mọi tệp mã và cấu hình có header 2 dòng ngay trong commit đầu tiên của tệp: `SPDX-FileCopyrightText: 2026 DTU_DZ_2` và `SPDX-License-Identifier: GPL-3.0-or-later`. Chạy `make license` để thêm, `make check` để kiểm (tệp thiếu header hoặc còn giấy phép khác, kể cả Apache-2.0 cũ, đều bị báo lỗi). Tệp không chứa được chú thích (JSON, ảnh) khai trong [`REUSE.toml`](REUSE.toml).
- Chỉ dùng thành phần có giấy phép được OSI phê duyệt và tương thích GPL-3.0 (cột "Tương thích GPL-3.0" trong `DEPENDENCIES.md`); thành phần AGPL/GPL-2.0 chỉ chạy như dịch vụ riêng. Thêm hoặc nâng phiên bản một thành phần thì sửa [`DEPENDENCIES.md`](DEPENDENCIES.md) (và [`NOTICE`](NOTICE) nếu là thành phần mới) trong cùng PR. Danh sách thành phần đội không dùng nằm ở `DEPENDENCIES.md`.
- Không sao chép, vendor hay sửa mã của thư viện bên thứ ba; khai báo qua trình quản lý gói hoặc dùng image gốc.

## 6. Trước khi mở PR

Chạy trên máy đúng những lệnh CI chạy, mỗi lệnh ứng với một job (check) trên PR:

| Lệnh | Job CI | Kiểm gì | Cần |
|---|---|---|---|
| `make check` | `make-check` | SPDX từng tệp, cấu trúc BPMN, kiểm gói `thu-tuc/*` (bộ nạp `--chi-kiem`), test đơn vị, compose hợp lệ mọi profile | Docker Compose, Python 3 |
| `make lint` | `shellcheck`, `yamllint`, `bpmn`, `reuse` | mọi `*.sh`; YAML theo `.yamllint.yml` (kể cả `thu-tuc.yaml`); BPMN `thu-tuc/*/quy-trinh.bpmn20.xml` + test của bộ kiểm; `reuse lint`: mọi tệp có bản quyền + giấy phép theo đặc tả REUSE 3.3 (header SPDX hoặc `REUSE.toml`) | `pip install -r scripts/requirements-lint.txt` (nên dùng `.venv`) |
| `make test` | `test-backend`, `test-sql` | unittest `mot-cua/backend/tests` (kể cả bộ nạp gói); migration nền tảng + `mot-cua` trên PostgreSQL trống rồi `mot-cua/db/tests/*.sql` (RLS, danh mục gói) | Python 3; Docker (tự dựng container tạm) hoặc `PGHOST` tới một PostgreSQL trống |

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-lint.txt   # một lần
PATH="$PWD/.venv/bin:$PATH" make lint
make test
```

Viết test SQL mới: thêm `mot-cua/db/tests/<tên>.sql`, in mỗi kiểm tra một dòng `ĐẠT|…` hoặc `TRƯỢT|…`, chạy trong một transaction rồi `ROLLBACK` (xem `mot-cua/db/tests/rls.sql`).

- [ ] `make check`, `make lint`, `make test` đạt
- [ ] `make up` + `make smoke` vẫn đạt từ máy sạch nếu PR đổi `docker-compose.yml`, `nen-tang/`, `mot-cua/` hoặc `thu-tuc/`
- [ ] Tiêu đề PR theo quy ước commit, kèm `(#số-issue)`; không sửa tay `CHANGELOG.md` ([quy trình](docs/quy-trinh-lam-viec.md) mục 5)
- [ ] Tài liệu liên quan đã cập nhật

Hành vi trong cộng đồng: xem [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
