#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Smoke của ứng dụng mot-cua. Được scripts/smoke.sh `source` (dùng hàm trong
# scripts/lib-smoke.sh: kiem, ma_http, sql, sql_loi, kc, lay_token…), không chạy riêng.
# Kiểm:
#   1. Route công khai (role anon): danh mục thủ tục, JSON Schema; không thấy hồ sơ.
#   2. Test SQL/RLS apps/mot-cua/db/tests/rls.sql (mỗi dòng ĐẠT/TRƯỢT là một kiểm tra).
#   3. MFA: cán bộ, lãnh đạo bị bắt cài OTP; công dân thì không.
#   4. Qua APISIX → PostgREST với token thật của từng vai trò: cong_dan (mật khẩu),
#      can_bo và lanh_dao (mật khẩu + mã TOTP). Cán bộ, lãnh đạo dùng người dùng TẠM có
#      OTP tạo riêng cho smoke rồi xóa, không đụng người dùng mẫu.
# Không phụ thuộc dữ liệu seed: số liệu mong đợi lấy từ CSDL bằng superuser.
# Cần thêm trên máy: python3 (sinh mã TOTP), openssl.

# --- 1. Route công khai (role anon) ------------------------------------------------
SO_TT_CONG_KHAI="$(sql "SELECT count(*) FROM mot_cua.thu_tuc WHERE cong_khai")"
kiem "GET /public/thu_tuc → 200" "200" "$(ma_http "$GW/public/thu_tuc")"
kiem "anon thấy đúng $SO_TT_CONG_KHAI thủ tục công khai" "$SO_TT_CONG_KHAI" \
  "$(curl -s "$GW/public/thu_tuc?select=ma" | jq length)"
kiem "GET /public/linh_vuc → 200" "200" "$(ma_http "$GW/public/linh_vuc")"
MA_TT="$(sql "SELECT ma FROM mot_cua.thu_tuc WHERE cong_khai ORDER BY ma LIMIT 1")"
kiem "GET /public/rpc/json_schema_thu_tuc?ma=$MA_TT → JSON Schema đúng thủ tục" \
  "$(sql "SELECT ten FROM mot_cua.thu_tuc WHERE ma = '$MA_TT'")" \
  "$(curl -s "$GW/public/rpc/json_schema_thu_tuc?ma=$MA_TT" | jq -r .title)"
kiem "GET /public/thu_tuc kèm thành phần yêu cầu (embed) → 200" "200" \
  "$(ma_http "$GW/public/thu_tuc?select=ma,thanh_phan_yeu_cau(ma,bat_buoc)")"
kiem "anon đọc /public/ho_so → 401 (không có quyền)" "401" "$(ma_http "$GW/public/ho_so")"
kiem "anon đọc /public/can_bo → 401 (không có quyền)" "401" "$(ma_http "$GW/public/can_bo")"
kiem "anon ghi qua /public (POST) → 404 (route chỉ GET)" "404" \
  "$(ma_http -X POST -H 'Content-Type: application/json' -d '{}' "$GW/public/ho_so")"

# --- 2. Test SQL/RLS trong CSDL ------------------------------------------------------
if out="$(docker compose exec -T postgres psql -XqtA -v ON_ERROR_STOP=1 \
     -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-commune}" < "apps/$DXOS_APP/db/tests/rls.sql" 2>&1)"; then ma=0; else ma=$?; fi
while IFS='|' read -r kq mo_ta mong_doi thuc_te; do
  [ -n "$kq" ] || continue
  case "$kq" in
    ĐẠT|TRƯỢT) kiem "SQL $mo_ta" "$mong_doi" "$thuc_te" ;;
  esac
done <<<"$out"
kiem "db/tests/rls.sql: mã thoát" "0" "$ma"

# --- 3. MFA: cán bộ, lãnh đạo bị bắt cài OTP; công dân thì không ---------------------
MK="smoke-$(openssl rand -hex 12)"
for u in congdan01 canbo01 lanhdao01; do dat_mat_khau "$u" "$MK"; done
for u in canbo01 canbo02 canbo03 lanhdao01; do
  kiem "$u có required action CONFIGURE_TOTP" '["CONFIGURE_TOTP"]' \
    "$(kc get users -r dxos -q "username=$u" -q exact=true --fields requiredActions | jq -c '.[0].requiredActions')"
done
for u in canbo01 lanhdao01; do
  kiem "$u lấy token bằng mật khẩu (thiếu OTP) → bị từ chối" "Account is not fully set up" \
    "$(lay_token "$u" "$MK" | jq -r '.error_description // "CÓ TOKEN"')"
done
kiem "congdan01 không bị bắt OTP" '[]' \
  "$(kc get users -r dxos -q username=congdan01 -q exact=true --fields requiredActions | jq -c '.[0].requiredActions // []')"

TOKEN="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
kiem "congdan01 lấy được token" "có" "$([ -n "$TOKEN" ] && echo có || echo không)"
CLAIMS="$(jwt_payload "$TOKEN")"
SUB="$(jq -r .sub <<<"$CLAIMS")"
kiem "token: iss realm dxos" "$KC/realms/dxos" "$(jq -r .iss <<<"$CLAIMS")"
kiem "token: aud chứa dxos_api" "true" "$(jq '[.aud] | flatten | index("dxos_api") != null' <<<"$CLAIMS")"
kiem "token: resource_access.dxos_api.roles" '["cong_dan"]' "$(jq -c .resource_access.dxos_api.roles <<<"$CLAIMS")"

# --- 4a. JWT qua APISIX: 401 / 401 / 200 ------------------------------------------------
kiem "/api/ho_so không token → 401" "401" "$(ma_http "$GW/api/ho_so")"
kiem "/api/ho_so token sửa chữ ký → 401" "401" \
  "$(ma_http -H "Authorization: Bearer ${TOKEN%?????}AAAAA" "$GW/api/ho_so")"
kiem "/api/ho_so token công dân → 200" "200" "$(ma_http -H "Authorization: Bearer $TOKEN" "$GW/api/ho_so")"

# --- 4b. cong_dan qua API --------------------------------------------------------------
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
REP=(-H 'Prefer: return=representation')
TT_ID="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = '$MA_TT'")"
LV_ID="$(sql "SELECT linh_vuc_id FROM mot_cua.thu_tuc WHERE id = '$TT_ID'")"
moi="$(curl -s "${AUTH[@]}" "${REP[@]}" \
  -d "{\"thu_tuc_id\":\"$TT_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Smoke\",\"so_dien_thoai\":\"0900000099\"}" "$GW/api/ho_so")"
ID_MOI="$(jq -r '.[0].id // empty' <<<"$moi")"
kiem "cong_dan nộp hồ sơ → có id" "có" "$([ -n "$ID_MOI" ] && echo có || echo không)"
kiem "cong_dan: nguoi_nop_sub = sub của token" "$SUB" "$(jq -r '.[0].nguoi_nop_sub' <<<"$moi")"
kiem "cong_dan: hồ sơ mới có trạng thái moi, mã HS…, hạn xử lý" "moi true true" \
  "$(jq -r '.[0] | "\(.trang_thai) \(.ma_ho_so | startswith("HS")) \(.han_xu_ly != null)"' <<<"$moi")"
ds="$(curl -s "${AUTH[@]}" "$GW/api/ho_so")"
kiem "cong_dan thấy đúng số hồ sơ của mình" "$(sql "SELECT count(*) FROM mot_cua.ho_so WHERE nguoi_nop_sub = '$SUB'")" \
  "$(jq length <<<"$ds")"
kiem "cong_dan chỉ thấy hồ sơ của mình" "true" "$(jq --arg s "$SUB" 'all(.[]; .nguoi_nop_sub == $s)' <<<"$ds")"
kiem "cong_dan tự đặt trang_thai khi nộp → 403" "403" \
  "$(ma_http "${AUTH[@]}" -d "{\"thu_tuc_id\":\"$TT_ID\",\"ho_ten_nguoi_nop\":\"X\",\"trang_thai\":\"hoan_tat\"}" "$GW/api/ho_so")"
kiem "cong_dan PATCH hồ sơ đã nộp (trạng thái moi) → 0 dòng" "0" \
  "$(curl -s -X PATCH "${AUTH[@]}" "${REP[@]}" -d '{"so_dien_thoai":"0911111111"}' "$GW/api/ho_so?id=eq.$ID_MOI" | jq length)"
kiem "cong_dan PATCH cán bộ xử lý (cột không được cấp quyền) → 403" "403" \
  "$(ma_http -X PATCH "${AUTH[@]}" -d '{"can_bo_xu_ly_id":null}' "$GW/api/ho_so?id=eq.$ID_MOI")"
YC_ID="$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$TT_ID' ORDER BY thu_tu LIMIT 1")"
kiem "cong_dan đính kèm metadata giấy tờ vào hồ sơ của mình → 201" "201" \
  "$(ma_http "${AUTH[@]}" -d "$(jq -nc --arg h "$ID_MOI" --arg y "$YC_ID" \
       '{ho_so_id: $h, thanh_phan_yeu_cau_id: (if $y == "" then null else $y end), ten_tep: "smoke.pdf", loai_mime: "application/pdf", kich_thuoc: 1024}')" \
     "$GW/api/thanh_phan_ho_so")"
kiem "cong_dan đọc /api/can_bo → 403" "403" "$(ma_http "${AUTH[@]}" "$GW/api/can_bo")"

# --- 4c. can_bo, lanh_dao qua API: người dùng tạm có OTP -------------------------------
# ma_totp <secret> → mã TOTP 6 số (RFC 6238, HmacSHA1, 30 giây – chính sách OTP của realm).
# Keycloak dùng chính chuỗi secret (UTF-8) làm khóa HMAC.
ma_totp() {
  python3 -c 'import hmac,hashlib,struct,sys,time
h=hmac.new(sys.argv[1].encode(),struct.pack(">Q",int(time.time())//30),hashlib.sha1).digest()
o=h[-1]&15
print("%06d"%((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000))' "$1"
}
# tao_nguoi_dung_otp <username> <nhóm> <mật khẩu> <secret>: Partial Import qua stdin
# (mật khẩu và secret không nằm trong tham số lệnh).
tao_nguoi_dung_otp() {
  jq -n --arg u "$1" --arg g "$2" --arg pw "$3" --arg s "$4" '{ifResourceExists: "FAIL", users: [{
      username: $u, enabled: true, email: ($u + "@smoke.example"), emailVerified: true,
      firstName: "Smoke", lastName: "Tạm", groups: [$g],
      credentials: [
        {type: "password", value: $pw, temporary: false},
        {type: "otp", userLabel: "smoke",
         secretData: ({value: $s} | tojson),
         credentialData: ({subType: "totp", digits: 6, period: 30, counter: 0, algorithm: "HmacSHA1"} | tojson)}]}]}' |
    kc create partialImport -r dxos -f - > /dev/null
}
# lay_token_otp <username> <mật khẩu> <mã OTP> → JSON từ token endpoint
lay_token_otp() {
  curl -s "$KC/realms/dxos/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=dxos_cli \
    --data-urlencode "username=$1" --data-urlencode "password=$2" --data-urlencode "otp=$3"
}
xoa_nguoi_dung() {
  local id
  id="$(kc get users -r dxos -q "username=$1" -q exact=true --fields id | jq -r '.[0].id // empty')"
  [ -z "$id" ] || kc delete "users/$id" -r dxos
}

HAU_TO="$(openssl rand -hex 4)"
U_CB="smoke-cb-$HAU_TO"; U_LD="smoke-ld-$HAU_TO"
OTP_CB="$(openssl rand -hex 10)"; OTP_LD="$(openssl rand -hex 10)"
tao_nguoi_dung_otp "$U_CB" /can-bo "$MK" "$OTP_CB"
tao_nguoi_dung_otp "$U_LD" /lanh-dao "$MK" "$OTP_LD"

kiem "can_bo tạm có OTP: chỉ mật khẩu → không có token" "KHÔNG TOKEN" \
  "$(lay_token "$U_CB" "$MK" | jq -r 'if .access_token then "CÓ TOKEN" else "KHÔNG TOKEN" end')"
TK_CB="$(lay_token_otp "$U_CB" "$MK" "$(ma_totp "$OTP_CB")" | jq -r '.access_token // empty')"
TK_LD="$(lay_token_otp "$U_LD" "$MK" "$(ma_totp "$OTP_LD")" | jq -r '.access_token // empty')"
kiem "can_bo tạm: mật khẩu + TOTP → token, role can_bo" '["can_bo"]' \
  "$(jwt_payload "$TK_CB" | jq -c '.resource_access.dxos_api.roles // "KHÔNG TOKEN"')"
kiem "lanh_dao tạm: mật khẩu + TOTP → token, role lanh_dao" '["lanh_dao"]' \
  "$(jwt_payload "$TK_LD" | jq -c '.resource_access.dxos_api.roles // "KHÔNG TOKEN"')"
SUB_CB="$(jwt_payload "$TK_CB" | jq -r .sub)"

# Cán bộ tạm phụ trách đúng lĩnh vực của thủ tục mà công dân vừa nộp.
CB_ID="$(sql "INSERT INTO mot_cua.can_bo (sub, ho_ten, chuc_vu) VALUES ('$SUB_CB', 'Cán bộ smoke', 'Thử') RETURNING id" | head -1)"
sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_ID')" > /dev/null

A_CB=(-H "Authorization: Bearer $TK_CB" -H 'Content-Type: application/json')
A_LD=(-H "Authorization: Bearer $TK_LD" -H 'Content-Type: application/json')
ds="$(curl -s "${A_CB[@]}" "$GW/api/ho_so?select=id,thu_tuc:thu_tuc_id(linh_vuc_id)")"
kiem "can_bo qua API thấy đúng số hồ sơ thuộc lĩnh vực phụ trách" \
  "$(sql "SELECT count(*) FROM mot_cua.ho_so h JOIN mot_cua.thu_tuc t ON t.id = h.thu_tuc_id WHERE t.linh_vuc_id = '$LV_ID'")" \
  "$(jq length <<<"$ds")"
kiem "can_bo chỉ thấy hồ sơ thuộc lĩnh vực phụ trách" "true" \
  "$(jq --arg lv "$LV_ID" 'all(.[]; .thu_tuc.linh_vuc_id == $lv)' <<<"$ds")"
kiem "can_bo nhận xử lý hồ sơ công dân vừa nộp → dang_xu_ly, tự giao cho mình" "dang_xu_ly $CB_ID" \
  "$(curl -s -X PATCH "${A_CB[@]}" "${REP[@]}" -d '{"trang_thai":"dang_xu_ly"}' "$GW/api/ho_so?id=eq.$ID_MOI" \
     | jq -r '.[0] | "\(.trang_thai) \(.can_bo_xu_ly_id)"')"
ID_KHAC="$(sql "SELECT h.id FROM mot_cua.ho_so h JOIN mot_cua.thu_tuc t ON t.id = h.thu_tuc_id
                WHERE t.linh_vuc_id <> '$LV_ID' AND h.trang_thai NOT IN ('hoan_tat', 'tu_choi') LIMIT 1")"
if [ -n "$ID_KHAC" ]; then
  kiem "can_bo PATCH hồ sơ lĩnh vực khác → 0 dòng" "0" \
    "$(curl -s -X PATCH "${A_CB[@]}" "${REP[@]}" -d '{"trang_thai":"tu_choi","ly_do":"x"}' "$GW/api/ho_so?id=eq.$ID_KHAC" | jq length)"
fi
kiem "can_bo chuyển trạng thái sai (dang_xu_ly → moi) → 400" "400" \
  "$(ma_http -X PATCH "${A_CB[@]}" -d '{"trang_thai":"moi"}' "$GW/api/ho_so?id=eq.$ID_MOI")"
kiem "can_bo nộp hồ sơ → 403" "403" \
  "$(ma_http "${A_CB[@]}" -d "{\"thu_tuc_id\":\"$TT_ID\",\"ho_ten_nguoi_nop\":\"X\"}" "$GW/api/ho_so")"
kiem "can_bo đọc danh sách cán bộ → 200" "200" "$(ma_http "${A_CB[@]}" "$GW/api/can_bo")"

kiem "lanh_dao qua API thấy tất cả hồ sơ" "$(sql "SELECT count(*) FROM mot_cua.ho_so")" \
  "$(curl -s "${A_LD[@]}" "$GW/api/ho_so?select=id" | jq length)"
kiem "lanh_dao PATCH hồ sơ → 403" "403" \
  "$(ma_http -X PATCH "${A_LD[@]}" -d '{"trang_thai":"hoan_tat"}' "$GW/api/ho_so?id=eq.$ID_MOI")"
kiem "lanh_dao nộp hồ sơ → 403" "403" \
  "$(ma_http "${A_LD[@]}" -d "{\"thu_tuc_id\":\"$TT_ID\",\"ho_ten_nguoi_nop\":\"X\"}" "$GW/api/ho_so")"

# Dọn: người dùng tạm và cán bộ tạm (hồ sơ thử của công dân được giữ lại, bỏ giao).
sql "UPDATE mot_cua.ho_so SET can_bo_xu_ly_id = NULL WHERE can_bo_xu_ly_id = '$CB_ID';
UPDATE mot_cua.thanh_phan_ho_so SET nguoi_kiem_tra_id = NULL WHERE nguoi_kiem_tra_id = '$CB_ID';
DELETE FROM mot_cua.can_bo WHERE id = '$CB_ID'" > /dev/null
xoa_nguoi_dung "$U_CB"; xoa_nguoi_dung "$U_LD"
kiem "đã xóa người dùng tạm của smoke" "0" \
  "$(kc get users -r dxos -q "search=smoke-" --fields username | jq '[.[] | select(.username | startswith("smoke-"))] | length')"
