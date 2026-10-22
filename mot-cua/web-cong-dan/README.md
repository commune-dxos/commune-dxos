<!-- SPDX-FileCopyrightText: 2026 DTU_DZ_2 -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
# Cổng công dân

Ứng dụng web Tầng 2 cho người dân (#52): xem danh mục thủ tục, đăng nhập, rồi nộp hồ sơ (#53) và tra cứu tiến độ (#54). React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + thành phần theo mẫu shadcn/ui. Giấy phép từng gói: [`DEPENDENCIES.md`](../../DEPENDENCIES.md) mục 2.

- **Chỉ gọi lõi qua APISIX** (`VITE_GATEWAY_URL`). Danh mục: `GET /public/thu_tuc?select=…,linh_vuc:linh_vuc_id(ma,ten)&order=ma` (không token, role `anon`, RLS chỉ trả thủ tục công khai, 60 request/phút/IP).
- **Đăng nhập** Keycloak realm `dxos`, client public `mot_cua_web`, Authorization Code + PKCE S256 ([`../keycloak/realm.json`](../keycloak/realm.json)). Web không có bí mật nào; token nằm trong `sessionStorage` của tab. Xem danh mục không cần đăng nhập.
- **Dành cho người dân:** chữ gốc 18px, nút cao ≥ 44px, chữ đạt tương phản WCAG AA, bố cục một cột trên điện thoại, có liên kết "Bỏ qua, tới nội dung chính", tìm thủ tục không cần gõ dấu.

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
| `src/components/ui/` | Button, Card, Badge, Input theo mẫu shadcn/ui (MIT) |
| `src/du-lieu-gia/thu-tuc.json` | dữ liệu giả cho `npm run dev:gia`; test kiểm khớp `thu-tuc/*/thu-tuc.yaml` |

Thêm thủ tục mới: thêm gói `thu-tuc/<ma>/` ([`docs/thu-tuc.md`](../../docs/thu-tuc.md)); cổng tự hiện thủ tục từ danh mục, không sửa mã web (chỉ cập nhật dữ liệu giả, test sẽ nhắc).
