# Một cửa xã – app di động cho công dân

App Android cho người dân dùng bộ máy một cửa của Commune DX-OS (Tầng 2, quyết định D-015):
xem thủ tục, nộp hồ sơ kèm ảnh giấy tờ, tra cứu theo mã hồ sơ, theo dõi hồ sơ của mình.
App gọi đúng các API mà cổng công dân web (`mot-cua/web-cong-dan/`) đang dùng, qua APISIX:

| Đường dẫn | Dùng cho | Cần đăng nhập |
|---|---|---|
| `GET /public/thu_tuc` | danh sách thủ tục, JSON Schema thành phần hồ sơ | không |
| `GET /public/rpc/tra_cuu_ho_so` | tra cứu bằng mã hồ sơ + 4 số cuối điện thoại | không |
| `POST /api/ho_so`, `GET /api/ho_so`, `GET /api/lich_su_trang_thai` | tạo hồ sơ, hồ sơ của tôi, các mốc trạng thái (PostgREST, RLS) | có |
| `POST /files/ho-so/{id}/tep`, `GET /files/ho-so/{id}/tep` | tải ảnh giấy tờ (ClamAV quét, Garage lưu) | có |
| `POST /workflow/ho-so/{id}/khoi-tao` | khởi tạo quy trình Flowable của thủ tục | có |

Đăng nhập bằng Keycloak (realm `dxos`), Authorization Code + PKCE, client public `mot_cua_di_dong`,
không có client secret trong app. Token lưu trong Android Keystore qua `react-native-keychain`.

## Công nghệ

React Native 0.80 (bare, New Architecture, Hermes) · TypeScript strict · React Navigation 7 ·
TanStack Query 5 · Zustand 5 · i18next (tiếng Việt) · NetInfo · AsyncStorage · react-native-keychain ·
react-native-app-auth · react-native-image-picker. Giấy phép từng gói: [`DEPENDENCIES.md`](../../DEPENDENCIES.md).
Chỉ build Android; chưa có bản iOS.

## Cấu trúc

```
src/
  cau-hinh/     cấu hình môi trường (DXOS_*), TanStack Query
  dich-vu/      gọi APISIX: goi-api, danh-muc, ho-so, tra-cuu, nop-ho-so, thanh-phan, xac-thuc
  kho/          kho Zustand: phiên đăng nhập, trạng thái mạng
  dieu-huong/   stack gốc + thanh tab
  man-hinh/     các màn
  thanh-phan/   thành phần dùng chung: nút, thẻ, ô nhập, màn đang tải / lỗi / trống, dải mất mạng
  giao-dien/    màu, cỡ chữ theo cổng công dân
  ngon-ngu/     chuỗi giao diện tiếng Việt (vi.json)
__tests__/      Jest: dịch vụ và kho
android/        dự án Android (package vn.communedxos.motcua)
```

## Chạy thử

Cần Node ≥ 22, JDK 17, Android SDK (platform 35, build-tools 35.0.0, NDK 27.1.12297006, CMake),
một máy ảo hoặc điện thoại Android bật gỡ lỗi USB.

```bash
cd mot-cua/di-dong
corepack enable          # dùng Yarn 1.22 theo packageManager
yarn install --frozen-lockfile
cp .env.example .env     # bỏ qua thì app trỏ bản demo https://commune.dzfullstack.com
yarn start               # Metro
yarn android             # build, cài và mở app trên máy ảo/điện thoại
```

Kiểm tra trước khi commit:

```bash
yarn typecheck && yarn lint && yarn test
```

### Trỏ máy local thay cho bản demo

Chạy lõi ở gốc repo (`make up`), rồi cho máy ảo Android thấy cổng của máy tính:

```bash
adb reverse tcp:9080 tcp:9080
adb reverse tcp:8080 tcp:8080
```

Sửa `.env`:

```
DXOS_GATEWAY_URL=http://localhost:9080
DXOS_KEYCLOAK_URL=http://localhost:8080
```

Biến môi trường được gắn vào mã lúc đóng gói (`babel.config.js`), nên sau khi đổi `.env` phải chạy
`yarn start --reset-cache` (hoặc build lại APK). Bản debug cho phép HTTP thường để gọi máy local.

## Build APK debug

```bash
cd mot-cua/di-dong
yarn apk:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

APK debug đã đóng gói sẵn JS (`debuggableVariants = []` trong `android/app/build.gradle`), cài lên
điện thoại là chạy, không cần Metro. APK được ký bằng khóa debug mặc định của máy build
(`~/.android/debug.keystore`); repo không chứa keystore nào. Workflow `di-dong` trên GitHub cũng build APK
khi đẩy vào `develop`/`main` hoặc bấm chạy tay, tải ở mục Artifacts.

## Giấy phép

GPL-3.0-or-later như toàn repo. Mọi tệp mã có header SPDX 2 dòng; tệp ảnh, `yarn.lock` và Gradle wrapper
(Apache-2.0, tệp gốc của Gradle) khai trong [`REUSE.toml`](../../REUSE.toml).
