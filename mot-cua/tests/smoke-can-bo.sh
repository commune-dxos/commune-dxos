#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke cổng cán bộ /can-bo (#55), được mot-cua/tests/smoke.sh `source` ở mục 4i, sau smoke-web.sh (dùng
# hồ sơ KS01 $WEB_HS mà công dân vừa nộp từ cổng công dân) và trước khi xóa người dùng tạm (dùng cán bộ
# tạm $U_CB phụ trách hộ tịch, lãnh đạo tạm $U_LD, mật khẩu $MK, secret OTP $OTP_CB/$OTP_LD, hàm ma_totp,
# tao_nguoi_dung_otp, xoa_nguoi_dung của smoke.sh). Mọi lời gọi qua APISIX ở $GW như trình duyệt:
#   trang /can-bo (route APISIX riêng, noindex), route SPA sâu, /cau-hinh.js có client mot_cua_can_bo,
#   gói JS cổng cán bộ tách riêng và không có bí mật;
#   Keycloak: client mot_cua_can_bo chỉ nhận redirect_uri /can-bo/*, bắt PKCE; cán bộ nhập mật khẩu
#   xong vẫn bị đòi OTP, có OTP mới có code (Authorization Code + PKCE, đúng các bước trình duyệt làm);
#   E2E: cán bộ hộ tịch thấy hồ sơ $WEB_HS trong hộp việc → xem hồ sơ, tệp (link ký sẵn), tiến độ →
#   tiếp nhận thiếu thành phần → công dân bổ sung (sửa hồ sơ, tải thêm tệp) và nộp lại (#73) →
#   tiếp nhận → thẩm định đạt (chuyển lãnh đạo) → không tự phê duyệt được → lãnh đạo phê duyệt →
#   kết thúc Hoàn tất – trả kết quả; sau mỗi bước ho_so.trang_thai trong CSDL khớp bước của quy
#   trình, cán bộ và công dân đọc cùng trạng thái qua /api và /workflow, lịch sử chuyển trạng thái
#   đủ từng bước; cán bộ lĩnh vực khác không thấy và không xử lý được hồ sơ đó;
#   công dân đăng nhập client cán bộ chỉ có vai cong_dan (web hiện "không có quyền").
# Không in mật khẩu, secret OTP hay token.

echo "== Cổng cán bộ qua APISIX (#55)"
CB_TD="$(mktemp -d)"
CB_REDIRECT="$GW/can-bo/dang-nhap/xong"

# cb_tai <đường dẫn> → "mã|Content-Type"; header ở $CB_TD/h, body ở $CB_TD/b
cb_tai() { curl -s -D "$CB_TD/h" -o "$CB_TD/b" -w '%{http_code}|%{content_type}' "$GW$1"; }
cb_header() { tr -d '\r' < "$CB_TD/h" | awk -F': ' -v h="$1" 'tolower($1) == tolower(h) {print $2}'; }

# --- Trang, route SPA, cấu hình, gói JS --------------------------------------------------------
kiem "GET /can-bo → 200 HTML (index.html của web)" "200|text/html; charset=utf-8 có" \
  "$(cb_tai /can-bo) $(grep -q '<div id="root">' "$CB_TD/b" && echo có || echo không)"
kiem "/can-bo: route APISIX riêng báo không lập chỉ mục (X-Robots-Tag)" "noindex, nofollow" "$(cb_header X-Robots-Tag)"
kiem "/can-bo: CSP script-src 'self', frame-ancestors 'none', không unsafe-" "có có không" \
  "$(grep -q "script-src 'self';" <<<"$(cb_header Content-Security-Policy)" && echo có || echo không) $(grep -q "frame-ancestors 'none'" <<<"$(cb_header Content-Security-Policy)" && echo có || echo không) $(grep -q 'unsafe-' <<<"$(cb_header Content-Security-Policy)" && echo có || echo không)"
for cb_r in /can-bo/ "/can-bo/ho-so/00000000-0000-4000-8000-000000000055" "/can-bo/dang-nhap/xong?code=x&state=y"; do
  kiem "route SPA $cb_r tải lại → 200 index.html" "200 có" \
    "$(cb_tai "$cb_r" | cut -d'|' -f1) $(grep -q '<div id="root">' "$CB_TD/b" && echo có || echo không)"
done
kiem "/can-bo-khac (không phải cổng cán bộ) → 404" "404" "$(cb_tai /can-bo-khac | cut -d'|' -f1)"
kiem "POST /can-bo → 404 (route chỉ GET/HEAD)" "404" "$(ma_http -X POST -d x "$GW/can-bo")"
cb_tai /cau-hinh.js > /dev/null
kiem "/cau-hinh.js: client cổng cán bộ mot_cua_can_bo, cổng công dân vẫn mot_cua_web" "mot_cua_can_bo|mot_cua_web" \
  "$(sed -n 's/^window.__DXOS_CAU_HINH__ = \(.*\);$/\1/p' "$CB_TD/b" | jq -r '[.clientIdCanBo, .clientId] | join("|")' 2>/dev/null)"
cb_tai / > /dev/null
CB_MAIN="$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' "$CB_TD/b" | head -1 || true)"
cb_tai "${CB_MAIN:-/assets/khong-thay.js}" > /dev/null
# Vite nạp lười bằng import("./cong-can-bo-<băm>.js") tương đối với /assets/.
CB_JS="$(grep -oE 'cong-can-bo-[A-Za-z0-9_-]+\.js' "$CB_TD/b" | head -1 || true)"
kiem "gói JS cổng cán bộ tách riêng (nạp lười) → 200 JavaScript" "200|application/javascript; charset=utf-8" "$(cb_tai "/assets/${CB_JS:-khong-thay.js}")"
kiem "gói JS cổng cán bộ không chứa client_secret hay mật khẩu" "0" "$(grep -c -iE 'client_secret|rest-admin|secretAccessKey' "$CB_TD/b" || true)"

# --- Keycloak: client public mot_cua_can_bo -------------------------------------------------------
# cb_auth <redirect_uri> <code_challenge> → URL trang đăng nhập của client cán bộ
cb_auth() {
  printf '%s' "$KC/realms/dxos/protocol/openid-connect/auth?client_id=mot_cua_can_bo&response_type=code&scope=openid%20profile&state=smoke55&code_challenge=$2&code_challenge_method=S256&redirect_uri=$(jq -rn --arg u "$1" '$u|@uri')"
}
kiem "mot_cua_can_bo từ chối redirect_uri của cổng công dân ($GW/dang-nhap/xong) → 400" "400" "$(ma_http "$(cb_auth "$GW/dang-nhap/xong" x)")"
kiem "mot_cua_can_bo từ chối redirect_uri lạ → 400" "400" "$(ma_http "$(cb_auth "http://evil.example/can-bo/dang-nhap/xong" x)")"
kiem "mot_cua_can_bo thiếu PKCE → lỗi invalid_request" "có" \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "$(cb_auth "$CB_REDIRECT" x | sed 's/&code_challenge=x&code_challenge_method=S256//')" | grep -q 'error=invalid_request' && echo có || echo không)"

# form_action <tệp html> <id form> → action của form (đã bỏ &amp;)
form_action() {
  { grep -oE "<form[^>]*>" "$1" | grep "id=\"$2\"" | head -1 | grep -oE 'action="[^"]*"' | sed 's/^action="//; s/"$//; s/&amp;/\&/g'; } || true
}
# cb_dang_nhap <tên> <username> <mật khẩu> [secret OTP]: Authorization Code + PKCE với client
# mot_cua_can_bo, đặt CB_TK = access token (rỗng nếu không được) và CB_SAU_MAT_KHAU = "otp" nếu sau
# mật khẩu Keycloak đòi OTP, "code" nếu chuyển thẳng về web. Gọi trực tiếp (không trong $(…)). Mã OTP bị từ chối (trùng mã vừa dùng, biên chu kỳ) thì
# đợi sang chu kỳ 30 giây kế tiếp và thử lại một lần.
cb_dang_nhap() {
  local jar="$CB_TD/jar-$1" verifier challenge action ve="" lan
  CB_TK=""; CB_SAU_MAT_KHAU=""
  verifier="$(openssl rand -hex 32)"
  challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
  curl -s -c "$jar" -b "$jar" -o "$CB_TD/p-$1.html" "$(cb_auth "$CB_REDIRECT" "$challenge")"
  action="$(form_action "$CB_TD/p-$1.html" kc-form-login)"
  [ -n "$action" ] || return 0
  ve="$(curl -s -c "$jar" -b "$jar" -o "$CB_TD/p-$1.html" -w '%{redirect_url}' \
    --data-urlencode "username=$2" --data-urlencode "password=$3" "$action")"
  if [ -n "$(form_action "$CB_TD/p-$1.html" kc-otp-login-form)" ]; then CB_SAU_MAT_KHAU=otp
  elif grep -q '[?&]code=' <<<"$ve"; then CB_SAU_MAT_KHAU=code
  else CB_SAU_MAT_KHAU=khac
  fi
  if [ "$CB_SAU_MAT_KHAU" = otp ]; then
    [ -n "${4:-}" ] || return 0
    for lan in 1 2; do
      action="$(form_action "$CB_TD/p-$1.html" kc-otp-login-form)"
      ve="$(curl -s -c "$jar" -b "$jar" -o "$CB_TD/p-$1.html" -w '%{redirect_url}' \
        --data-urlencode "otp=$(ma_totp "$4")" "${action:-$KC/khong-co-form}")"
      if grep -q '[?&]code=' <<<"$ve"; then break; fi
      if [ "$lan" = 1 ]; then sleep $((31 - $(date +%s) % 30)); fi
    done
  fi
  [ "${ve%%\?*}" = "$CB_REDIRECT" ] && grep -q '[?&]state=smoke55' <<<"$ve" || return 0
  CB_TK="$(curl -s -H "Origin: $GW" "$KC/realms/dxos/protocol/openid-connect/token" \
    -d grant_type=authorization_code -d client_id=mot_cua_can_bo \
    --data-urlencode "code=$(sed -n 's/.*[?&]code=\([^&]*\).*/\1/p' <<<"$ve")" \
    --data-urlencode "redirect_uri=$CB_REDIRECT" -d "code_verifier=$verifier" | jq -r '.access_token // empty')"
}

cb_dang_nhap thu "${U_CB:?}" "${MK:?}"
kiem "cán bộ nhập đúng mật khẩu ở client mot_cua_can_bo → Keycloak vẫn đòi OTP, chưa có code" "otp" "${CB_SAU_MAT_KHAU:-}"
cb_dang_nhap cb "$U_CB" "$MK" "${OTP_CB:?}"; TK_CB_WEB="$CB_TK"
kiem "cán bộ hộ tịch: mật khẩu + OTP → code → token (client public, không secret), vai can_bo" 'mot_cua_can_bo ["can_bo"]' \
  "$(jwt_payload "$TK_CB_WEB" | jq -r '"\(.azp) \(.resource_access.dxos_api.roles | tojson)"' 2>/dev/null)"
cb_dang_nhap cd congdan01 "$MK"; TK_CD_WEB="$CB_TK"
kiem "công dân đăng nhập client cán bộ: không bị đòi OTP, token chỉ có vai cong_dan (web hiện Không có quyền)" 'code ["cong_dan"]' \
  "${CB_SAU_MAT_KHAU:-} $(jwt_payload "$TK_CD_WEB" | jq -c '.resource_access.dxos_api.roles' 2>/dev/null)"

# Cán bộ tạm thứ hai phụ trách một lĩnh vực khác hộ tịch.
U_CB2="smoke-cb2-$HAU_TO"; OTP_CB2="$(openssl rand -hex 10)"
tao_nguoi_dung_otp "$U_CB2" /can-bo "$MK" "$OTP_CB2"
cb_dang_nhap cb2 "$U_CB2" "$MK" "$OTP_CB2"; TK_CB2_WEB="$CB_TK"
CB2_ID="$(sql "INSERT INTO mot_cua.can_bo (sub, ho_ten, chuc_vu) VALUES ('$(jwt_payload "$TK_CB2_WEB" | jq -r '.sub // "khong-co"')', 'Cán bộ smoke lĩnh vực khác', 'Thử') RETURNING id" | head -1)"
LV_KHAC="$(sql "SELECT id FROM mot_cua.linh_vuc WHERE ma <> 'ho_tich' ORDER BY ma LIMIT 1")"
sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB2_ID', '$LV_KHAC')" > /dev/null
kiem "cán bộ lĩnh vực khác ($(sql "SELECT ma FROM mot_cua.linh_vuc WHERE id = '$LV_KHAC'")): mật khẩu + OTP → token vai can_bo" '["can_bo"]' \
  "$(jwt_payload "$TK_CB2_WEB" | jq -c '.resource_access.dxos_api.roles' 2>/dev/null)"

# --- E2E: hồ sơ KS01 công dân vừa nộp từ web ------------------------------------------------------
# cb_api <token> <phương thức> <đường dẫn> [tham số curl…] → mã HTTP; body ở $CB_TD/b (như src/can-bo/lib/api.ts)
cb_api() {
  local tk="$1" pt="$2" duong="$3"; shift 3
  curl -s -o "$CB_TD/b" -w '%{http_code}' -X "$pt" -H "Origin: $GW" -H 'Accept: application/json' \
    -H "Authorization: Bearer $tk" "$@" "$GW$duong"
}
# cb_task <token> <hồ sơ> → "id|bước" của task hồ sơ đó trong hộp việc (rỗng nếu không thấy)
cb_task() {
  cb_api "$1" GET /workflow/tasks > /dev/null
  jq -r --arg h "$2" '[.[]? | select(.hoSoId == $h)][0] | if . then "\(.id)|\(.buoc)" else "" end' "$CB_TD/b"
}
# cb_xong <token> <task> <biến JSON> → "mã|bước đang mở"
cb_xong() {
  local ma
  ma="$(cb_api "$1" POST "/workflow/tasks/$2/complete" -H 'Content-Type: application/json' -d "{\"bien\":$3}")"
  echo "$ma|$(jq -r '[.buocDangMo[]?.buoc] | join(",")' "$CB_TD/b" 2>/dev/null)"
}
# cb_tt → "trạng thái|lý do" của $WEB_HS trong CSDL; cb_tt_api <token> → trang_thai đọc qua /api (RLS)
cb_tt() { sql "SELECT trang_thai || '|' || coalesce(ly_do, '') FROM mot_cua.ho_so WHERE id = '$WEB_HS'"; }
cb_tt_api() { cb_api "$1" GET "/api/ho_so?id=eq.$WEB_HS&select=trang_thai" > /dev/null; jq -r '.[0].trang_thai // "không thấy"' "$CB_TD/b" 2>/dev/null; }

if [ -n "$TK_CB_WEB" ] && [ -n "${WEB_HS:-}" ]; then
  T="$(cb_task "$TK_CB_WEB" "$WEB_HS")"
  kiem "hộp việc cán bộ hộ tịch có hồ sơ KS01 vừa nộp từ web, bước tiep_nhan, chưa ai nhận" "tiep_nhan null" \
    "${T#*|} $(jq -r --arg h "$WEB_HS" '[.[] | select(.hoSoId == $h)][0].nguoiNhan' "$CB_TD/b")"
  kiem "task có hạn xử lý hanXuLyLuc (17:00 giờ Việt Nam) để web tính còn bao lâu" "có" \
    "$(jq -r --arg h "$WEB_HS" '[.[] | select(.hoSoId == $h)][0].hanXuLyLuc // "" | test("T17:00:00\\+07:00$") | if . then "có" else "không" end' "$CB_TD/b")"
  kiem "hồ sơ đọc qua /api (RLS): người nộp, thủ tục KS01, form bước tiep_nhan có nhãn từ BPMN" "200 Nguyễn Thị Thử Web KS01 Đủ thành phần hồ sơ? true" \
    "$(cb_api "$TK_CB_WEB" GET "/api/ho_so?id=in.($WEB_HS)&select=id,ho_ten_nguoi_nop,thu_tuc:thu_tuc_id(ma,bien_theo_buoc)") $(jq -r '.[0] | "\(.ho_ten_nguoi_nop) \(.thu_tuc.ma) \(.thu_tuc.bien_theo_buoc.tiep_nhan.hopLe.ten) \(.thu_tuc.bien_theo_buoc.tiep_nhan.hopLe.bat_buoc)"' "$CB_TD/b" 2>/dev/null)"
  kiem "cán bộ xem danh sách tệp của hồ sơ qua /files → 200, có tệp đã quét sạch" "200 true" \
    "$(cb_api "$TK_CB_WEB" GET "/files/ho-so/$WEB_HS/tep") $(jq '(length > 0) and all(.[]; .ket_qua_quet == "sach")' "$CB_TD/b" 2>/dev/null)"
  CB_TEP="$(jq -r '.[0].id // empty' "$CB_TD/b")"
  cb_api "$TK_CB_WEB" GET "/files/tep/${CB_TEP:-00000000-0000-0000-0000-000000000000}" > /dev/null
  CB_LINK="$(jq -r '.link // empty' "$CB_TD/b")"
  kiem "cán bộ lấy link ký sẵn qua /files/s3 rồi tải được tệp PDF" "200|application/pdf" \
    "$( [ -n "$CB_LINK" ] && curl -s -o /dev/null -w '%{http_code}|%{content_type}' "$CB_LINK" || echo "không có link")"
  kiem "tiến độ hồ sơ (lịch sử các bước) → 200, đang ở tiep_nhan" "200 tiep_nhan" \
    "$(cb_api "$TK_CB_WEB" GET "/workflow/ho-so/$WEB_HS/tien-do") $(jq -r '[.quyTrinh[-1].buocDangMo[].buoc] | join(",")' "$CB_TD/b" 2>/dev/null)"

  # Cán bộ lĩnh vực khác: không thấy, không xử lý được.
  kiem "cán bộ lĩnh vực khác: không thấy task hồ sơ đó trong hộp việc" "" "$(cb_task "$TK_CB2_WEB" "$WEB_HS")"
  kiem "cán bộ lĩnh vực khác: /api/ho_so (RLS) → 0 dòng; tiến độ → 404; tệp → 403/404" "0 404 có" \
    "$(cb_api "$TK_CB2_WEB" GET "/api/ho_so?id=in.($WEB_HS)&select=id" > /dev/null; jq length "$CB_TD/b") $(cb_api "$TK_CB2_WEB" GET "/workflow/ho-so/$WEB_HS/tien-do") $(case "$(cb_api "$TK_CB2_WEB" GET "/files/ho-so/$WEB_HS/tep")" in 403|404) echo có ;; *) echo không ;; esac)"
  kiem "cán bộ lĩnh vực khác hoàn thành task tiep_nhan → 403, câu báo tiếng Việt" "403|Không thuộc nhóm được giao task này" \
    "$(cb_xong "$TK_CB2_WEB" "${T%%|*}" '{"hopLe":true}' | cut -d'|' -f1)|$(jq -r '.loi' "$CB_TD/b")"

  # Cán bộ hộ tịch xử lý: nhận (tiếp nhận) → thẩm định đạt (chuyển lãnh đạo).
  kiem "cán bộ gửi sai biến cho bước (pheDuyet ở tiep_nhan) → 400" "400" "$(cb_xong "$TK_CB_WEB" "${T%%|*}" '{"pheDuyet":true}' | cut -d'|' -f1)"
  kiem "trước tiếp nhận: CSDL moi (gói khai tiep_nhan: moi), cán bộ đọc qua /api cũng moi" "moi| moi" "$(cb_tt) $(cb_tt_api "$TK_CB_WEB")"

  # Luồng bổ sung (#73): cán bộ yêu cầu bổ sung → công dân sửa, tải thêm tệp, nộp lại → đi tiếp.
  kiem "cán bộ tiếp nhận: Đủ thành phần? Không + ghi chú → 200, sang bo_sung (bước của công dân)" "200|bo_sung" \
    "$(cb_xong "$TK_CB_WEB" "${T%%|*}" '{"hopLe":false,"ghiChu":"Thiếu bản sao giấy chứng sinh (smoke #73)"}')"
  kiem "CSDL: cho_bo_sung, lý do = ghi chú cán bộ" "cho_bo_sung|Thiếu bản sao giấy chứng sinh (smoke #73)" "$(cb_tt)"
  TK_CD73="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
  kiem "cán bộ (/api), công dân (/api, tiến độ /workflow) đọc cùng trạng thái cho_bo_sung" "cho_bo_sung cho_bo_sung cho_bo_sung" \
    "$(cb_tt_api "$TK_CB_WEB") $(cb_tt_api "$TK_CD73") $(cb_api "$TK_CD73" GET "/workflow/ho-so/$WEB_HS/tien-do" > /dev/null; jq -r '.hoSo.trang_thai' "$CB_TD/b" 2>/dev/null)"
  kiem "chờ bổ sung: công dân sửa số điện thoại qua /api → 200, 1 dòng (RLS chỉ cho khi cho_bo_sung)" "200 1" \
    "$(cb_api "$TK_CD73" PATCH "/api/ho_so?id=eq.$WEB_HS" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
       -d '{"so_dien_thoai":"0900000073"}') $(jq length "$CB_TD/b" 2>/dev/null)"
  printf '%%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%%%EOF\n' > "$CB_TD/bo-sung.pdf"
  kiem "chờ bổ sung: công dân tải thêm giấy tờ qua /files → 201" "201" \
    "$(cb_api "$TK_CD73" POST "/files/ho-so/$WEB_HS/tep?ten=bo-sung.pdf&thanh_phan_yeu_cau_id=$(sql "SELECT y.id FROM mot_cua.thanh_phan_yeu_cau y JOIN mot_cua.ho_so h ON h.thu_tuc_id = y.thu_tuc_id WHERE h.id = '$WEB_HS' AND y.bat_buoc ORDER BY y.thu_tu LIMIT 1")" \
       -H 'Content-Type: application/pdf' --data-binary "@$CB_TD/bo-sung.pdf")"
  kiem "hộp việc cán bộ không còn hồ sơ (đang chờ công dân)" "" "$(cb_task "$TK_CB_WEB" "$WEB_HS")"
  T="$(cb_task "$TK_CD73" "$WEB_HS")"
  kiem "công dân thấy task bo_sung của mình qua /workflow/tasks" "bo_sung" "${T#*|}"
  kiem "công dân nộp lại (hoàn thành bo_sung) → 200, quay lại tiep_nhan" "200|tiep_nhan" \
    "$(cb_xong "$TK_CD73" "${T%%|*}" '{"ghiChu":"Đã bổ sung bản sao (smoke #73)"}')"
  kiem "nộp lại: CSDL dang_xu_ly (không về moi); công dân hết sửa được (RLS) → 0 dòng" "dang_xu_ly 0" \
    "$(cb_tt | cut -d'|' -f1) $(cb_api "$TK_CD73" PATCH "/api/ho_so?id=eq.$WEB_HS" -H 'Content-Type: application/json' \
       -H 'Prefer: return=representation' -d '{"so_dien_thoai":"0900000074"}' > /dev/null; jq length "$CB_TD/b" 2>/dev/null)"

  T="$(cb_task "$TK_CB_WEB" "$WEB_HS")"
  kiem "hộp việc cán bộ: hồ sơ về lại bước tiep_nhan" "tiep_nhan" "${T#*|}"
  kiem "cán bộ tiếp nhận lại: Đủ thành phần hồ sơ? Có → 200, sang tham_dinh" "200|tham_dinh" \
    "$(cb_xong "$TK_CB_WEB" "${T%%|*}" '{"hopLe":true,"ghiChu":"Đủ giấy tờ (smoke #55)"}')"
  kiem "CSDL sau tiếp nhận: dang_xu_ly" "dang_xu_ly" "$(cb_tt | cut -d'|' -f1)"
  T="$(cb_task "$TK_CB_WEB" "$WEB_HS")"
  kiem "hộp việc cán bộ: hồ sơ ở bước tham_dinh" "tham_dinh" "${T#*|}"
  kiem "cán bộ thẩm định: Đạt yêu cầu? Có → chuyển lãnh đạo (phe_duyet)" "200|phe_duyet" \
    "$(cb_xong "$TK_CB_WEB" "${T%%|*}" '{"datYeuCau":true,"ghiChu":"Trình lãnh đạo"}')"
  kiem "CSDL sau thẩm định: cho_phe_duyet; cán bộ đọc qua /api cũng vậy" "cho_phe_duyet cho_phe_duyet" \
    "$(cb_tt | cut -d'|' -f1) $(cb_tt_api "$TK_CB_WEB")"
  kiem "hộp việc cán bộ không còn hồ sơ (bước của lãnh đạo)" "" "$(cb_task "$TK_CB_WEB" "$WEB_HS")"
  CB_PD="$(wf "runtime/tasks?processInstanceId=$(cb_api "$TK_CB_WEB" GET "/workflow/ho-so/$WEB_HS/tien-do" > /dev/null; jq -r '.quyTrinh[-1].processInstanceId' "$CB_TD/b")" | jq -r '.data[0].id // empty')"
  kiem "cán bộ tự phê duyệt (bước nhóm lanh_dao) → 403" "403" "$(cb_xong "$TK_CB_WEB" "${CB_PD:-x}" '{"pheDuyet":true}' | cut -d'|' -f1)"

  # Lãnh đạo đăng nhập cổng cán bộ (mật khẩu + OTP) và phê duyệt → trả kết quả.
  cb_dang_nhap ld "${U_LD:?}" "$MK" "${OTP_LD:?}"; TK_LD_WEB="$CB_TK"
  kiem "lãnh đạo: mật khẩu + OTP ở client mot_cua_can_bo → token vai lanh_dao" '["lanh_dao"]' \
    "$(jwt_payload "$TK_LD_WEB" | jq -c '.resource_access.dxos_api.roles' 2>/dev/null)"
  T="$(cb_task "$TK_LD_WEB" "$WEB_HS")"
  kiem "hộp việc lãnh đạo có hồ sơ ở bước phe_duyet" "phe_duyet" "${T#*|}"
  kiem "lãnh đạo phê duyệt → 200, không còn bước mở" "200|" "$(cb_xong "$TK_LD_WEB" "${T%%|*}" '{"pheDuyet":true,"ghiChu":"Đồng ý (smoke #55)"}')"
  kiem "CSDL sau phê duyệt: hoan_tat, có ngày hoàn tất; lãnh đạo và công dân đọc qua /api cũng hoan_tat" "hoan_tat true hoan_tat hoan_tat" \
    "$(sql "SELECT trang_thai || ' ' || (ngay_hoan_tat IS NOT NULL) FROM mot_cua.ho_so WHERE id = '$WEB_HS'") $(cb_tt_api "$TK_LD_WEB") $(cb_tt_api "$TK_CD73")"
  kiem "lịch sử trạng thái: mỗi bước một dòng, nguồn quy trình, đúng bước gây ra" \
    "moi:nop cho_bo_sung:quy_trinh:tiep_nhan dang_xu_ly:quy_trinh:bo_sung cho_phe_duyet:quy_trinh:tham_dinh hoan_tat:quy_trinh:phe_duyet" \
    "$(sql "SELECT string_agg(concat_ws(':', den_trang_thai, nguon, buoc), ' ' ORDER BY id) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = '$WEB_HS'")"
  kiem "cán bộ hộ tịch đọc lịch sử trạng thái qua /api → 5 dòng; cán bộ lĩnh vực khác → 0" "5 0" \
    "$(cb_api "$TK_CB_WEB" GET "/api/lich_su_trang_thai?ho_so_id=eq.$WEB_HS&select=den_trang_thai" > /dev/null; jq length "$CB_TD/b") $(cb_api "$TK_CB2_WEB" GET "/api/lich_su_trang_thai?ho_so_id=eq.$WEB_HS&select=den_trang_thai" > /dev/null; jq length "$CB_TD/b")"
  kiem "tiến độ: kết thúc Hoàn tất – trả kết quả, đi đúng tiep_nhan,bo_sung,tiep_nhan,tham_dinh,phe_duyet" "ket_thuc_hoan_tat tiep_nhan,bo_sung,tiep_nhan,tham_dinh,phe_duyet" \
    "$(cb_api "$TK_CB_WEB" GET "/workflow/ho-so/$WEB_HS/tien-do" > /dev/null; jq -r '.quyTrinh[-1] | "\(.diemKetThuc) \([.lichSu[].buoc] | join(","))"' "$CB_TD/b" 2>/dev/null)"
  kiem "Flowable ghi người xử lý: tiep_nhan, tham_dinh = cán bộ hộ tịch; bo_sung = công dân; phe_duyet = lãnh đạo" \
    "$SUB_CB $SUB $SUB_CB $SUB_CB $(jwt_payload "$TK_LD_WEB" | jq -r .sub)" \
    "$(wf "history/historic-task-instances?processInstanceId=$(jq -r '.quyTrinh[-1].processInstanceId' "$CB_TD/b")&sort=startTime&order=asc" | jq -r '[.data[].assignee] | join(" ")')"
else
  kiem "E2E cổng cán bộ: có token cán bộ (PKCE + OTP) và hồ sơ nộp từ web" "có" "không"
fi

# Dọn cán bộ tạm thứ hai (cán bộ tạm thứ nhất và lãnh đạo tạm do smoke.sh dọn).
sql "DELETE FROM mot_cua.can_bo_linh_vuc WHERE can_bo_id = '$CB2_ID'; DELETE FROM mot_cua.can_bo WHERE id = '$CB2_ID'" > /dev/null
xoa_nguoi_dung "$U_CB2"
rm -rf "$CB_TD"
