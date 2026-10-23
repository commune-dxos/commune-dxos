<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Cổng công dân

Ứng dụng web Tầng 2 cho người dân (#52): xem danh mục thủ tục, đăng nhập, rồi nộp hồ sơ (#53) và tra cứu tiến độ (#54). React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + thành phần shadcn/ui (lấy bằng shadcn CLI, MIT) + phông Be Vietnam Pro tự host. Giấy phép từng gói: [`DEPENDENCIES.md`](../../DEPENDENCIES.md) mục 2.

<p>
  <img src="../../docs/images/cong-cong-dan-may-tinh.webp" alt="Trang chủ cổng công dân trên máy tính: đầu trang trắng có nút Đăng nhập, khối xanh có ô Tìm thủ tục, danh mục CT01 Chứng thực bản sao và KS01 Đăng ký khai sinh có thời hạn, lệ phí, nút Nộp hồ sơ" width="68%">
  <img src="../../docs/images/cong-cong-dan-dien-thoai.webp" alt="Cùng trang trên điện thoại, bố cục một cột" width="28%">
</p>

- **Chỉ gọi lõi qua APISIX** (`VITE_GATEWAY_URL`). Danh mục: `GET /public/thu_tuc?select=…,linh_vuc:linh_vuc_id(ma,ten)&order=ma` (không token, role `anon`, RLS chỉ trả thủ tục công khai, 60 request/phút/IP).
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

Cổng 5173 khớp `DXOS_CORS_ORIGINS` mặc định (`.env.example` ở gốc) và `redirectUris` của client `mot_cua_web`. Đổi địa chỉ: chép [`.env.example`](.env.example) thành `.env.local`. Container phục vụ bản build qua compose làm ở #57.

Tài khoản thử (sau `make demo-users` ở gốc repo): `congdan01`, `congdan02` – dữ liệu giả.

## Thư mục

| Đường dẫn | Nội dung |
|---|---|
| `src/lib/api.ts` | gọi APISIX, câu báo lỗi cho người dân (429, 5xx, mất mạng) |
| `src/auth/` | cấu hình OIDC + PKCE (`oidc.ts`), trạng thái đăng nhập dùng chung (`xac-thuc.tsx`) |
| `src/pages/` | trang chủ (danh mục), nộp hồ sơ (tạm "sắp có"), hoàn tất đăng nhập |
| `src/components/ui/` | thành phần shadcn/ui (MIT) đã chỉnh cho người dân: Alert, Badge, Breadcrumb, Button, Card, Empty, Field, Input, InputGroup, Item, Label, RadioGroup, Separator, Skeleton, Textarea |
| `src/components/` | khung trang (`bo-cuc.tsx`: đầu trang, dải Thử nghiệm, chân trang), khung nội dung (`khung.tsx`), khối thông báo dùng chung cho màn lỗi/trống (`thong-bao.tsx`), dòng thủ tục (`the-thu-tuc.tsx`) |
| `src/du-lieu-gia/thu-tuc.json` | dữ liệu giả cho `npm run dev:gia`; test kiểm khớp `thu-tuc/*/thu-tuc.yaml` |

Thêm thủ tục mới: thêm gói `thu-tuc/<ma>/` ([`docs/thu-tuc.md`](../../docs/thu-tuc.md)); cổng tự hiện thủ tục từ danh mục, không sửa mã web (chỉ cập nhật dữ liệu giả, test sẽ nhắc).
