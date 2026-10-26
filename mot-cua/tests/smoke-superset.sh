#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke dashboard Superset (#82), được mot-cua/tests/smoke.sh `source` ở mục 4m, sau smoke-kho-du-lieu.sh (bảng
# mart bao_cao đã có số liệu) và trước khi xóa người dùng tạm (dùng lãnh đạo tạm $U_LD, cán bộ tạm $U_CB,
# mật khẩu $MK, secret OTP $OTP_LD/$OTP_CB, hàm form_action, ma_totp của smoke-can-bo.sh, smoke.sh).
# Chỉ chạy khi Superset đang chạy (make up-bi, profile bi): make up (core) thì in BỎ QUA, không tính.
# Kiểm, mọi lời gọi qua APISIX /bao-cao như trình duyệt:
#   Superset sống, superset-init thoát 0, dashboard "hieu-suat-mot-cua" và 5 chart dựng bằng mã có trong
#   metadata; chưa đăng nhập → chuyển tới trang đăng nhập; /login/keycloak → Keycloak (client
#   bao_cao_superset, PKCE); lãnh đạo đăng nhập SSO (mật khẩu + OTP) → vai "Lãnh đạo xã", xem được
#   dashboard, GET /api/v1/chart/{id}/data/ trả đúng số liệu của bảng mart (số hồ sơ đã đóng, tổng theo
#   thủ tục); cán bộ đăng nhập được nhưng không xem được dashboard hay số liệu.
# Không in mật khẩu, secret OTP hay cookie.

echo "== Dashboard Superset qua APISIX /bao-cao (#82)"
if [ -z "$(docker compose --profile core --profile bi ps -q --status running superset 2>/dev/null)" ]; then
  echo "  BỎ QUA Superset chưa chạy (profile bi: make up-bi rồi make smoke để kiểm mục này)"
  return 0
fi
SS_TD="$(mktemp -d)"
ss_sql() { docker compose exec -T postgres psql -XqtA -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d superset -c "$1"; }

kiem "GET /bao-cao/health qua APISIX → 200 OK" "200 OK" \
  "$(curl -s -o "$SS_TD/b" -w '%{http_code}' "$GW/bao-cao/health") $(cat "$SS_TD/b")"
kiem "superset-init thoát 0" "0" \
  "$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose --profile core --profile bi ps -aq superset-init | head -1)")"
kiem "metadata: dashboard hieu-suat-mot-cua đã xuất bản, 5 chart, chỉ vai Lãnh đạo xã" "true 5 Lãnh đạo xã" \
  "$(ss_sql "SELECT d.published || ' ' || (SELECT count(*) FROM dashboard_slices s WHERE s.dashboard_id = d.id) || ' '
               || (SELECT string_agg(r.name, ',') FROM dashboard_roles dr JOIN ab_role r ON r.id = dr.role_id WHERE dr.dashboard_id = d.id)
             FROM dashboards d WHERE d.slug = 'hieu-suat-mot-cua'")"
kiem "metadata: kết nối báo cáo bằng role bao_cao_doc (không lưu mật khẩu dạng rõ)" "bao_cao_doc có" \
  "$(ss_sql "SELECT substring(sqlalchemy_uri from '//([^:]+):') || ' ' || CASE WHEN sqlalchemy_uri LIKE '%XXXXXXXXXX%' THEN 'có' ELSE 'không' END
             FROM dbs WHERE database_name = 'Báo cáo một cửa'")"
kiem "chưa đăng nhập: mở dashboard → chuyển tới /bao-cao/login/" "302 có" \
  "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$GW/bao-cao/superset/dashboard/hieu-suat-mot-cua/" | sed -E 's#^([0-9]+) .*/bao-cao/login/.*#\1 có#')"
SS_AUTH="$(curl -s -c "$SS_TD/jar-thu" -o /dev/null -w '%{redirect_url}' "$GW/bao-cao/login/keycloak")"
kiem "/bao-cao/login/keycloak → Keycloak, client bao_cao_superset, PKCE S256, quay về /bao-cao/oauth-authorized" "có có có có" \
  "$(for m in "^$KC/realms/dxos/protocol/openid-connect/auth" 'client_id=bao_cao_superset' 'code_challenge_method=S256' \
              "redirect_uri=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$GW/bao-cao/oauth-authorized/keycloak")"; do
       grep -qE -- "$m" <<<"$SS_AUTH" && printf 'có ' || printf 'không '; done | sed 's/ $//')"

# ss_dang_nhap <tên> <username> <secret OTP>: đăng nhập Superset bằng SSO như trình duyệt (cookie riêng
# $SS_TD/jar-<tên>). → in mã HTTP của lần Superset nhận code (302 = đăng nhập xong). Mã OTP bị từ chối
# (trùng mã vừa dùng) thì đợi chu kỳ 30 giây kế tiếp và thử lại một lần.
ss_dang_nhap() {
  local jar="$SS_TD/jar-$1" ve action lan
  ve="$(curl -s -c "$jar" -b "$jar" -o /dev/null -w '%{redirect_url}' "$GW/bao-cao/login/keycloak")"
  curl -s -c "$jar" -b "$jar" -o "$SS_TD/p-$1.html" "${ve:-$KC/khong-co}"
  action="$(form_action "$SS_TD/p-$1.html" kc-form-login)"
  ve="$(curl -s -c "$jar" -b "$jar" -o "$SS_TD/p-$1.html" -w '%{redirect_url}' \
    --data-urlencode "username=$2" --data-urlencode "password=$MK" "${action:-$KC/khong-co}")"
  for lan in 1 2; do
    action="$(form_action "$SS_TD/p-$1.html" kc-otp-login-form)"
    [ -n "$action" ] || break
    ve="$(curl -s -c "$jar" -b "$jar" -o "$SS_TD/p-$1.html" -w '%{redirect_url}' \
      --data-urlencode "otp=$(ma_totp "$3")" "$action")"
    grep -q '[?&]code=' <<<"$ve" && break
    [ "$lan" = 1 ] && sleep $((31 - $(date +%s) % 30))
  done
  grep -q "^$GW/bao-cao/oauth-authorized/keycloak?" <<<"$ve" || { echo "không-về-superset"; return 0; }
  curl -s -c "$jar" -b "$jar" -o /dev/null -w '%{http_code}' "$ve"
}
# ss_api <tên> <đường dẫn sau /bao-cao> → mã HTTP; body ở $SS_TD/b
ss_api() { curl -s -b "$SS_TD/jar-$1" -o "$SS_TD/b" -w '%{http_code}' "$GW/bao-cao$2"; }

kiem "lãnh đạo tạm đăng nhập SSO (mật khẩu + OTP) → Superset nhận code, 302" "302" "$(ss_dang_nhap ld "${U_LD:?}" "${OTP_LD:?}")"
kiem "lãnh đạo: tên đăng nhập theo Keycloak, có vai Lãnh đạo xã" "200 $U_LD true" \
  "$(ss_api ld /api/v1/me/) $(jq -r .result.username "$SS_TD/b" 2>/dev/null) $(ss_api ld /api/v1/me/roles/ > /dev/null; jq -r '.result.roles | has("Lãnh đạo xã")' "$SS_TD/b" 2>/dev/null)"
kiem "lãnh đạo: xem dashboard hieu-suat-mot-cua qua API → 200, 5 chart" "200 5" \
  "$(ss_api ld /api/v1/dashboard/hieu-suat-mot-cua) $(ss_api ld /api/v1/dashboard/hieu-suat-mot-cua/charts > /dev/null; jq '.result | length' "$SS_TD/b" 2>/dev/null)"
kiem "lãnh đạo: trang dashboard → 200 HTML" "200" "$(ss_api ld /superset/dashboard/hieu-suat-mot-cua/)"

SS_C1="$(ss_sql "SELECT id FROM slices WHERE slice_name = 'Hồ sơ đã đóng'")"
SS_C2="$(ss_sql "SELECT id FROM slices WHERE slice_name = 'Thời gian giải quyết theo thủ tục và tháng'")"
SS_C3="$(ss_sql "SELECT id FROM slices WHERE slice_name = 'Tỷ lệ trễ hạn'")"
kiem "chart 'Hồ sơ đã đóng' → số hồ sơ = bao_cao.fct_ho_so" "200 $(sql "SELECT count(*) FROM bao_cao.fct_ho_so")" \
  "$(ss_api ld "/api/v1/chart/$SS_C1/data/") $(jq -r '.result[0].data[0].so_ho_so' "$SS_TD/b" 2>/dev/null)"
kiem "chart 'Tỷ lệ trễ hạn' → khớp bao_cao.fct_ho_so (4 chữ số)" "200 $(sql "SELECT trim_scale(round(avg(CASE WHEN tre_han THEN 1.0 ELSE 0 END), 4)) FROM bao_cao.fct_ho_so")" \
  "$(ss_api ld "/api/v1/chart/$SS_C3/data/") $(jq -r '.result[0].data[0].ty_le_tre_han * 10000 | round / 10000' "$SS_TD/b" 2>/dev/null)"
kiem "chart 'Thời gian giải quyết…': tổng số hồ sơ theo thủ tục × tháng = mart hieu_suat_thang" \
  "200 $(sql "SELECT coalesce(sum(so_ho_so), 0) FROM bao_cao.hieu_suat_thang")" \
  "$(ss_api ld "/api/v1/chart/$SS_C2/data/") $(jq '[.result[0].data[].so_ho_so] | add' "$SS_TD/b" 2>/dev/null)"

kiem "cán bộ tạm đăng nhập SSO được (mật khẩu + OTP)" "302" "$(ss_dang_nhap cb "${U_CB:?}" "${OTP_CB:?}")"
kiem "cán bộ: không có vai Lãnh đạo xã, không xem được dashboard và số liệu" "false 403 403" \
  "$(ss_api cb /api/v1/me/roles/ > /dev/null; jq -r '.result.roles | has("Lãnh đạo xã")' "$SS_TD/b" 2>/dev/null) $(ss_api cb /api/v1/dashboard/hieu-suat-mot-cua) $(ss_api cb "/api/v1/chart/$SS_C1/data/")"
rm -rf "$SS_TD"
