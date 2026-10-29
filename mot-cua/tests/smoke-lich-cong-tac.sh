#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke lịch công tác (#117), được mot-cua/tests/smoke.sh `source` ở mục 4s, trước khi xóa người dùng tạm (dùng cán bộ
# tạm $U_CB/$OTP_CB, lãnh đạo tạm $U_LD/$OTP_LD, mật khẩu $MK, hàm tao_nguoi_dung_otp, xoa_nguoi_dung, lay_token của
# smoke.sh, kt_token_otp của smoke-kiem-toan.sh). Tạo một văn thư tạm rồi xóa. Mọi lời gọi qua APISIX (/api → PostgREST).
# Kiểm:
#   - quyền: không token, công dân bị chặn; cán bộ không ghi; văn thư không tự duyệt, không sửa lịch đã duyệt;
#   - cán bộ chỉ thấy lịch đã duyệt; lãnh đạo duyệt → CSDL ghi người duyệt;
#   - Poka-yoke: trùng địa điểm + chồng giờ → 400 mã 23P01 kèm câu tiếng Việt; lịch đã hủy không còn giữ chỗ;
#   - hủy phải có lý do, lịch đã hủy không sửa được, không xóa được;
#   - nhật ký kiểm toán lich.* đủ, không chứa tiêu đề; chuỗi kiểm toán hợp lệ.
# Lịch thử đặt năm 2031 ở địa điểm có dấu ngẫu nhiên nên chạy lại không đụng nhau; lịch không xóa được nên để lại
# ở trạng thái đã hủy. Không in mật khẩu, secret OTP hay token.

echo "== Lịch công tác (#117)"
LC_TD="$(mktemp -d)"
U_LV="smoke-lv-$(openssl rand -hex 4)"; OTP_LV="$(openssl rand -hex 10)"
tao_nguoi_dung_otp "$U_LV" /van-thu "$MK" "$OTP_LV"
LC_VT="$(kt_token_otp "$U_LV" "$OTP_LV")"
LC_LD="$(kt_token_otp "${U_LD:?}" "${OTP_LD:?}")"
LC_CB="$(kt_token_otp "${U_CB:?}" "${OTP_CB:?}")"
LC_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
kiem "token văn thư tạm, lãnh đạo, cán bộ, công dân" "có có có có" \
  "$(for t in "$LC_VT" "$LC_LD" "$LC_CB" "$LC_CD"; do [ -n "$t" ] && echo có || echo không; done | tr '\n' ' ' | sed 's/ $//')"
# lc <token> <METHOD> <đường dẫn sau /api/lich_cong_tac> [JSON] → mã HTTP; body ở $LC_TD/b
lc() {
  local tk="$1" m="$2" d="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -o "$LC_TD/b" -w '%{http_code}' -X "$m" -H "Authorization: Bearer $tk" -H 'Content-Type: application/json' \
      -H 'Prefer: return=representation' -d "$body" "$GW/api/lich_cong_tac$d"
  else
    curl -s -o "$LC_TD/b" -w '%{http_code}' -X "$m" -H "Authorization: Bearer $tk" "$GW/api/lich_cong_tac$d"
  fi
}
M="ZQ$(openssl rand -hex 3)"
NOI="Phòng thử $M"
# LICH <tiêu đề> <giờ bắt đầu> <giờ kết thúc> [trạng thái] → JSON lịch ngày 03/03/2031 ở $NOI
LICH() {
  jq -nc --arg t "$1 $M" --arg bd "2031-03-03T$2:00+07:00" --arg kt "2031-03-03T$3:00+07:00" --arg n "$NOI" \
    --arg tt "${4:-du_kien}" '{tieu_de: $t, loai: "hop", bat_dau: $bd, ket_thuc: $kt, dia_diem: $n, trang_thai: $tt}'
}

# --- Quyền -----------------------------------------------------------------------------------------------
kiem "đọc lịch: không token → 401 ở gateway; công dân → 403" "401 403" \
  "$(ma_http "$GW/api/lich_cong_tac") $(lc "$LC_CD" GET '')"
kiem "cán bộ thêm lịch → 403" "403" "$(lc "$LC_CB" POST '' "$(LICH 'Cán bộ thêm' 08:00 09:00)")"
kiem "văn thư thêm lịch đã duyệt → 403 (không tự duyệt)" "403" \
  "$(lc "$LC_VT" POST '' "$(LICH 'Văn thư tự duyệt' 08:00 09:00 da_duyet)")"
kiem "văn thư thêm lịch dự kiến → 201, người tạo là văn thư tạm" "201 du_kien $(jwt_payload "$LC_VT" | jq -r .sub)" \
  "$(lc "$LC_VT" POST '' "$(LICH 'Họp giao ban' 08:00 10:00)") $(jq -r '.[0] | "\(.trang_thai) \(.nguoi_tao_sub)"' "$LC_TD/b")"
ID1="$(jq -r '.[0].id // empty' "$LC_TD/b")"
kiem "kết thúc trước bắt đầu → 400" "400" "$(lc "$LC_VT" POST '' "$(LICH 'Ngược giờ' 10:00 09:00)")"

# --- Poka-yoke trùng địa điểm ---------------------------------------------------------------------------
kiem "trùng địa điểm (khác hoa thường) và chồng giờ → 400 (23P01), câu tiếng Việt nêu giờ đã có lịch" \
  "400 23P01 true" \
  "$(lc "$LC_LD" POST '' "$(LICH 'Họp trùng' 09:00 11:00 | jq -c --arg n "phòng THỬ $M" '.dia_diem = $n')") $(jq -r '"\(.code) \(.message | startswith("Trùng địa điểm") and contains("08:00 03/03/2031"))"' "$LC_TD/b")"
kiem "cùng địa điểm, nối tiếp ngay sau → 201" "201" "$(lc "$LC_VT" POST '' "$(LICH 'Họp nối tiếp' 10:00 11:00)")"
ID2="$(jq -r '.[0].id // empty' "$LC_TD/b")"

# --- Duyệt, ai thấy gì ----------------------------------------------------------------------------------------
kiem "cán bộ chưa thấy lịch dự kiến" "200 0" "$(lc "$LC_CB" GET "?id=eq.$ID1") $(jq length "$LC_TD/b")"
kiem "văn thư duyệt → 403" "403" "$(lc "$LC_VT" PATCH "?id=eq.$ID1" '{"trang_thai":"da_duyet"}')"
kiem "lãnh đạo duyệt → 200, CSDL ghi người duyệt là lãnh đạo" "200 da_duyet $(jwt_payload "$LC_LD" | jq -r .sub)" \
  "$(lc "$LC_LD" PATCH "?id=eq.$ID1" '{"trang_thai":"da_duyet"}') $(jq -r '.[0] | "\(.trang_thai) \(.nguoi_duyet_sub)"' "$LC_TD/b")"
kiem "cán bộ thấy lịch đã duyệt trong tuần (lọc như cổng cán bộ)" "200 1" \
  "$(lc "$LC_CB" GET "?bat_dau=lt.2031-03-10T00:00:00%2B07:00&ket_thuc=gt.2031-03-03T00:00:00%2B07:00&dia_diem=eq.$(jq -rn --arg n "$NOI" '$n|@uri')") $(jq length "$LC_TD/b")"
kiem "văn thư sửa lịch đã duyệt → không dòng nào đổi" "200 0" \
  "$(lc "$LC_VT" PATCH "?id=eq.$ID1" '{"tieu_de":"Văn thư sửa"}') $(jq length "$LC_TD/b")"
kiem "cán bộ sửa lịch → 403" "403" "$(lc "$LC_CB" PATCH "?id=eq.$ID1" '{"tieu_de":"Cán bộ sửa"}')"

# --- Hủy -------------------------------------------------------------------------------------------------------
kiem "hủy không lý do → 400" "400" "$(lc "$LC_LD" PATCH "?id=eq.$ID1" '{"trang_thai":"da_huy"}')"
kiem "lãnh đạo hủy lịch đã duyệt có lý do → 200" "200 da_huy" \
  "$(lc "$LC_LD" PATCH "?id=eq.$ID1" "{\"trang_thai\":\"da_huy\",\"ly_do_huy\":\"Lùi lịch $M\"}") $(jq -r '.[0].trang_thai' "$LC_TD/b")"
kiem "lịch đã hủy không sửa được → 400" "400" "$(lc "$LC_LD" PATCH "?id=eq.$ID1" '{"tieu_de":"Sửa sau hủy"}')"
kiem "cán bộ vẫn thấy lịch đã duyệt rồi hủy, kèm lý do" "da_huy true" \
  "$(lc "$LC_CB" GET "?id=eq.$ID1" > /dev/null; jq -r '.[0] | "\(.trang_thai) \(.ly_do_huy | startswith("Lùi lịch"))"' "$LC_TD/b")"
kiem "lịch đã hủy không còn giữ chỗ: đặt lại giờ cũ → 201" "201" "$(lc "$LC_VT" POST '' "$(LICH 'Đặt lại' 08:00 10:00)")"
ID3="$(jq -r '.[0].id // empty' "$LC_TD/b")"
kiem "lãnh đạo xóa lịch → 403" "403" "$(lc "$LC_LD" DELETE "?id=eq.$ID2")"
kiem "văn thư hủy lịch dự kiến có lý do → 200" "200" \
  "$(lc "$LC_VT" PATCH "?id=eq.$ID3" '{"trang_thai":"da_huy","ly_do_huy":"Dọn lịch thử"}')"
lc "$LC_VT" PATCH "?id=eq.$ID2" '{"trang_thai":"da_huy","ly_do_huy":"Dọn lịch thử"}' > /dev/null

# --- Kiểm toán ----------------------------------------------------------------------------------------------------
kiem "nhật ký kiểm toán lịch thứ nhất: thêm, duyệt, hủy (qua API)" "lich.them:api lich.duyet:api lich.huy:api" \
  "$(sql "SELECT string_agg(hanh_dong || ':' || nguon, ' ' ORDER BY stt) FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong = 'lich_cong_tac' AND doi_tuong_id = '$ID1'")"
kiem "nhật ký không chứa tiêu đề, địa điểm hay lý do hủy" "0" \
  "$(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong = 'lich_cong_tac' AND du_lieu::text LIKE '%$M%'")"
kiem "chuỗi kiểm toán vẫn hợp lệ" "true" "$(sql "SELECT mot_cua.xac_minh_kiem_toan() ->> 'hopLe'")"
kiem "trang /can-bo/lich (SPA) → 200" "200" "$(ma_http "$GW/can-bo/lich")"

xoa_nguoi_dung "$U_LV"
rm -rf "$LC_TD"
