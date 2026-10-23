#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke của bộ máy một cửa mot-cua và các gói thu-tuc/. Được scripts/smoke.sh `source` (dùng hàm trong
# scripts/lib-smoke.sh: kiem, ma_http, sql, sql_loi, kc, lay_token…), không chạy riêng.
# Kiểm:
#   1. Route công khai (role anon): danh mục thủ tục, JSON Schema; không thấy hồ sơ.
#   2. Test SQL mot-cua/db/tests/*.sql: RLS, danh mục nạp từ gói, nhật ký kiểm toán (mỗi dòng ĐẠT/TRƯỢT là một kiểm tra).
#   3. MFA: cán bộ, lãnh đạo bị bắt cài OTP; công dân thì không.
#   4. Qua APISIX → PostgREST với token thật của từng vai trò: cong_dan (mật khẩu),
#      can_bo và lanh_dao (mật khẩu + mã TOTP). Cán bộ, lãnh đạo dùng người dùng TẠM có
#      OTP tạo riêng cho smoke rồi xóa, không đụng người dùng mẫu.
#   4d. Quy trình qua APISIX /workflow (#6): công dân nộp theo thứ tự tạo hồ sơ → tải tệp → khởi
#      tạo; Poka-yoke phía máy chủ (#59): thiếu tệp → 422, không khởi tạo; cán bộ/lãnh đạo thấy và
#      hoàn thành task của nhóm mình, chặn chéo vai trò, backend tự kiểm token.
#   4e. Tệp hồ sơ qua APISIX /files (#7): tests/smoke-tep.sh.
#   4f. Sự kiện hồ sơ qua RabbitMQ (#9): tests/smoke-su-kien.sh.
#   4g. Gói thủ tục (D-009): danh mục, cắm–rút gói, hồ sơ chứng thực bản sao qua /workflow:
#      tests/smoke-goi-thu-tuc.sh.
#   4h. Cổng công dân mot-cua-web qua APISIX /: trang, phông, route SPA, header bảo mật, đăng nhập
#      PKCE, nộp hồ sơ E2E từ origin của web (#57): tests/smoke-web.sh.
#   4i. Cổng cán bộ /can-bo: trang, client mot_cua_can_bo (PKCE + OTP), E2E cán bộ hộ tịch tiếp nhận →
#      thẩm định → lãnh đạo phê duyệt hồ sơ vừa nộp từ web; cán bộ lĩnh vực khác không thấy (#55):
#      tests/smoke-can-bo.sh.
#   4j. Nhật ký kiểm toán chuỗi băm (#75): quyền qua APISIX, dấu vết của hồ sơ vừa xử lý, nộp đồng thời,
#      trình xác minh độc lập Python, log đối tượng pgAudit: tests/smoke-kiem-toan.sh.
#   4k. Giấy tờ có ký số (#77): step-ca, ca-init, biên nhận/kết quả PDF ký PAdES phát hành khi nộp/hoàn tất,
#      tải qua link ngắn hạn, xác minh (sửa 1 byte → không toàn vẹn), quyền: tests/smoke-ky-so.sh.
#   4l. Kho dữ liệu (#80): xuất Parquet khử định danh, dbt build + lineage, mart khớp SQL trên kho nóng:
#      tests/smoke-kho-du-lieu.sh.
#   5. Quy trình Flowable "Đăng ký khai sinh" ở mức engine (REST trực tiếp, cổng debug):
#      tiếp nhận → (bổ sung) → thẩm định → phê duyệt, nhánh từ chối, hẹn giờ quá hạn.
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

# --- 2. Test SQL trong CSDL (RLS, danh mục gói thủ tục) ----------------------------------
for tep_sql in mot-cua/db/tests/*.sql; do
  if out="$(docker compose exec -T postgres psql -XqtA -v ON_ERROR_STOP=1 \
       -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-commune}" < "$tep_sql" 2>&1)"; then ma=0; else ma=$?; fi
  while IFS='|' read -r kq mo_ta mong_doi thuc_te; do
    [ -n "$kq" ] || continue
    case "$kq" in
      ĐẠT|TRƯỢT) kiem "SQL $mo_ta" "$mong_doi" "$thuc_te" ;;
    esac
  done <<<"$out"
  kiem "$tep_sql: mã thoát" "0" "$ma"
done

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
# Từ #7 metadata tệp chỉ ghi qua API tệp /files (quét ClamAV trước khi lưu).
kiem "cong_dan tự ghi metadata giấy tờ qua /api (bỏ qua API tệp) → 403" "403" \
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

# --- 4d. Quy trình qua APISIX /workflow (#6) ---------------------------------------------
# Công dân nộp hồ sơ khai sinh theo luồng của cổng công dân (#59): tạo hồ sơ → tải tệp → khởi
# tạo quy trình; mot-cua-api kiểm JSON Schema của gói trước khi gọi Flowable. Cán bộ, lãnh đạo
# thấy và hoàn thành task của nhóm mình. Không ai cầm mật khẩu Flowable; backend mot-cua-api tự
# kiểm token và quyền, đọc/ghi hồ sơ bằng token người dùng (RLS).
# gw <token> <đường dẫn sau /workflow> [JSON] → body response; gw_ma … → mã HTTP
gw() {
  local tk="$1" duong="$2"; shift 2
  curl -s -H "Authorization: Bearer $tk" -H 'Content-Type: application/json' ${1:+-d "$1"} "$GW/workflow$duong"
}
gw_ma() {
  local tk="$1" duong="$2"; shift 2
  curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $tk" -H 'Content-Type: application/json' \
    ${1:+-d "$1"} "$GW/workflow$duong"
}
# nop_du <token> <body JSON có thu_tuc_id> → JSON {"hoSo", "soTep", "processInstanceId", "quyTrinh",
# "buocDangMo"} (hoặc {"hoSo", "soTep", "loi"…} nếu khởi tạo lỗi). Luồng nộp chuẩn (#59) như cổng
# công dân: POST /api/ho_so → một PDF giả cho mỗi tệp tối thiểu của từng thành phần bắt buộc (đọc
# công khai /public/thanh_phan_yeu_cau) qua /files (ClamAV quét) → POST /workflow/ho-so/{id}/khoi-tao.
NOP_TD="$(mktemp -d)"
printf '%%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%%%EOF\n' > "$NOP_TD/giay-to.pdf"
# tai_giay_to <token> <hồ sơ> <id thành phần yêu cầu> [tên] → mã HTTP
tai_giay_to() {
  curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" -H 'Content-Type: application/pdf' \
    --data-binary "@$NOP_TD/giay-to.pdf" "$GW/files/ho-so/$2/tep?ten=${4:-giay-to.pdf}&thanh_phan_yeu_cau_id=$3"
}
nop_du() {
  local tk="$1" body="$2" hs id yc n i so=0
  hs="$(curl -s -H "Authorization: Bearer $tk" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    -d "$body" "$GW/api/ho_so?select=id,ma_ho_so,trang_thai,han_xu_ly,nguoi_nop_sub" | jq -c '.[0]? // {}')"
  id="$(jq -r '.id // "00000000-0000-0000-0000-000000000000"' <<<"$hs")"
  while read -r yc n; do
    [ -n "$yc" ] || continue
    for i in $(seq 1 "$n"); do
      [ "$(tai_giay_to "$tk" "$id" "$yc" "giay-to-$i.pdf")" = 201 ] && so=$((so + 1))
    done
  done < <(curl -s "$GW/public/thanh_phan_yeu_cau?thu_tuc_id=eq.$(jq -r .thu_tuc_id <<<"$body")&bat_buoc=is.true&select=id,so_luong" \
             | jq -r '.[]? | "\(.id) \(.so_luong)"')
  gw "$tk" "/ho-so/$id/khoi-tao" '{}' | jq -c --argjson hs "$hs" --argjson so "$so" '{hoSo: $hs, soTep: $so} + .'
}
# so_tep_api <token> <hồ sơ> → số tệp thấy qua GET /files/ho-so/{id}/tep
so_tep_api() { curl -s -H "Authorization: Bearer $1" "$GW/files/ho-so/$2/tep" | jq 'length'; }
# task_cua <token> <hoSoId> <bước> → id task (rỗng nếu người dùng không thấy)
task_cua() { gw "$1" /tasks | jq -r --arg h "$2" --arg b "$3" '[.[] | select(.hoSoId == $h and .buoc == $b)][0].id // empty'; }
# tt_csdl <hồ sơ> → "trạng thái|lý do" trong CSDL (#73: đi theo bước Flowable)
tt_csdl() { sql "SELECT trang_thai || '|' || coalesce(ly_do, '') FROM mot_cua.ho_so WHERE id = '${1:-00000000-0000-0000-0000-000000000000}'"; }
# xong_tt <token> <task> <biến JSON> → "bước đang mở trangThai" của response hoàn thành bước
xong_tt() { gw "$1" "/tasks/$2/complete" "{\"bien\":$3}" | jq -r '"\([.buocDangMo[]?.buoc] | join(",")) \(.trangThai)"'; }

KS_ID="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = 'KS01' AND cong_khai")"
LV_HT="$(sql "SELECT id FROM mot_cua.linh_vuc WHERE ma = 'ho_tich'")"
if [ -z "$KS_ID" ] || [ -z "$LV_HT" ]; then
  kiem "có thủ tục KS01, lĩnh vực ho_tich để chạy /workflow (DXOS_SEED=true)" "có" "không"
else
  # Poka-yoke phía máy chủ (#59): gọi thẳng API khi chưa đủ tệp thì không khởi tạo được.
  SO_YC_KS="$(sql "SELECT count(*) FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND bat_buoc")"
  truoc="$(sql "SELECT count(*) FROM mot_cua.ho_so WHERE nguoi_nop_sub = '$SUB'")"
  ma="$(curl -s -o "$NOP_TD/r.json" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"X\"}" "$GW/workflow/ho-so")"
  kiem "POST /workflow/ho-so KS01 (cần $SO_YC_KS giấy tờ, chưa có tệp) → 422, không lưu hồ sơ, liệt kê $SO_YC_KS thành phần thiếu" \
    "422 $truoc $SO_YC_KS" "$ma $(sql "SELECT count(*) FROM mot_cua.ho_so WHERE nguoi_nop_sub = '$SUB'") $(jq '.chiTiet.thanhPhan | length' "$NOP_TD/r.json")"
  HP="$(curl -s "${AUTH[@]}" "${REP[@]}" -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Poka-yoke\"}" \
    "$GW/api/ho_so" | jq -r '.[0].id // "00000000-0000-0000-0000-000000000000"')"
  YC_CUOI="$(sql "SELECT ma FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND bat_buoc ORDER BY thu_tu DESC LIMIT 1")"
  loi_tai=0
  for yc in $(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND bat_buoc AND ma <> '$YC_CUOI' ORDER BY thu_tu"); do
    [ "$(tai_giay_to "$TOKEN" "$HP" "$yc")" = 201 ] || loi_tai=$((loi_tai + 1))
  done
  kiem "tải đủ tệp trừ thành phần bắt buộc cuối ($YC_CUOI) → 201 cả" "0" "$loi_tai"
  ma="$(curl -s -o "$NOP_TD/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "$GW/workflow/ho-so/$HP/khoi-tao")"
  kiem "gọi thẳng POST /workflow/ho-so/{id}/khoi-tao khi thiếu tệp → 422, chỉ ra đúng $YC_CUOI, câu tiếng Việt" \
    "422 $YC_CUOI Thiếu thành phần bắt buộc" \
    "$ma $(jq -r '[.chiTiet.thanhPhan[]?.thanhPhan] | join(",")' "$NOP_TD/r.json") $(jq -r '.chiTiet.thanhPhan[0].loi // empty' "$NOP_TD/r.json")"
  kiem "422: không có quy trình trong Flowable, không ghi sự kiện, hồ sơ vẫn moi" "0 0 moi" \
    "$(wf "history/historic-process-instances?businessKey=$(sql "SELECT ma_ho_so FROM mot_cua.ho_so WHERE id = '$HP'")" | jq .total) $(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HP'") $(sql "SELECT trang_thai FROM mot_cua.ho_so WHERE id = '$HP'")"
  YC_CUOI_ID="$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND ma = '$YC_CUOI'")"
  kiem "tải nốt $YC_CUOI rồi khởi tạo lại → 201, bước tiep_nhan" "201 201 tiep_nhan" \
    "$(tai_giay_to "$TOKEN" "$HP" "$YC_CUOI_ID") $(curl -s -o "$NOP_TD/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "$GW/workflow/ho-so/$HP/khoi-tao") $(jq -r '[.buocDangMo[]?.buoc] | join(",")' "$NOP_TD/r.json")"

  r="$(nop_du "$TOKEN" "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Workflow\",\"so_dien_thoai\":\"0900000098\"}")"
  WH="$(jq -r '.hoSo.id // empty' <<<"$r")"; WMA="$(jq -r '.hoSo.ma_ho_so // empty' <<<"$r")"
  WPI="$(jq -r '.processInstanceId // empty' <<<"$r")"
  kiem "cong_dan nộp KS01 (tạo hồ sơ → tải $SO_YC_KS tệp → khởi tạo) → có mã hồ sơ, quy trình, bước tiep_nhan" "có $SO_YC_KS có tiep_nhan" \
    "$([ -n "$WMA" ] && echo có || echo không) $(jq -r '.soTep' <<<"$r") $([ -n "$WPI" ] && echo có || echo không) $(jq -r '[.buocDangMo[]?.buoc] | join(",")' <<<"$r")"
  kiem "KS01: $SO_YC_KS tệp hiện trong GET /files/ho-so/{id}/tep" "$SO_YC_KS" "$(so_tep_api "$TOKEN" "${WH:-00000000-0000-0000-0000-000000000000}")"
  kiem "hồ sơ trong CSDL: người nộp = sub token, trạng thái moi" "$SUB moi" \
    "$(sql "SELECT nguoi_nop_sub || ' ' || trang_thai FROM mot_cua.ho_so WHERE id = '${WH:-00000000-0000-0000-0000-000000000000}'")"
  kiem "Flowable: quy trình dang_ky_khai_sinh, businessKey = mã hồ sơ, biến lấy từ CSDL" "dang_ky_khai_sinh $WMA $WH $SUB" \
    "$(wf "runtime/process-instances/$WPI" | jq -r '"\(.processDefinitionId | split(":")[0]) \(.businessKey)"') $(wf "runtime/process-instances/$WPI/variables/hoSoId" | jq -r .value) $(wf "runtime/process-instances/$WPI/variables/nguoiNopSub" | jq -r .value)"
  kiem "khởi tạo lại quy trình cho cùng hồ sơ → 409" "409" "$(gw_ma "$TOKEN" "/ho-so/$WH/khoi-tao" '{}')"
  truoc="$(sql "SELECT count(*) FROM mot_cua.ho_so WHERE nguoi_nop_sub = '$SUB'")"
  kiem "cong_dan nộp thủ tục chưa có quy trình qua /workflow → 422, không lưu hồ sơ" "422 $truoc" \
    "$(gw_ma "$TOKEN" /ho-so "{\"thu_tuc_id\":\"$(sql "SELECT id FROM mot_cua.thu_tuc WHERE cong_khai AND quy_trinh IS NULL LIMIT 1")\",\"ho_ten_nguoi_nop\":\"X\"}") $(sql "SELECT count(*) FROM mot_cua.ho_so WHERE nguoi_nop_sub = '$SUB'")"
  HS_KHAC="$(sql "SELECT id FROM mot_cua.ho_so WHERE nguoi_nop_sub <> '$SUB' LIMIT 1")"
  if [ -n "$HS_KHAC" ]; then
    kiem "cong_dan khởi tạo quy trình cho hồ sơ người khác → 404 (RLS)" "404" "$(gw_ma "$TOKEN" "/ho-so/$HS_KHAC/khoi-tao" '{}')"
    kiem "cong_dan xem tiến độ hồ sơ người khác → 404 (RLS)" "404" "$(gw_ma "$TOKEN" "/ho-so/$HS_KHAC/tien-do")"
  fi
  kiem "cong_dan xem tiến độ hồ sơ của mình → đang ở tiep_nhan" "tiep_nhan" \
    "$(gw "$TOKEN" "/ho-so/$WH/tien-do" | jq -r '[.quyTrinh[].buocDangMo[].buoc] | join(",")')"
  kiem "cán bộ, lãnh đạo nộp qua /workflow → 403" "403 403" \
    "$(gw_ma "$TK_CB" /ho-so "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"X\"}") $(gw_ma "$TK_LD" /ho-so "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"X\"}")"

  TID="$(wf "runtime/tasks?processInstanceId=$WPI" | jq -r '.data[0].id')"
  kiem "cong_dan không thấy task tiep_nhan trong /workflow/tasks" "" "$(task_cua "$TOKEN" "$WH" tiep_nhan)"
  kiem "cong_dan hoàn thành task tiep_nhan → 403" "403" "$(gw_ma "$TOKEN" "/tasks/$TID/complete" '{"bien":{"hopLe":true}}')"
  if [ "$LV_ID" != "$LV_HT" ]; then
    kiem "cán bộ chưa phụ trách hộ tịch: không thấy task, hoàn thành → 403" " 403" \
      "$(task_cua "$TK_CB" "$WH" tiep_nhan) $(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"hopLe":true}}')"
  fi
  sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_HT') ON CONFLICT DO NOTHING" > /dev/null
  kiem "cán bộ hộ tịch thấy task tiep_nhan của hồ sơ" "$TID" "$(task_cua "$TK_CB" "$WH" tiep_nhan)"
  NHOM_CB="$(sql "SELECT string_agg(l.ma, ',') FROM mot_cua.can_bo_linh_vuc c JOIN mot_cua.linh_vuc l ON l.id = c.linh_vuc_id WHERE c.can_bo_id = '$CB_ID'")"
  kiem "cán bộ thấy đúng số task của các lĩnh vực mình phụ trách ($NHOM_CB)" \
    "$(wf query/tasks -d "$(jq -nc --arg g "$NHOM_CB" '{candidateGroupIn: ($g | split(",")), size: 500}')" | jq .total)" \
    "$(gw "$TK_CB" /tasks | jq length)"
  kiem "lãnh đạo không thấy task tiep_nhan" "" "$(task_cua "$TK_LD" "$WH" tiep_nhan)"
  kiem "cán bộ hoàn thành với biến của bước khác → 400" "400" "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"pheDuyet":true}}')"
  kiem "cán bộ hoàn thành thiếu biến hopLe → 400" "400" "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{}}')"
  kiem "cán bộ: thiếu thành phần (hopLe=false) → bước bo_sung, API trả trangThai cho_bo_sung" "bo_sung cho_bo_sung" \
    "$(xong_tt "$TK_CB" "$TID" '{"hopLe":false,"ghiChu":"thiếu tờ khai"}')"
  kiem "CSDL: hồ sơ cho_bo_sung, lý do = ghi chú của cán bộ (#73)" "cho_bo_sung|thiếu tờ khai" "$(tt_csdl "$WH")"
  kiem "chờ bổ sung: công dân sửa số điện thoại qua /api → 1 dòng (RLS cho_bo_sung)" "1" \
    "$(curl -s -X PATCH "${AUTH[@]}" "${REP[@]}" -d '{"so_dien_thoai":"0900000097"}' "$GW/api/ho_so?id=eq.$WH" | jq length)"
  kiem "chờ bổ sung: công dân tải thêm giấy tờ → 201" "201" \
    "$(tai_giay_to "$TOKEN" "$WH" "$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND bat_buoc ORDER BY thu_tu LIMIT 1")" bo-sung.pdf)"
  kiem "Flowable ghi người xử lý tiep_nhan = sub cán bộ" "$SUB_CB" \
    "$(wf "history/historic-task-instances?processInstanceId=$WPI&taskDefinitionKey=tiep_nhan" | jq -r '.data[0].assignee')"
  TID="$(task_cua "$TOKEN" "$WH" bo_sung)"
  kiem "cong_dan thấy task bo_sung của mình" "có" "$([ -n "$TID" ] && echo có || echo không)"
  kiem "cán bộ hoàn thành task bo_sung của công dân → 403" "403" "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{}')"
  kiem "cong_dan bổ sung xong → quay lại tiep_nhan, hồ sơ dang_xu_ly (không về moi)" "tiep_nhan dang_xu_ly" \
    "$(xong_tt "$TOKEN" "$TID" '{"ghiChu":"đã bổ sung"}')"
  kiem "CSDL sau khi nộp lại: dang_xu_ly; công dân hết sửa được (RLS) → 0 dòng" "dang_xu_ly 0" \
    "$(tt_csdl "$WH" | cut -d'|' -f1) $(curl -s -X PATCH "${AUTH[@]}" "${REP[@]}" -d '{"so_dien_thoai":"0900000096"}' "$GW/api/ho_so?id=eq.$WH" | jq length)"
  TID="$(task_cua "$TK_CB" "$WH" tiep_nhan)"
  kiem "cán bộ: đủ thành phần → tham_dinh, hồ sơ dang_xu_ly" "tham_dinh dang_xu_ly" "$(xong_tt "$TK_CB" "$TID" '{"hopLe":true}')"
  TID="$(task_cua "$TK_CB" "$WH" tham_dinh)"
  kiem "cán bộ: thẩm định đạt → phe_duyet, CSDL cho_phe_duyet" "phe_duyet cho_phe_duyet cho_phe_duyet|thiếu tờ khai" \
    "$(xong_tt "$TK_CB" "$TID" '{"datYeuCau":true}') $(tt_csdl "$WH")"
  kiem "chờ phê duyệt: cán bộ tự đặt hoan_tat qua /api → bị chặn (chỉ quy trình chuyển)" "400" \
    "$(ma_http -X PATCH -H "Authorization: Bearer $TK_CB" -H 'Content-Type: application/json' -d '{"trang_thai":"hoan_tat"}' "$GW/api/ho_so?id=eq.$WH")"
  TID="$(wf "runtime/tasks?processInstanceId=$WPI" | jq -r '.data[0].id')"
  kiem "cán bộ hoàn thành phe_duyet (nhóm lanh_dao) → 403" "403" "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"pheDuyet":true}}')"
  kiem "lãnh đạo thấy task phe_duyet" "$TID" "$(task_cua "$TK_LD" "$WH" phe_duyet)"
  kiem "lãnh đạo phê duyệt → 200, không còn bước mở" "200" "$(gw_ma "$TK_LD" "/tasks/$TID/complete" '{"bien":{"pheDuyet":true}}')"
  kiem "CSDL: hoan_tat, có ngày hoàn tất" "hoan_tat true" \
    "$(sql "SELECT trang_thai || ' ' || (ngay_hoan_tat IS NOT NULL) FROM mot_cua.ho_so WHERE id = '$WH'")"
  kiem "lịch sử trạng thái WH: nộp → chờ bổ sung → đang xử lý → chờ phê duyệt → hoàn tất" \
    "moi:nop cho_bo_sung:quy_trinh:tiep_nhan dang_xu_ly:quy_trinh:bo_sung cho_phe_duyet:quy_trinh:tham_dinh hoan_tat:quy_trinh:phe_duyet" \
    "$(sql "SELECT string_agg(concat_ws(':', den_trang_thai, nguon, buoc), ' ' ORDER BY id) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = '$WH'")"
  kiem "công dân đọc lịch sử trạng thái hồ sơ của mình qua /api (RLS) → 5 dòng" "5" \
    "$(curl -s "${AUTH[@]}" "$GW/api/lich_su_trang_thai?ho_so_id=eq.$WH&select=den_trang_thai" | jq length)"
  td="$(gw "$TOKEN" "/ho-so/$WH/tien-do")"
  kiem "tiến độ /workflow trả cùng trạng thái với CSDL" "hoan_tat" "$(jq -r '.hoSo.trang_thai' <<<"$td")"
  kiem "tiến độ: kết thúc Hoàn tất, đi đúng các bước" "ket_thuc_hoan_tat tiep_nhan,bo_sung,tiep_nhan,tham_dinh,phe_duyet" \
    "$(jq -r '.quyTrinh[0] | "\(.diemKetThuc) \([.lichSu[].buoc] | join(","))"' <<<"$td")"
  kiem "task đã xong → hoàn thành lại → 404" "404" "$(gw_ma "$TK_LD" "/tasks/$TID/complete" '{"bien":{"pheDuyet":true}}')"

  # Đối soát (#73): Flowable đi tiếp mà CSDL không được ghi (mô phỏng mot-cua-api lỗi sau khi gọi
  # Flowable bằng cách hoàn thành task thẳng trên Flowable) → mot-cua-worker sửa theo Flowable.
  doi_soat() { docker compose exec -T mot-cua-worker python /mot-cua/backend/worker.py doi-soat-mot-lan 2>/dev/null | tail -1; }
  r="$(nop_du "$TOKEN" "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Đối Soát\"}")"
  HDS="$(jq -r '.hoSo.id // empty' <<<"$r")"; PDS="$(jq -r '.processInstanceId // empty' <<<"$r")"
  ds_xong() { # ds_xong <biến JSON…> : hoàn thành task đang mở trên Flowable (rest-admin), không qua API
    wf "runtime/tasks/$(wf "runtime/tasks?processInstanceId=$PDS" | jq -r '.data[0].id')" -o /dev/null -w '%{http_code}' \
      -d "{\"action\":\"complete\",\"variables\":$1}"
  }
  kiem "đối soát: Flowable sang tham_dinh ngoài API → CSDL còn moi (lệch)" "200 tham_dinh moi" \
    "$(ds_xong '[{"name":"hopLe","value":true}]') $(wf "runtime/tasks?processInstanceId=$PDS" | jq -r '.data[0].taskDefinitionKey') $(tt_csdl "$HDS" | cut -d'|' -f1)"
  kiem "worker doi-soat-mot-lan → sửa ≥ 1 hồ sơ; hồ sơ dang_xu_ly, lịch sử nguồn doi_soat" "có dang_xu_ly doi_soat" \
    "$([ "$(doi_soat)" -ge 1 ] 2>/dev/null && echo có || echo không) $(tt_csdl "$HDS" | cut -d'|' -f1) $(sql "SELECT nguon FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = '$HDS' ORDER BY id DESC LIMIT 1")"
  kiem "đối soát ghi sự kiện ho_so.chuyen_buoc (doiSoat, trangThai dang_xu_ly) vào hộp thư đi" "true dang_xu_ly" \
    "$(sql "SELECT (noi_dung->'duLieu'->>'doiSoat') || ' ' || (noi_dung->'duLieu'->>'trangThai') FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HDS' AND loai = 'ho_so.chuyen_buoc' ORDER BY tao_luc DESC LIMIT 1")"
  kiem "đối soát chạy lại: không sửa gì thêm" "0 1" \
    "$(doi_soat) $(sql "SELECT count(*) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = '$HDS' AND nguon = 'doi_soat'")"
  ds_xong '[{"name":"datYeuCau","value":false},{"name":"ghiChu","value":"Không đạt (smoke đối soát)"}]' > /dev/null
  doi_soat > /dev/null
  kiem "Flowable kết thúc Từ chối ngoài API → đối soát: tu_choi, lý do từ ghiChu, ho_so.tu_choi" "tu_choi|Không đạt (smoke đối soát) 1" \
    "$(tt_csdl "$HDS") $(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HDS' AND loai = 'ho_so.tu_choi'")"

  # Zero-Trust: backend tự kiểm token, không tin gateway (gọi thẳng trong mạng nội bộ).
  goi_backend() {
    docker compose exec -T mot-cua-api python -c 'import sys, urllib.request, urllib.error
r = urllib.request.Request("http://127.0.0.1:8000/tasks", headers={"Authorization": "Bearer " + sys.stdin.read().strip()})
try: print(urllib.request.urlopen(r, timeout=5).status)
except urllib.error.HTTPError as e: print(e.code)' <<<"$1"
  }
  kiem "mot-cua-api gọi thẳng, token đúng → 200" "200" "$(goi_backend "$TOKEN")"
  kiem "mot-cua-api gọi thẳng, token sửa chữ ký → 401" "401" "$(goi_backend "${TOKEN%?????}AAAAA")"
  kiem "mot-cua-api gọi thẳng, token sửa payload (đổi role) → 401" "401" \
    "$(goi_backend "$(cut -d. -f1 <<<"$TOKEN").$(jwt_payload "$TOKEN" | jq -c '.resource_access.dxos_api.roles = ["lanh_dao"]' | base64 | tr -d '=\n' | tr '/+' '_-').$(cut -d. -f3 <<<"$TOKEN")")"
fi

# --- 4e. Tệp hồ sơ qua APISIX /files (#7) ------------------------------------------------
# shellcheck source=mot-cua/tests/smoke-tep.sh
. "mot-cua/tests/smoke-tep.sh"

# --- 4f. Sự kiện hồ sơ qua RabbitMQ (#9) -------------------------------------------------
if [ -n "${WH:-}" ]; then
  # shellcheck source=mot-cua/tests/smoke-su-kien.sh
  . "mot-cua/tests/smoke-su-kien.sh"
fi

# --- 4g. Gói thủ tục (D-009) ---------------------------------------------------------------
# shellcheck source=mot-cua/tests/smoke-goi-thu-tuc.sh
. "mot-cua/tests/smoke-goi-thu-tuc.sh"

# --- 4h. Cổng công dân qua APISIX (#57) ------------------------------------------------------
# shellcheck source=mot-cua/tests/smoke-web.sh
. "mot-cua/tests/smoke-web.sh"

# --- 4i. Cổng cán bộ qua APISIX (#55) --------------------------------------------------------------
# shellcheck source=mot-cua/tests/smoke-can-bo.sh
. "mot-cua/tests/smoke-can-bo.sh"

# --- 4j. Nhật ký kiểm toán chuỗi băm + pgAudit (#75) ------------------------------------------------
# shellcheck source=mot-cua/tests/smoke-kiem-toan.sh
. "mot-cua/tests/smoke-kiem-toan.sh"

# --- 4k. Giấy tờ có ký số: biên nhận, kết quả, xác minh (#77) ----------------------------------------
# shellcheck source=mot-cua/tests/smoke-ky-so.sh
. "mot-cua/tests/smoke-ky-so.sh"

# --- 4l. Kho dữ liệu: Parquet + DuckDB + dbt, mart về bao_cao (#80) --------------------------------
# shellcheck source=mot-cua/tests/smoke-kho-du-lieu.sh
. "mot-cua/tests/smoke-kho-du-lieu.sh"

# Dọn: người dùng tạm và cán bộ tạm (hồ sơ thử của công dân được giữ lại, bỏ giao).
sql "UPDATE mot_cua.ho_so SET can_bo_xu_ly_id = NULL WHERE can_bo_xu_ly_id = '$CB_ID';
UPDATE mot_cua.thanh_phan_ho_so SET nguoi_kiem_tra_id = NULL WHERE nguoi_kiem_tra_id = '$CB_ID';
DELETE FROM mot_cua.can_bo_linh_vuc WHERE can_bo_id = '$CB_ID';
DELETE FROM mot_cua.can_bo WHERE id = '$CB_ID'" > /dev/null
xoa_nguoi_dung "$U_CB"; xoa_nguoi_dung "$U_LD"
rm -rf "${NOP_TD:-}"
kiem "đã xóa người dùng tạm của smoke" "0" \
  "$(kc get users -r dxos -q "search=smoke-" --fields username | jq '[.[] | select(.username | startswith("smoke-"))] | length')"

# --- 5. Quy trình Flowable "Đăng ký khai sinh" (#8) ----------------------------------
# Hồ sơ KS01 do công dân nộp qua API → khởi tạo quy trình với biến lấy từ hồ sơ → cán bộ
# hoàn thành từng bước. Gọi Flowable REST trực tiếp (cổng debug 127.0.0.1) để kiểm riêng
# engine và BPMN; luồng người dùng qua gateway ở mục 4d.
# wf_bat_dau <businessKey> <hoSoId> <hanXuLyLuc> → id process instance
wf_bat_dau() {
  wf runtime/process-instances -d "$(jq -nc --arg bk "$1" --arg id "$2" --arg sub "$SUB" --arg han "$3" \
    '{processDefinitionKey: "dang_ky_khai_sinh", businessKey: $bk, variables: [
       {name: "hoSoId", value: $id}, {name: "maHoSo", value: $bk},
       {name: "nguoiNopSub", value: $sub}, {name: "hanXuLyLuc", value: $han}]}')" | jq -r '.id // empty'
}
# wf_buoc <process instance> → taskDefinitionKey của task đang mở (rỗng nếu không có)
wf_buoc() { wf "runtime/tasks?processInstanceId=$1" | jq -r '[.data[].taskDefinitionKey] | join(",")'; }
# wf_xong <process instance> <biến> <giá trị JSON> → mã HTTP khi hoàn thành task đang mở
wf_xong() {
  local tid
  tid="$(wf "runtime/tasks?processInstanceId=$1" | jq -r '.data[0].id')"
  wf "runtime/tasks/$tid" -o /dev/null -w '%{http_code}' \
    -d "{\"action\":\"complete\",\"variables\":[{\"name\":\"$2\",\"value\":$3}]}"
}

kiem "quy trình dang_ky_khai_sinh đã được nap-thu-tuc deploy từ thu-tuc/khai-sinh/" "1" \
  "$(wf "repository/process-definitions?key=dang_ky_khai_sinh&latest=true" | jq .total)"

KS_ID="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = 'KS01' AND cong_khai")"
if [ -z "$KS_ID" ]; then
  kiem "có thủ tục KS01 để chạy quy trình (DXOS_SEED=true)" "có" "không"
else
  hs="$(curl -s "${AUTH[@]}" "${REP[@]}" \
    -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Quy Trình\"}" "$GW/api/ho_so")"
  HS_ID="$(jq -r '.[0].id' <<<"$hs")"; MA_HS="$(jq -r '.[0].ma_ho_so' <<<"$hs")"
  HAN="$(jq -r '.[0].han_xu_ly' <<<"$hs")T17:00:00+07:00"
  PI="$(wf_bat_dau "$MA_HS" "$HS_ID" "$HAN")"
  kiem "khởi tạo quy trình cho hồ sơ khai sinh $MA_HS → bước tiếp nhận" "tiep_nhan" "$(wf_buoc "$PI")"
  TID="$(wf "runtime/tasks?processInstanceId=$PI" | jq -r '.data[0].id')"
  kiem "bước tiếp nhận giao cho nhóm lĩnh vực ho_tich" "ho_tich" \
    "$(wf "runtime/tasks/$TID/identitylinks" | jq -r '[.[] | select(.type == "candidate") | .group] | join(",")')"
  wf_xong "$PI" hopLe false > /dev/null
  kiem "thiếu thành phần → bước công dân bổ sung, giao đúng sub người nộp" "bo_sung $SUB" \
    "$(wf "runtime/tasks?processInstanceId=$PI" | jq -r '.data[0] | "\(.taskDefinitionKey) \(.assignee)"')"
  wf_xong "$PI" ghiChu '"đã bổ sung"' > /dev/null
  kiem "bổ sung xong → quay lại tiếp nhận" "tiep_nhan" "$(wf_buoc "$PI")"
  wf_xong "$PI" hopLe true > /dev/null
  kiem "đủ thành phần → bước thẩm định" "tham_dinh" "$(wf_buoc "$PI")"
  wf_xong "$PI" datYeuCau true > /dev/null
  kiem "thẩm định đạt → bước phê duyệt của lãnh đạo" "phe_duyet" "$(wf_buoc "$PI")"
  kiem "phê duyệt: hoàn thành task → 200" "200" "$(wf_xong "$PI" pheDuyet true)"
  kiem "quy trình kết thúc ở Hoàn tất" "ket_thuc_hoan_tat" \
    "$(wf "history/historic-process-instances/$PI" | jq -r '.endActivityId')"
  kiem "biến ketQua = hoan_tat" "hoan_tat" \
    "$(wf "history/historic-variable-instances?processInstanceId=$PI&variableName=ketQua" | jq -r '.data[0].variable.value')"
  kiem "lịch sử đi đúng các bước" "tiep_nhan,bo_sung,tiep_nhan,tham_dinh,phe_duyet" \
    "$(wf "history/historic-activity-instances?processInstanceId=$PI&activityType=userTask&sort=startTime&size=50" | jq -r '[.data[].activityId] | join(",")')"
  kiem "chưa tới hạn → không đánh dấu quá hạn" "null" \
    "$(wf "history/historic-variable-instances?processInstanceId=$PI&variableName=quaHan" | jq -r '.data[0].variable.value // "null"')"

  # Thẩm định không đạt → từ chối.
  PI2="$(wf_bat_dau "$MA_HS-TC" "$HS_ID" "$HAN")"
  wf_xong "$PI2" hopLe true > /dev/null; wf_xong "$PI2" datYeuCau false > /dev/null
  kiem "thẩm định không đạt → kết thúc ở Từ chối" "ket_thuc_tu_choi" \
    "$(wf "history/historic-process-instances/$PI2" | jq -r '.endActivityId')"

  # Hạn đã qua → hẹn giờ không ngắt quy trình đặt quaHan = true, task vẫn còn.
  PI3="$(wf_bat_dau "$MA_HS-QH" "$HS_ID" "2020-01-01T17:00:00+07:00")"
  qh=""; for _ in $(seq 1 20); do
    qh="$(wf "runtime/process-instances/$PI3/variables/quaHan" | jq -r '.value // empty')"; [ -n "$qh" ] && break; sleep 1
  done
  kiem "quá hạn → biến quaHan = true, quy trình vẫn ở tiếp nhận" "true tiep_nhan" "${qh:-null} $(wf_buoc "$PI3")"
  wf "runtime/process-instances/$PI3?deleteReason=smoke" -X DELETE -o /dev/null
fi
