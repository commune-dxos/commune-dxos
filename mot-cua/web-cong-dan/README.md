<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Cổng công dân

Ứng dụng web Tầng 2 cho người dân (#52): xem danh mục và chi tiết thủ tục, đăng nhập, nộp hồ sơ kèm giấy tờ (#64), tra cứu tiến độ (#54). React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + thành phần shadcn/ui (lấy bằng shadcn CLI, MIT) + phông Be Vietnam Pro tự host. Giấy phép từng gói: [`DEPENDENCIES.md`](../../DEPENDENCIES.md) mục 2.

<p>
  <img src="../../docs/images/cong-cong-dan-may-tinh.webp" alt="Trang chủ cổng công dân trên máy tính: đầu trang trắng có nút Đăng nhập, khối xanh có ô Tìm thủ tục, danh mục CT01 Chứng thực bản sao và KS01 Đăng ký khai sinh có thời hạn, lệ phí, nút Nộp hồ sơ" width="68%">
  <img src="../../docs/images/cong-cong-dan-dien-thoai.webp" alt="Cùng trang trên điện thoại, bố cục một cột" width="28%">
</p>
<p>
  <img src="../../docs/images/cong-cong-dan-chi-tiet.webp" alt="Chi tiết thủ tục Đăng ký khai sinh: các bước, thành phần hồ sơ bắt buộc và nếu có, thẻ thời hạn, lệ phí và nút Bắt đầu nộp" width="68%">
  <img src="../../docs/images/cong-cong-dan-nop-ho-so.webp" alt="Bước Giấy tờ kèm theo trên điện thoại: tóm tắt lỗi đầu form liệt kê ba giấy tờ bắt buộc chưa tải" width="28%">
</p>
<p>
  <img src="../../docs/images/cong-cong-dan-da-nop.webp" alt="Trang Đã nộp hồ sơ với mã hồ sơ HS20261023-000011 do lõi cấp, hạn giải quyết và việc tiếp theo" width="68%">
</p>

- **Chỉ gọi lõi qua APISIX** (`VITE_GATEWAY_URL`). Danh mục: `GET /public/thu_tuc?select=…,linh_vuc:linh_vuc_id(ma,ten)&order=ma` (không token, role `anon`, RLS chỉ trả thủ tục công khai, 60 request/phút/IP).
- **Nộp hồ sơ** (`/nop-ho-so/:ma`, cần đăng nhập) theo mẫu dịch vụ công của GOV.UK: mỗi trang một nhóm câu hỏi, thanh bước, tóm tắt lỗi đầu form, "Kiểm tra lại thông tin", "Đã nộp". Giấy tờ cần có đọc từ JSON Schema của gói (cột `thu_tuc.json_schema`); kiểm bằng validator JSON Schema 2020-12 (`@cfworker/json-schema`, MIT) với đúng schema đó: thiếu thành phần bắt buộc hay thiếu số tệp tối thiểu (`minItems`) thì không sang bước sau, và `nopHoSo` (`src/lib/ho-so.ts`) kiểm lại trước khi gửi request đầu tiên nên không request nào đi (Poka-yoke phía trình duyệt, #53; test `src/lib/nop-ho-so.test.ts` đếm fetch = 0). `mot-cua-api` kiểm lại với tệp đã quét sạch trước khi khởi tạo quy trình (#59), thiếu → 422 và form hiện câu lỗi của máy chủ. Không dùng Ajv vì Ajv biên dịch schema bằng `new Function`, bị CSP `script-src 'self'` chặn. Bấm nộp: `POST /api/ho_so` (tạo hồ sơ) → `POST /files/ho-so/{id}/tep` cho từng tệp (ClamAV quét) → `POST /workflow/ho-so/{id}/khoi-tao`; lỗi giữa chừng thì "Thử lại" tiếp tục từ chỗ dở, không tạo trùng hồ sơ. Chế độ `dev:gia` không nộp được (báo rõ).
- **Đăng nhập** Keycloak realm `dxos`, client public `mot_cua_web`, Authorization Code + PKCE S256 ([`../keycloak/realm.json`](../keycloak/realm.json)). Web không có bí mật nào; token nằm trong `sessionStorage` của tab. Xem danh mục không cần đăng nhập.
- **Dành cho người dân:** thân chữ 18px, không chữ nào dưới 16px, nút cao ≥ 44px, mọi cặp chữ/nền đạt tương phản WCAG AA, vòng focus chàm 7.9:1 (trắng trong vùng nền xanh), bố cục một cột trên điện thoại, có liên kết "Bỏ qua, tới nội dung chính", tìm thủ tục không cần gõ dấu.
- **Giao diện (#63):** theme shadcn/ui theo bộ nhận diện trong `src/index.css` (xanh ngọc `#0F766E` cho nút chính, chàm `#4338CA` cho liên kết và focus, đỏ son `#D9480F` chỉ cho cảnh báo và dấu tích, chữ `#0B1220`); phông Be Vietnam Pro (OFL-1.1) đóng gói vào bản build, không gọi Google Fonts. Thêm thành phần: `npx shadcn@4.22.1 add <tên>` rồi chỉnh cỡ chữ, vùng bấm như các tệp sẵn có, thêm header SPDX và dòng nguồn.

## Chạy

Cần Node ≥ 20.19 (CI dùng Node 22).

```bash
cd mot-cua/web-cong-dan
npm ci
npm run dev        # http://localhost:5173, gọi APISIX ở http://localhost:9080 (cần make up ở gốc repo)
npm run dev:gia    # không cần lõi: danh mục lấy từ src/du-lieu-gia/thu-tuc.json
npm test           # Vitest
npm run build      # kiểm kiểu + build vào dist/
```

Cổng 5173 khớp `DXOS_CORS_ORIGINS` mặc định (`.env.example` ở gốc) và `redirectUris` của client `mot_cua_web`. Đổi địa chỉ: chép [`.env.example`](.env.example) thành `.env.local`.

**Trong compose (#57):** `make up` ở gốc repo build [`Dockerfile`](Dockerfile) (node → `nginxinc/nginx-unprivileged`, uid 101, rootfs chỉ đọc) thành dịch vụ `mot-cua-web`; APISIX phục vụ ở **http://localhost:9080/** cùng origin với `/public`, `/api`, `/files`, `/workflow`, nên web gọi lõi bằng đường dẫn tương đối. Image không có bí mật hay địa chỉ nào: [`nginx/default.conf.template`](nginx/default.conf.template) sinh `/cau-hinh.js` (Keycloak, realm, client) từ biến môi trường lúc chạy, `src/lib/cau-hinh.ts` ưu tiên nó hơn biến `VITE_*`; [`nginx/bao-mat.headers.template`](nginx/bao-mat.headers.template) đặt CSP (không `unsafe-inline`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`. Route SPA tải lại vẫn 200, đường dẫn lạ trả 404. Kiểm: `make smoke` mục 4h (`mot-cua/tests/smoke-web.sh`).

Tài khoản thử (sau `make demo-users` ở gốc repo): `congdan01`, `congdan02` – dữ liệu giả.

## Thư mục

| Đường dẫn | Nội dung |
|---|---|
| `src/lib/api.ts`, `src/lib/ho-so.ts` | gọi APISIX (danh mục; tạo hồ sơ, tải tệp, khởi tạo quy trình), câu báo lỗi cho người dân (401, 429, 5xx, mất mạng) |
| `src/lib/thanh-phan.ts` | đọc thành phần hồ sơ từ JSON Schema của gói, kiểm Poka-yoke bằng validator 2020-12 |
| `src/auth/` | cấu hình OIDC + PKCE (`oidc.ts`), trạng thái đăng nhập dùng chung (`xac-thuc.tsx`) |
| `src/pages/` | trang chủ (danh mục), chi tiết thủ tục (`/thu-tuc/:ma`), form nộp hồ sơ (`nop-ho-so/`: từng bước, tóm tắt lỗi, kiểm tra lại, đã nộp), hoàn tất đăng nhập, 404 |
| `src/components/ui/` | thành phần shadcn/ui (MIT) đã chỉnh cho người dân: Alert, Badge, Breadcrumb, Button, Card, Empty, Field, Input, InputGroup, Item, Label, RadioGroup, Separator, Skeleton, Textarea |
| `src/components/` | khung trang (`bo-cuc.tsx`: đầu trang, dải Thử nghiệm, chân trang), khung nội dung (`khung.tsx`), khối thông báo dùng chung cho màn lỗi/trống (`thong-bao.tsx`), trạng thái tải một thủ tục (`tai-thu-tuc.tsx`), dòng thủ tục (`the-thu-tuc.tsx`) |
| `src/du-lieu-gia/thu-tuc.json` | dữ liệu giả cho `npm run dev:gia`; test kiểm khớp `thu-tuc/*/thu-tuc.yaml` và `thanh-phan-ho-so.schema.json` |

Thêm thủ tục mới: thêm gói `thu-tuc/<ma>/` ([`docs/thu-tuc.md`](../../docs/thu-tuc.md)); cổng tự hiện thủ tục từ danh mục, không sửa mã web (chỉ cập nhật dữ liệu giả, test sẽ nhắc).
