#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke cổng công dân trong compose (#57), được mot-cua/tests/smoke.sh `source` ở mục 4h (dùng
# mật khẩu MK của congdan01 đặt ở mục 3). Mọi lời gọi đi qua APISIX thật ở $GW như trình duyệt:
#   trang chủ, tài nguyên tĩnh và phông tự host; route SPA sâu tải lại vẫn 200, đường dẫn lạ 404;
#   header bảo mật (CSP không 'unsafe-inline', frame-ancestors, nosniff, Referrer-Policy);
#   /cau-hinh.js trỏ đúng Keycloak và client; route /public, /api, /files, /workflow không bị che;
#   đăng nhập Authorization Code + PKCE với client mot_cua_web, redirect_uri $GW/dang-nhap/xong
#   (đúng các bước trình duyệt làm, bằng curl); nộp hồ sơ E2E từ origin của web bằng token đó:
#   POST /api/ho_so → POST /files/ho-so/{id}/tep cho từng giấy tờ bắt buộc → POST
#   /workflow/ho-so/{id}/khoi-tao (thứ tự của src/lib/ho-so.ts).
# Không in mật khẩu hay token.

echo "== Cổng công dân qua APISIX (#57)"
WEB_TD="$(mktemp -d)"

# web_tai <đường dẫn> → "mã|Content-Type"; header ở $WEB_TD/h, body ở $WEB_TD/b
web_tai() {
  curl -s -D "$WEB_TD/h" -o "$WEB_TD/b" -w '%{http_code}|%{content_type}' "$GW$1"
}
# web_header <tên> → giá trị header của lần web_tai gần nhất
web_header() { tr -d '\r' < "$WEB_TD/h" | awk -F': ' -v h="$1" 'tolower($1) == tolower(h) {print $2}'; }

# --- Trang, tài nguyên tĩnh, phông ------------------------------------------------------------
kiem "GET / → 200 HTML" "200|text/html; charset=utf-8" "$(web_tai /)"
kiem "trang chủ có <title> của cổng" "Cổng dịch vụ công xã – Commune DX-OS" \
  "$(sed -n 's:.*<title>\(.*\)</title>.*:\1:p' "$WEB_TD/b")"
kiem "trang chủ nạp /cau-hinh.js trước mã ứng dụng" "có" \
  "$(grep -q '<script src="/cau-hinh.js"></script>' "$WEB_TD/b" && echo có || echo không)"
WEB_JS="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' "$WEB_TD/b" | head -1)"
WEB_CSS="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.css' "$WEB_TD/b" | head -1)"
kiem "mã ứng dụng $WEB_JS → 200 JavaScript" "200|application/javascript; charset=utf-8" "$(web_tai "${WEB_JS:-/assets/khong-thay.js}")"
kiem "tài nguyên băm tên: cache lâu dài" "public, max-age=31536000, immutable" "$(web_header Cache-Control)"
kiem "CSS $WEB_CSS → 200" "200|text/css" "$(web_tai "${WEB_CSS:-/assets/khong-thay.css}" | cut -d';' -f1)"
WEB_PHONG="$(grep -oE '/assets/be-vietnam-pro-[a-z]+-[0-9]+-normal-[A-Za-z0-9_-]+\.woff2' "$WEB_TD/b" | sort -u)"
kiem "CSS dùng 8 tệp phông Be Vietnam Pro tự host (latin + vietnamese, 4 độ đậm)" "8" "$(grep -c . <<<"$WEB_PHONG")"
web_loi_phong=0
for web_p in $WEB_PHONG; do [ "$(web_tai "$web_p")" = "200|font/woff2" ] || web_loi_phong=$((web_loi_phong + 1)); done
kiem "mọi tệp phông woff2 tải được (200 font/woff2)" "0" "$web_loi_phong"
kiem "CSS không gọi máy chủ phông ngoài" "0" "$(web_tai "$WEB_CSS" > /dev/null; grep -c 'fonts.googleapis\|fonts.gstatic' "$WEB_TD/b" || true)"
kiem "/favicon.ico → 200" "200" "$(web_tai /favicon.ico | cut -d'|' -f1)"

# --- Route SPA sâu tải lại không 404; đường dẫn lạ trả 404 ----------------------------------------
for web_r in "/thu-tuc/KS01" "/nop-ho-so/KS01" "/nop-ho-so/KS01/giay-to" "/dang-nhap/xong?code=x&state=y"; do
  kiem "route SPA $web_r tải lại → 200 index.html" "200 có" \
    "$(web_tai "$web_r" | cut -d'|' -f1) $(grep -q '<div id="root">' "$WEB_TD/b" && echo có || echo không)"
done
kiem "index.html không cache (luôn lấy bản mới sau khi build)" "no-cache" "$(web_tai /thu-tuc/KS01 > /dev/null; web_header Cache-Control)"
kiem "đường dẫn lạ /khong-co-trang → 404 (SPA vẫn hiện trang Không tìm thấy)" "404 có" \
  "$(web_tai /khong-co-trang | cut -d'|' -f1) $(grep -q '<div id="root">' "$WEB_TD/b" && echo có || echo không)"
kiem "POST / → 404 (route web chỉ GET/HEAD)" "404" "$(ma_http -X POST -d x "$GW/")"

# --- Header bảo mật ------------------------------------------------------------------------------
for web_r in / /thu-tuc/KS01 "$WEB_JS" /cau-hinh.js /khong-co-trang; do
  web_tai "$web_r" > /dev/null
  WEB_CSP="$(web_header Content-Security-Policy)"
  kiem "$web_r: CSP có frame-ancestors 'none', script-src 'self'; không unsafe-inline/eval" "có có không" \
    "$(grep -q "frame-ancestors 'none'" <<<"$WEB_CSP" && echo có || echo không) $(grep -q "script-src 'self';" <<<"$WEB_CSP" && echo có || echo không) $(grep -q 'unsafe-' <<<"$WEB_CSP" && echo có || echo không)"
  kiem "$web_r: X-Content-Type-Options, Referrer-Policy, X-Frame-Options" "nosniff same-origin DENY" \
    "$(web_header X-Content-Type-Options) $(web_header Referrer-Policy) $(web_header X-Frame-Options)"
done
web_tai / > /dev/null
kiem "CSP cho phép gọi đúng Keycloak $KC (connect-src)" "có" \
  "$(grep -q "connect-src 'self' $KC;" <<<"$(web_header Content-Security-Policy)" && echo có || echo không)"

# --- Cấu hình lúc chạy ---------------------------------------------------------------------------
kiem "/cau-hinh.js → 200, không cache" "200|application/javascript; charset=utf-8 no-store" \
  "$(web_tai /cau-hinh.js) $(web_header Cache-Control)"
WEB_CH="$(sed -n 's/^window.__DXOS_CAU_HINH__ = \(.*\);$/\1/p' "$WEB_TD/b")"
kiem "/cau-hinh.js: gateway cùng origin, Keycloak $KC, realm dxos, client mot_cua_web" "|$KC|dxos|mot_cua_web" \
  "$(jq -r '[.gatewayUrl, .keycloakUrl, .realm, .clientId] | join("|")' <<<"${WEB_CH:-null}")"

# --- Route của lõi không bị route web che -------------------------------------------------------
kiem "/public/thu_tuc vẫn tới PostgREST (JSON)" "200|application/json; charset=utf-8" "$(web_tai /public/thu_tuc?select=ma)"
kiem "/api/, /workflow/tasks, /files/x vẫn bắt token → 401 401 401" "401 401 401" \
  "$(ma_http "$GW/api/") $(ma_http "$GW/workflow/tasks") $(ma_http "$GW/files/x")"
kiem "CORS: origin của web $GW được PostgREST nhận (/public)" "$GW" \
  "$(header_http Access-Control-Allow-Origin -H "Origin: $GW" "$GW/public/thu_tuc?select=ma")"

# --- Đăng nhập: Authorization Code + PKCE với client mot_cua_web --------------------------------
WEB_REDIRECT="$GW/dang-nhap/xong"
WEB_VERIFIER="$(openssl rand -hex 32)"
WEB_CHALLENGE="$(printf '%s' "$WEB_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
WEB_AUTH="$KC/realms/dxos/protocol/openid-connect/auth?client_id=mot_cua_web&response_type=code&scope=openid%20profile"
WEB_AUTH="$WEB_AUTH&state=smoke57&code_challenge=$WEB_CHALLENGE&code_challenge_method=S256&redirect_uri"
kiem "Keycloak từ chối redirect_uri lạ cho mot_cua_web → 400" "400" \
  "$(ma_http "$WEB_AUTH=$(jq -rn '"http://evil.example/dang-nhap/xong"|@uri')")"
kiem "Keycloak từ chối mot_cua_web khi thiếu PKCE → lỗi code_challenge" "có" \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "${WEB_AUTH%%&code_challenge=*}&redirect_uri=$(jq -rn --arg u "$WEB_REDIRECT" '$u|@uri')" \
     | grep -q 'error=invalid_request' && echo có || echo không)"
WEB_TRANG="$(curl -s -c "$WEB_TD/jar" -b "$WEB_TD/jar" "$WEB_AUTH=$(jq -rn --arg u "$WEB_REDIRECT" '$u|@uri')")"
WEB_ACTION="$(grep -oE 'id="kc-form-login"[^>]*action="[^"]*"|action="[^"]*"[^>]*id="kc-form-login"' <<<"$WEB_TRANG" \
  | grep -oE 'action="[^"]*"' | sed 's/^action="//; s/"$//; s/&amp;/\&/g')"
kiem "Keycloak hiện form đăng nhập cho mot_cua_web + redirect_uri $WEB_REDIRECT" "có" "$([ -n "$WEB_ACTION" ] && echo có || echo không)"
WEB_VE="$(curl -s -c "$WEB_TD/jar" -b "$WEB_TD/jar" -o /dev/null -w '%{redirect_url}' \
  --data-urlencode username=congdan01 --data-urlencode "password=${MK:?}" "${WEB_ACTION:-$KC/khong-co-form}")"
kiem "congdan01 đăng nhập xong → chuyển về $WEB_REDIRECT kèm code và state" "$WEB_REDIRECT có smoke57" \
  "${WEB_VE%%\?*} $(grep -q '[?&]code=' <<<"$WEB_VE" && echo có || echo không) $(sed -n 's/.*[?&]state=\([^&]*\).*/\1/p' <<<"$WEB_VE")"
WEB_CODE="$(sed -n 's/.*[?&]code=\([^&]*\).*/\1/p' <<<"$WEB_VE")"
curl -s -D "$WEB_TD/h" -o "$WEB_TD/tk.json" -H "Origin: $GW" "$KC/realms/dxos/protocol/openid-connect/token" \
  -d grant_type=authorization_code -d client_id=mot_cua_web --data-urlencode "code=$WEB_CODE" \
  --data-urlencode "redirect_uri=$WEB_REDIRECT" -d "code_verifier=$WEB_VERIFIER"
WEB_TK="$(jq -r '.access_token // empty' "$WEB_TD/tk.json")"
kiem "đổi code + code_verifier lấy token (client public, không secret)" "có" "$([ -n "$WEB_TK" ] && echo có || echo không)"
kiem "token endpoint cho phép origin của web (webOrigins) → CORS $GW" "$GW" "$(web_header Access-Control-Allow-Origin)"
kiem "token: azp mot_cua_web, aud chứa dxos_api, vai trò cong_dan" 'mot_cua_web true ["cong_dan"]' \
  "$(jwt_payload "$WEB_TK" | jq -r '[.azp, ([.aud] | flatten | index("dxos_api") != null), (.resource_access.dxos_api.roles | tojson)] | join(" ")' 2>/dev/null)"

# --- Nộp hồ sơ E2E từ origin của web (như src/lib/ho-so.ts) -------------------------------------
if [ -n "$WEB_TK" ] && [ -n "${KS_ID:-}" ]; then
  # web_api <phương thức> <đường dẫn> [tham số curl…] → mã HTTP; body ở $WEB_TD/b
  web_api() {
    local pt="$1" duong="$2"; shift 2
    curl -s -o "$WEB_TD/b" -w '%{http_code}' -X "$pt" -H "Origin: $GW" -H 'Accept: application/json' \
      -H "Authorization: Bearer $WEB_TK" "$@" "$GW$duong"
  }
  kiem "web tạo hồ sơ KS01: POST /api/ho_so → 201" "201" \
    "$(web_api POST '/api/ho_so?select=id,ma_ho_so,trang_thai,han_xu_ly' -H 'Content-Type: application/json' \
       -H 'Prefer: return=representation' \
       -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Nguyễn Thị Thử Web\",\"so_dien_thoai\":\"0900000057\"}")"
  WEB_HS="$(jq -r '.[0].id // empty' "$WEB_TD/b")"
  kiem "hồ sơ mới: trạng thái moi, có mã hồ sơ và hạn xử lý" "moi có có" \
    "$(jq -r '.[0] | [.trang_thai, (if .ma_ho_so then "có" else "không" end), (if .han_xu_ly then "có" else "không" end)] | join(" ")' "$WEB_TD/b" 2>/dev/null)"
  printf '%%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%%%EOF\n' > "$WEB_TD/giay-to.pdf"
  web_api GET "/public/thanh_phan_yeu_cau?thu_tuc_id=eq.$KS_ID&bat_buoc=is.true&select=id,ma" > /dev/null
  WEB_YC="$(jq -r '.[].id' "$WEB_TD/b")"
  kiem "KS01 có giấy tờ bắt buộc (đọc công khai như form)" "có" "$([ -n "$WEB_YC" ] && echo có || echo không)"
  web_loi_tep=0; web_so_tep=0
  for web_yc in $WEB_YC; do
    web_so_tep=$((web_so_tep + 1))
    [ "$(web_api POST "/files/ho-so/$WEB_HS/tep?ten=giay-to-$web_so_tep.pdf&thanh_phan_yeu_cau_id=$web_yc" \
         -H 'Content-Type: application/pdf' --data-binary "@$WEB_TD/giay-to.pdf")" = "201" ] || web_loi_tep=$((web_loi_tep + 1))
  done
  kiem "web tải $web_so_tep giấy tờ bắt buộc (ClamAV quét) → 201 cả $web_so_tep" "0" "$web_loi_tep"
  kiem "web khởi tạo quy trình: POST /workflow/ho-so/{id}/khoi-tao → 201, bước tiep_nhan" "201 tiep_nhan" \
    "$(web_api POST "/workflow/ho-so/$WEB_HS/khoi-tao") $(jq -r '[.buocDangMo[].buoc] | join(",")' "$WEB_TD/b" 2>/dev/null)"
  kiem "hồ sơ nộp từ web thấy được qua /api/ho_so (RLS), đủ $web_so_tep tệp gắn thành phần" "1 $web_so_tep" \
    "$(web_api GET "/api/ho_so?id=eq.$WEB_HS&select=id" > /dev/null; jq length "$WEB_TD/b") $(sql "SELECT count(*) FROM mot_cua.thanh_phan_ho_so WHERE ho_so_id = '$WEB_HS' AND thanh_phan_yeu_cau_id IS NOT NULL AND ket_qua_quet = 'sach'")"
else
  kiem "E2E nộp hồ sơ từ web: có token web và thủ tục KS01" "có" "không"
fi

rm -rf "$WEB_TD"
