#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke wiki văn bản nội bộ cho cán bộ (#95), được mot-cua/tests/smoke.sh `source` ở mục 4r, trước khi xóa người dùng
# tạm (dùng cán bộ tạm $U_CB/$OTP_CB phụ trách lĩnh vực $LV_ID với id $CB_ID, lãnh đạo tạm $U_LD/$OTP_LD, mật khẩu $MK,
# hàm tao_nguoi_dung_otp, xoa_nguoi_dung, lay_token của smoke.sh, kt_token_otp của smoke-kiem-toan.sh). Tạo một văn
# thư tạm rồi xóa. Mọi lời gọi qua APISIX. Kiểm:
#   - chỉ mục Meilisearch mot-cua-wiki-van-ban được mot-cua-api dựng từ CSDL lúc khởi động (đủ số văn bản);
#   - quyền: công dân, không token bị chặn ở /files/wiki và /api; cán bộ không ghi; văn thư không ghi phạm vi lãnh đạo;
#   - tìm theo phạm vi: cán bộ thấy toàn xã + lĩnh vực phụ trách, văn thư thấy trừ phạm vi lãnh đạo, lãnh đạo thấy hết;
#     phân công thêm lĩnh vực → thấy ngay; tìm không dấu, đánh dấu đoạn khớp;
#   - sửa → phiên bản 2, chỉ mục cập nhật ngay, lịch sử đọc được qua /api; ngừng hiệu lực → ẩn trừ khi xem cả hết hiệu lực;
#   - chỉ mục cũ hơn CSDL (đổi phạm vi bằng superuser) → mot-cua-api vẫn bỏ kết quả mà RLS không cho xem;
#   - Meilisearch dừng → vẫn tìm được trong CSDL (nguon csdl) đúng phạm vi; chạy lại → về Meilisearch;
#   - nhật ký kiểm toán wiki.* đủ, không chứa tiêu đề/nội dung; chuỗi kiểm toán hợp lệ.
# Không in mật khẩu, secret OTP hay token.

echo "== Wiki văn bản nội bộ cho cán bộ (#95)"
WK_TD="$(mktemp -d)"
U_WV="smoke-wv-$(openssl rand -hex 4)"; OTP_WV="$(openssl rand -hex 10)"
tao_nguoi_dung_otp "$U_WV" /van-thu "$MK" "$OTP_WV"
WK_VT="$(kt_token_otp "$U_WV" "$OTP_WV")"
WK_LD="$(kt_token_otp "${U_LD:?}" "${OTP_LD:?}")"
WK_CB="$(kt_token_otp "${U_CB:?}" "${OTP_CB:?}")"
WK_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
kiem "token văn thư tạm, lãnh đạo, cán bộ, công dân" "có có có có" \
  "$(for t in "$WK_VT" "$WK_LD" "$WK_CB" "$WK_CD"; do [ -n "$t" ] && echo có || echo không; done | tr '\n' ' ' | sed 's/ $//')"
# wk <token> <METHOD> <đường dẫn> [tham số curl…] → mã HTTP; body ở $WK_TD/b
wk() { local tk="$1" m="$2" d="$3"; shift 3; curl -s -o "$WK_TD/b" -w '%{http_code}' -X "$m" -H "Authorization: Bearer $tk" "$@" "$GW$d"; }
wk_ghi() { wk "$1" POST "$2" -H 'Content-Type: application/json' -d "$3"; }
# tim <token> <query string> → "<pham_vi đã sắp, nối bằng dấu phẩy> <nguon>" của kết quả có dấu $M trong tiêu đề
tim() {
  wk "$1" GET "/files/wiki/tim?$2" > /dev/null
  jq -r --arg m "$M" '"\([.ket_qua[] | select(.tieu_de | contains($m)) | .pham_vi] | sort | join(",")) \(.nguon)"' "$WK_TD/b"
}
# meili_wiki → "<index> <số tài liệu>" bằng khóa Tầng 2, đọc trong container mot-cua-api (khóa không ra ngoài).
meili_wiki() {
  gioi_han 60 docker compose exec -T mot-cua-api python - <<'PY' 2>/dev/null
import sys
sys.path.insert(0, "/mot-cua/backend")
import tri_thuc, wiki
m = tri_thuc.Meili(wiki.TEN_INDEX)
c = m.cfg()
st, ds = tri_thuc.goi("GET", f"{c['url']}/indexes/{c['index']}/documents?fields=id&limit=1", None, c["h"])
print(c["index"], ds.get("total") if st == 200 else f"HTTP{st}")
PY
}
M="ZQ$(openssl rand -hex 3)"
# Từ chỉ có trong bản sửa: khác hẳn $M để Meilisearch (chịu lỗi chính tả) không khớp nhầm văn bản khác.
TU_MOI="xuong$(openssl rand -hex 4 | tr '0-9' 'g-p')"
LV_KHAC="$(sql "SELECT id FROM mot_cua.linh_vuc WHERE id <> '${LV_ID:?}' ORDER BY ma LIMIT 1")"

# --- Chỉ mục dựng từ CSDL lúc khởi động -------------------------------------------------------------
SO_VB="$(sql "SELECT count(*) FROM mot_cua.wiki_van_ban")"
for _ in $(seq 1 45); do [ "$(meili_wiki)" = "mot-cua-wiki-van-ban $SO_VB" ] && break; sleep 2; done
kiem "chỉ mục mot-cua-wiki-van-ban có đủ $SO_VB văn bản của CSDL (mot-cua-api đồng bộ khi khởi động)" \
  "mot-cua-wiki-van-ban $SO_VB" "$(meili_wiki)"

# --- Quyền ---------------------------------------------------------------------------------------------
kiem "tìm wiki: không token → 401 ở gateway; công dân → 403" "401 403" \
  "$(ma_http "$GW/files/wiki/tim?q=a") $(wk "$WK_CD" GET '/files/wiki/tim?q=a')"
kiem "đọc /api/wiki_van_ban: công dân → 403; không token → 401" "403 401" \
  "$(wk "$WK_CD" GET /api/wiki_van_ban) $(ma_http "$GW/api/wiki_van_ban")"
VB_JSON() { jq -nc --arg t "$1" --arg p "$2" --arg lv "${3:-}" --arg nd "$4" \
  '{tieu_de: $t, loai: "huong_dan", noi_dung: $nd, pham_vi: $p} + (if $lv == "" then {} else {linh_vuc_id: $lv} end)'; }
kiem "cán bộ thêm văn bản → 403" "403" \
  "$(wk_ghi "$WK_CB" /files/wiki "$(VB_JSON "Cán bộ thêm $M" toan_xa "" "x")")"
kiem "văn thư thêm văn bản phạm vi lãnh đạo → 403 (RLS)" "403" \
  "$(wk_ghi "$WK_VT" /files/wiki "$(VB_JSON "Văn thư lãnh đạo $M" lanh_dao "" "x")")"
kiem "văn thư thêm văn bản toàn xã → 201, phiên bản 1" "201 1 toan_xa" \
  "$(wk_ghi "$WK_VT" /files/wiki "$(VB_JSON "Quyển sổ tay tiếp công dân $M" toan_xa "" "Chào hỏi, ghi biên nhận cho công dân.")") $(jq -r '"\(.phien_ban) \(.pham_vi)"' "$WK_TD/b")"
ID_XA="$(jq -r '.id // empty' "$WK_TD/b")"
kiem "văn thư thêm văn bản lĩnh vực của cán bộ tạm và lĩnh vực khác → 201 201" "201 201" \
  "$(wk_ghi "$WK_VT" /files/wiki "$(VB_JSON "Hướng dẫn lĩnh vực cán bộ $M" linh_vuc "$LV_ID" "Hướng dẫn nghiệp vụ.")") $(jq -r .id "$WK_TD/b" > "$WK_TD/id-lv"; wk_ghi "$WK_VT" /files/wiki "$(VB_JSON "Hướng dẫn lĩnh vực khác $M" linh_vuc "$LV_KHAC" "Hướng dẫn nghiệp vụ khác.")")"
ID_LV="$(cat "$WK_TD/id-lv")"
kiem "lãnh đạo thêm văn bản phạm vi lãnh đạo → 201" "201" \
  "$(wk_ghi "$WK_LD" /files/wiki "$(VB_JSON "Ghi chú họp lãnh đạo $M" lanh_dao "" "Nội dung họp.")")"
kiem "văn thư thêm thiếu lĩnh vực cho phạm vi lĩnh vực → 400" "400" \
  "$(wk_ghi "$WK_VT" /files/wiki "$(VB_JSON "Thiếu lĩnh vực $M" linh_vuc "" "x")")"

# --- Tìm theo phạm vi -----------------------------------------------------------------------------------
kiem "cán bộ tìm $M → toàn xã + lĩnh vực phụ trách (Meilisearch)" "linh_vuc,toan_xa meilisearch" "$(tim "$WK_CB" "q=$M")"
kiem "văn thư tìm $M → mọi phạm vi trừ lãnh đạo" "linh_vuc,linh_vuc,toan_xa meilisearch" "$(tim "$WK_VT" "q=$M")"
kiem "lãnh đạo tìm $M → tất cả" "lanh_dao,linh_vuc,linh_vuc,toan_xa meilisearch" "$(tim "$WK_LD" "q=$M")"
sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('${CB_ID:?}', '$LV_KHAC') ON CONFLICT DO NOTHING" > /dev/null
kiem "phân công cán bộ thêm lĩnh vực khác → thấy ngay văn bản lĩnh vực đó" "linh_vuc,linh_vuc,toan_xa meilisearch" "$(tim "$WK_CB" "q=$M")"
sql "DELETE FROM mot_cua.can_bo_linh_vuc WHERE can_bo_id = '$CB_ID' AND linh_vuc_id = '$LV_KHAC'" > /dev/null
wk "$WK_CB" GET "/files/wiki/tim?q=quyen+so+tay+tiep+cong+dan+$M" > /dev/null
kiem "tìm không dấu 'quyen so tay tiep cong dan' → kết quả đầu là văn bản vừa thêm, tiêu đề có đánh dấu" "$ID_XA có" \
  "$(jq -r '.ket_qua[0].id' "$WK_TD/b") $(jq -r '.ket_qua[0].tieu_de_danh_dau' "$WK_TD/b" | grep -q $'\xee\x80\x80' && echo có || echo không)"
kiem "loại không hợp lệ → 400" "400" "$(wk "$WK_CB" GET '/files/wiki/tim?loai=khong_co')"

# --- Sửa, lịch sử, ngừng hiệu lực ------------------------------------------------------------------------
kiem "văn thư sửa nội dung → 200, phiên bản 2" "200 2" \
  "$(wk_ghi "$WK_VT" "/files/wiki/$ID_XA" '{"noi_dung": "Chào hỏi, ghi biên nhận; bổ sung giờ làm việc buổi chiều '"$TU_MOI"'."}') $(jq -r .phien_ban "$WK_TD/b")"
kiem "chỉ mục cập nhật ngay: tìm từ mới thấy đúng văn bản vừa sửa" "$ID_XA" \
  "$(wk "$WK_CB" GET "/files/wiki/tim?q=$TU_MOI" > /dev/null; jq -r '[.ket_qua[].id] | join(",")' "$WK_TD/b")"
kiem "cán bộ đọc lịch sử qua /api → 1 phiên bản cũ (phiên bản 1)" "1" \
  "$(wk "$WK_CB" GET "/api/wiki_van_ban_lich_su?van_ban_id=eq.$ID_XA&select=phien_ban" > /dev/null; jq -r '[.[].phien_ban] | join(",")' "$WK_TD/b")"
kiem "cán bộ sửa văn bản → 403" "403" "$(wk_ghi "$WK_CB" "/files/wiki/$ID_XA" '{"noi_dung": "x"}')"
kiem "văn thư ngừng hiệu lực văn bản lĩnh vực → 200 het_hieu_luc" "200 het_hieu_luc" \
  "$(wk_ghi "$WK_VT" "/files/wiki/$ID_LV" '{"trang_thai": "het_hieu_luc"}') $(jq -r .trang_thai "$WK_TD/b")"
kiem "cán bộ tìm: văn bản hết hiệu lực ẩn, hiện khi xem cả hết hiệu lực" "toan_xa meilisearch|linh_vuc,toan_xa meilisearch" \
  "$(tim "$WK_CB" "q=$M")|$(tim "$WK_CB" "q=$M&tat_ca=1")"

# --- Chỉ mục cũ hơn CSDL: mot-cua-api đối chiếu RLS ---------------------------------------------------------
sql "SET request.jwt.claims = '{\"sub\": \"smoke-superuser\"}'; UPDATE mot_cua.wiki_van_ban SET pham_vi = 'lanh_dao' WHERE id = '$ID_XA'" > /dev/null
kiem "đổi phạm vi thẳng trong CSDL (chỉ mục chưa biết) → cán bộ không còn thấy văn bản đó" " meilisearch" "$(tim "$WK_CB" "q=$M")"

# --- Meilisearch dừng: tìm dự phòng trong CSDL ---------------------------------------------------------------
gioi_han 60 docker compose stop meilisearch > /dev/null 2>&1
kiem "Meilisearch dừng: lãnh đạo, văn thư vẫn tìm được trong CSDL theo đúng phạm vi" \
  "lanh_dao,lanh_dao,linh_vuc csdl|linh_vuc csdl" "$(tim "$WK_LD" "q=$M")|$(tim "$WK_VT" "q=$M")"
kiem "Meilisearch dừng: thêm văn bản vẫn lưu (201)" "201" \
  "$(wk_ghi "$WK_VT" /files/wiki "$(VB_JSON "Lúc chỉ mục dừng $M" toan_xa "" "Nội dung.")")"
gioi_han 120 docker compose start meilisearch > /dev/null 2>&1
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q meilisearch)" 2>/dev/null)" = healthy ] && break
  sleep 2
done
kiem "Meilisearch chạy lại → tìm lại bằng Meilisearch" "meilisearch" \
  "$(wk "$WK_LD" GET "/files/wiki/tim?q=$M" > /dev/null; jq -r .nguon "$WK_TD/b")"

# --- Kiểm toán ------------------------------------------------------------------------------------------------
IDS="$(sql "SELECT string_agg(quote_literal(id::text), ',') FROM mot_cua.wiki_van_ban WHERE tieu_de LIKE '%$M%'")"
kiem "nhật ký kiểm toán: 5 lần thêm, 1 sửa, 1 ngừng hiệu lực (qua API) + 1 sửa của superuser" \
  "wiki.ngung_hieu_luc:1 wiki.sua:2 wiki.them:5" \
  "$(sql "SELECT string_agg(hanh_dong || ':' || n, ' ' ORDER BY hanh_dong) FROM (SELECT hanh_dong, count(*) n FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong = 'wiki_van_ban' AND doi_tuong_id IN ($IDS) GROUP BY hanh_dong) x")"
kiem "nhật ký: người sửa là văn thư tạm, có SHA-256 nội dung, không chứa tiêu đề/nội dung" \
  "$(jwt_payload "$WK_VT" | jq -r .sub) 64 0" \
  "$(sql "SELECT nguoi_sub || ' ' || length(du_lieu ->> 'sha256NoiDung') FROM mot_cua.nhat_ky_kiem_toan WHERE hanh_dong = 'wiki.sua' AND doi_tuong_id = '$ID_XA' AND nguon = 'api'") $(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong = 'wiki_van_ban' AND du_lieu::text LIKE '%$M%'")"
kiem "chuỗi kiểm toán vẫn hợp lệ" "true" "$(sql "SELECT mot_cua.xac_minh_kiem_toan() ->> 'hopLe'")"
kiem "trang /can-bo/wiki (SPA) → 200" "200" "$(ma_http "$GW/can-bo/wiki")"

xoa_nguoi_dung "$U_WV"
rm -rf "$WK_TD"
