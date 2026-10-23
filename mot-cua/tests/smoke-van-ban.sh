#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke sổ văn bản đến/đi (#78), được mot-cua/tests/smoke.sh `source` ở mục 4n, trước khi xóa người dùng tạm
# (dùng hồ sơ $WEB_HS đã có biên nhận ký số, lãnh đạo tạm $U_LD/$OTP_LD, cán bộ tạm $U_CB/$OTP_CB, mật khẩu
# $MK, hàm tao_nguoi_dung_otp, xoa_nguoi_dung, lay_token của smoke.sh, kt_token_otp của smoke-kiem-toan.sh).
# Tạo một văn thư tạm (nhóm /van-thu, có OTP) rồi xóa. Mọi lời gọi qua APISIX:
#   văn bản đến: văn thư vào sổ PDF có chữ ký số của xã → số đến kế tiếp, chữ ký xác minh hợp lệ, tệp trên
#   Garage tải lại đúng SHA-256; tệp chứa mã độc (EICAR) → 422, không vào sổ; cán bộ không vào sổ được;
#   văn bản đi: văn thư soạn dự thảo (chưa số) → cán bộ, văn thư không ký được → lãnh đạo ký ban hành: số đi
#   kế tiếp, ký hiệu <số>/TB-UBND, PDF ký PAdES xác minh hợp lệ và nhận ra đúng văn bản đã phát hành → ký lại
#   409, superuser sửa văn bản đã ký bị chặn, nhật ký kiểm toán van_ban.ky có SHA-256 của PDF;
#   quyền đọc sổ: cán bộ, lãnh đạo, văn thư đọc được, công dân không.
# Không in mật khẩu, secret OTP hay token.

echo "== Sổ văn bản đến/đi có ký số (#78)"
VB_TD="$(mktemp -d)"
U_VT="smoke-vt-$(openssl rand -hex 4)"; OTP_VT="$(openssl rand -hex 10)"
tao_nguoi_dung_otp "$U_VT" /van-thu "$MK" "$OTP_VT"
VB_VT="$(kt_token_otp "$U_VT" "$OTP_VT")"
VB_LD="$(kt_token_otp "${U_LD:?}" "${OTP_LD:?}")"
VB_CB="$(kt_token_otp "${U_CB:?}" "${OTP_CB:?}")"
VB_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
kiem "văn thư tạm: mật khẩu + OTP → token, vai van_thu" '["van_thu"]' \
  "$(jwt_payload "$VB_VT" | jq -c '.resource_access.dxos_api.roles // "KHÔNG TOKEN"')"
# vb_goi <token> <METHOD> <đường dẫn> [tham số curl…] → mã HTTP; body ở $VB_TD/b
vb_goi() { local tk="$1" m="$2" d="$3"; shift 3; curl -s -o "$VB_TD/b" -w '%{http_code}' -X "$m" -H "Authorization: Bearer $tk" "$@" "$GW$d"; }
nam="$(sql "SELECT extract(year FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int")"

# --- Văn bản đến ------------------------------------------------------------------------------
vb_goi "$VB_CD" POST "/files/ho-so/${WEB_HS:?}/giay-to/bien_nhan" > /dev/null
curl -s -o "$VB_TD/den.pdf" "$(jq -r .link "$VB_TD/b")"
VB_Q="ten=cv-den.pdf&loai=C%C3%B4ng%20v%C4%83n&ky_hieu=15%2FUBND-VP&ngay_van_ban=2026-10-20&noi_gui=UBND%20huy%E1%BB%87n%20M%E1%BA%ABu"
VB_Q="$VB_Q&trich_yeu=V%E1%BB%81%20vi%E1%BB%87c%20ki%E1%BB%83m%20th%E1%BB%AD%20s%E1%BB%95%20v%C4%83n%20b%E1%BA%A3n"
so_den0="$(sql "SELECT coalesce(max(so), 0) FROM mot_cua.van_ban WHERE chieu = 'den' AND nam = $nam")"
kiem "văn thư vào sổ văn bản đến (PDF có chữ ký số của xã) → 201, số đến kế tiếp, chữ ký hợp lệ" "201 $((so_den0 + 1)) da_vao_so true" \
  "$(vb_goi "$VB_VT" POST "/files/van-ban/den?$VB_Q" -H 'Content-Type: application/pdf' --data-binary @"$VB_TD/den.pdf") $(jq -r '"\(.so) \(.trang_thai) \(.xac_minh_chu_ky.hopLe)"' "$VB_TD/b")"
VB_DEN="$(jq -r '.id // empty' "$VB_TD/b")"
kiem "tải lại văn bản đến từ Garage: đúng SHA-256 tệp đã vào sổ" "200 $(shasum -a 256 "$VB_TD/den.pdf" | cut -d' ' -f1)" \
  "$(vb_goi "$VB_CB" GET "/files/van-ban/$VB_DEN") $(curl -s "$(jq -r .link "$VB_TD/b")" | shasum -a 256 | cut -d' ' -f1)"
# Tệp EICAR (chuỗi thử chuẩn, vô hại) giải mã lúc chạy như smoke-tep.sh, không nằm nguyên văn trong repo.
printf 'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=' \
  | base64 -d > "$VB_TD/eicar.pdf"
kiem "tệp chứa mã độc (EICAR) → 422, không vào sổ" "422 $((so_den0 + 1))" \
  "$(vb_goi "$VB_VT" POST "/files/van-ban/den?$VB_Q" -H 'Content-Type: application/pdf' --data-binary @"$VB_TD/eicar.pdf") $(sql "SELECT coalesce(max(so), 0) FROM mot_cua.van_ban WHERE chieu = 'den' AND nam = $nam")"
kiem "cán bộ vào sổ văn bản đến → 403" "403" \
  "$(vb_goi "$VB_CB" POST "/files/van-ban/den?$VB_Q" -H 'Content-Type: application/pdf' --data-binary @"$VB_TD/den.pdf")"

# --- Văn bản đi ---------------------------------------------------------------------------------
kiem "văn thư soạn dự thảo văn bản đi → 201, chưa có số" "201 du_thao null" \
  "$(vb_goi "$VB_VT" POST /files/van-ban/di -H 'Content-Type: application/json' \
       -d '{"loai": "Thông báo", "trich_yeu": "Về lịch tiếp công dân (smoke #78)", "noi_nhan": "Các thôn; Lưu: VT.", "noi_dung": "UBND xã thông báo lịch tiếp công dân.\nĐề nghị các thôn thông báo rộng rãi."}') $(jq -r '"\(.trang_thai) \(.so)"' "$VB_TD/b")"
VB_DI="$(jq -r '.id // empty' "$VB_TD/b")"
kiem "cán bộ, văn thư ký ban hành → 403" "403 403" \
  "$(vb_goi "$VB_CB" POST "/files/van-ban/$VB_DI/ky" -H 'Content-Type: application/json' -d '{}') $(vb_goi "$VB_VT" POST "/files/van-ban/$VB_DI/ky" -H 'Content-Type: application/json' -d '{}')"
so_di0="$(sql "SELECT coalesce(max(so), 0) FROM mot_cua.van_ban WHERE chieu = 'di' AND nam = $nam")"
kiem "lãnh đạo ký ban hành → 200, số đi kế tiếp, ký hiệu <số>/TB-UBND, đã ký" "200 $((so_di0 + 1))/TB-UBND da_ky" \
  "$(vb_goi "$VB_LD" POST "/files/van-ban/$VB_DI/ky" -H 'Content-Type: application/json' -d '{}') $(jq -r '"\(.ky_hieu) \(.trang_thai)"' "$VB_TD/b")"
curl -s -o "$VB_TD/di.pdf" "$(jq -r .link "$VB_TD/b")"
kiem "PDF văn bản đi: xác minh hợp lệ, đúng văn bản đã phát hành" "200 true van_ban_di $((so_di0 + 1))/TB-UBND" \
  "$(vb_goi "$VB_CB" POST /files/xac-minh -H 'Content-Type: application/pdf' --data-binary @"$VB_TD/di.pdf") $(jq -r '"\(.hopLe) \(.phatHanh.loai) \(.phatHanh.kyHieu)"' "$VB_TD/b")"
kiem "ký lại văn bản đã ký → 409" "409" "$(vb_goi "$VB_LD" POST "/files/van-ban/$VB_DI/ky" -H 'Content-Type: application/json' -d '{}')"
kiem "superuser sửa văn bản đã ký → bị chặn" "có" \
  "$(sql_loi "UPDATE mot_cua.van_ban SET trich_yeu = 'sửa' WHERE id = '$VB_DI'" | grep -q 'không sửa được' && echo có || echo không)"
kiem "kiểm toán van_ban.ky: người ký là lãnh đạo tạm, SHA-256 = PDF tải về" \
  "$(jwt_payload "$VB_LD" | jq -r .sub) $(shasum -a 256 "$VB_TD/di.pdf" | cut -d' ' -f1)" \
  "$(sql "SELECT nguoi_sub || ' ' || (du_lieu ->> 'sha256') FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'van_ban.ky' AND doi_tuong_id = '$VB_DI'")"

# --- Quyền đọc sổ ---------------------------------------------------------------------------------
kiem "đọc sổ /api/van_ban: cán bộ, lãnh đạo, văn thư 200; công dân 403" "200 200 200 403" \
  "$(vb_goi "$VB_CB" GET /api/van_ban) $(vb_goi "$VB_LD" GET /api/van_ban) $(vb_goi "$VB_VT" GET /api/van_ban) $(vb_goi "$VB_CD" GET /api/van_ban)"

xoa_nguoi_dung "$U_VT"
rm -rf "$VB_TD"
