#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke tra cứu tiến độ hồ sơ (#54), được mot-cua/tests/smoke.sh `source` ở mục 4o, sau smoke-can-bo.sh
# (hồ sơ KS01 $WEB_HS của congdan01 đã đi hết nộp → bổ sung → thẩm định → phê duyệt → hoàn tất, số điện
# thoại sửa thành 0900000073 lúc bổ sung). Mật khẩu $MK, hàm lay_token, dat_mat_khau của smoke.sh.
# Mọi lời gọi qua APISIX như trình duyệt:
#   trang /tra-cuu, /ho-so, /ho-so/{id} tải lại → 200 (route SPA);
#   không đăng nhập: GET /public/rpc/tra_cuu_ho_so mã + 4 số cuối → hoàn tất, đủ các mốc theo thứ tự, không
#   có họ tên, số điện thoại, lý do; sai số, mã không có → null như nhau; header Authorization giả bị bỏ;
#   đăng nhập: congdan01 thấy hồ sơ trong danh sách (chỉ hồ sơ của mình), mốc kèm lý do bổ sung, tiến độ
#   Flowable, tải biên nhận và thông báo kết quả; congdan02 không thấy hồ sơ, lịch sử, tiến độ của congdan01.
# Không in mật khẩu hay token.

echo "== Tra cứu tiến độ hồ sơ (#54)"
TC_TD="$(mktemp -d)"
# tc_giay_to <token> <loại> → "ok" khi trả bản đã có (200) hoặc vừa phát hành (201)
tc_giay_to() {
  local m
  m="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $1" "$GW/files/ho-so/$WEB_HS/giay-to/$2")"
  if [ "$m" = 200 ] || [ "$m" = 201 ]; then echo ok; else echo "$m"; fi
}
# tc_goi [token] <đường dẫn> → mã HTTP; body ở $TC_TD/b
tc_goi() {
  if [ $# -eq 2 ]; then
    curl -s -o "$TC_TD/b" -w '%{http_code}' -H 'Accept: application/json' -H "Authorization: Bearer $1" "$GW$2"
  else
    curl -s -o "$TC_TD/b" -w '%{http_code}' -H 'Accept: application/json' "$GW$1"
  fi
}

for tc_r in /tra-cuu /ho-so "/ho-so/${WEB_HS:-00000000-0000-0000-0000-000000000000}"; do
  kiem "route SPA $tc_r tải lại → 200 index.html" "200 có" \
    "$(tc_goi "$tc_r") $(grep -q '<div id="root">' "$TC_TD/b" && echo có || echo không)"
done

if [ -n "${WEB_HS:-}" ]; then
  TC_MA="$(sql "SELECT ma_ho_so FROM mot_cua.ho_so WHERE id = '$WEB_HS'")"
  TC_TT="$(sql "SELECT trang_thai FROM mot_cua.ho_so WHERE id = '$WEB_HS'")"
  TC_MOC="$(sql "SELECT string_agg(den_trang_thai, ',' ORDER BY id) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = '$WEB_HS'")"
  kiem "không đăng nhập: mã + 4 số cuối → 200, trạng thái và các mốc khớp CSDL" "200 $TC_TT $TC_MOC KS01" \
    "$(tc_goi "/public/rpc/tra_cuu_ho_so?p_ma=$TC_MA&p_so_cuoi=0073") $(jq -r '"\(.trang_thai) \([.lich_su[].trang_thai] | join(",")) \(.thu_tuc.ma)"' "$TC_TD/b" 2>/dev/null)"
  kiem "kết quả công khai không có họ tên, số điện thoại, lý do, sub người nộp" "không" \
    "$(grep -Eq 'Thử Web|0900000073|giấy chứng sinh|ho_ten|so_dien_thoai|ly_do|nguoi_nop' "$TC_TD/b" && echo có || echo không)"
  kiem "mã viết thường vẫn khớp; sai 4 số và mã không có → null như nhau" "$TC_TT null null" \
    "$(tc_goi "/public/rpc/tra_cuu_ho_so?p_ma=$(tr '[:upper:]' '[:lower:]' <<<"$TC_MA")&p_so_cuoi=0073" > /dev/null; jq -r '.trang_thai' "$TC_TD/b") $(tc_goi "/public/rpc/tra_cuu_ho_so?p_ma=$TC_MA&p_so_cuoi=1111" > /dev/null; cat "$TC_TD/b") $(tc_goi "/public/rpc/tra_cuu_ho_so?p_ma=HS20000101-999999&p_so_cuoi=0073" > /dev/null; cat "$TC_TD/b")"
  kiem "/public bỏ header Authorization (token giả không làm lỗi): vẫn 200 như anon" "200 $TC_TT" \
    "$(tc_goi "token-gia" "/public/rpc/tra_cuu_ho_so?p_ma=$TC_MA&p_so_cuoi=0073") $(jq -r '.trang_thai' "$TC_TD/b" 2>/dev/null)"

  TC_CD1="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
  TC_CD2="$(lay_token congdan02 "$MK" | jq -r '.access_token // empty')"
  [ -n "$TC_CD2" ] || { dat_mat_khau congdan02 "$MK"; TC_CD2="$(lay_token congdan02 "$MK" | jq -r '.access_token // empty')"; }
  TC_SUB1="$(jwt_payload "$TC_CD1" | jq -r .sub)"
  kiem "congdan01: danh sách có hồ sơ, chỉ hồ sơ của mình, mới nhất trước" "200 true true" \
    "$(tc_goi "$TC_CD1" "/api/ho_so?select=id,ma_ho_so,trang_thai,ngay_nhan,han_xu_ly,ngay_hoan_tat,ly_do,nguoi_nop_sub,thu_tuc:thu_tuc_id(id,ma,ten,so_ngay_xu_ly,json_schema)&order=ngay_nhan.desc") $(jq --arg h "$WEB_HS" --arg s "$TC_SUB1" '(map(.id) | index($h) != null), all(.[]; .nguoi_nop_sub == $s)' "$TC_TD/b" | paste -sd' ' -)"
  kiem "congdan01: mốc trạng thái kèm lý do bổ sung (chỉ khi đăng nhập)" "200 $TC_MOC Thiếu bản sao giấy chứng sinh (smoke #73)" \
    "$(tc_goi "$TC_CD1" "/api/lich_su_trang_thai?ho_so_id=eq.$WEB_HS&select=den_trang_thai,ly_do,luc&order=id") $(jq -r '([.[].den_trang_thai] | join(",")) + " " + ([.[].ly_do | select(.)] | first // "")' "$TC_TD/b")"
  kiem "congdan01: tiến độ Flowable của hồ sơ đã kết thúc, không còn bước mở" "200 true 0" \
    "$(tc_goi "$TC_CD1" "/workflow/ho-so/$WEB_HS/tien-do") $(jq -r '"\(.quyTrinh[0].ketThuc != null) \([.quyTrinh[].buocDangMo[]] | length)"' "$TC_TD/b" 2>/dev/null)"
  kiem "congdan01: tải biên nhận, thông báo kết quả có ký số" "ok ok" \
    "$(tc_giay_to "$TC_CD1" bien_nhan) $(tc_giay_to "$TC_CD1" ket_qua)"
  kiem "congdan02: không thấy hồ sơ, lịch sử của congdan01 (RLS), tiến độ → 404" "0 0 404" \
    "$(tc_goi "$TC_CD2" "/api/ho_so?id=eq.$WEB_HS&select=id" > /dev/null; jq length "$TC_TD/b") $(tc_goi "$TC_CD2" "/api/lich_su_trang_thai?ho_so_id=eq.$WEB_HS" > /dev/null; jq length "$TC_TD/b") $(tc_goi "$TC_CD2" "/workflow/ho-so/$WEB_HS/tien-do")"
else
  kiem "có hồ sơ \$WEB_HS từ smoke-web.sh để tra cứu" "có" "không"
fi
rm -rf "$TC_TD"
