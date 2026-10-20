#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Smoke của ứng dụng mot-cua. Được scripts/smoke.sh `source` (dùng hàm trong
# scripts/lib-smoke.sh: kiem, ma_http, sql, sql_loi, kc, lay_token…), không chạy riêng.
# Kiểm: route công khai, JWT 401/401/200, MFA cán bộ, RLS từng vai trò.
# can_bo/lanh_dao bắt buộc OTP nên RLS của hai vai trò này kiểm trong CSDL bằng
# SET ROLE + request.jwt.claims, đúng như PostgREST làm cho mỗi request.

# --- Route công khai (role anon) -------------------------------------------------
kiem "GET /public/thu_tuc → 200" "200" "$(ma_http "$GW/public/thu_tuc")"
kiem "anon thấy 3 thủ tục mẫu" "3" "$(curl -s "$GW/public/thu_tuc" | jq length)"
kiem "anon đọc /public/ho_so → 401 (không có quyền)" "401" "$(ma_http "$GW/public/ho_so")"
kiem "anon ghi qua /public (POST) → 404 (route chỉ GET)" "404" \
  "$(ma_http -X POST -H 'Content-Type: application/json' -d '{}' "$GW/public/ho_so")"
kiem "anon: SELECT ho_so trong CSDL bị chặn" "permission denied for table ho_so" \
  "$(sql_loi "SET ROLE anon; SELECT count(*) FROM mot_cua.ho_so")"

# --- MFA: cán bộ, lãnh đạo bị bắt cài OTP; công dân thì không ---------------------
MK="smoke-$(openssl rand -hex 12)"
for u in congdan01 canbo01 lanhdao01; do dat_mat_khau "$u" "$MK"; done
for u in canbo01 lanhdao01; do
  kiem "$u có required action CONFIGURE_TOTP" '["CONFIGURE_TOTP"]' \
    "$(kc get users -r dxos -q "username=$u" -q exact=true --fields requiredActions | jq -c '.[0].requiredActions')"
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

# --- JWT qua APISIX: 401 / 401 / 200 ------------------------------------------------
kiem "/api/ho_so không token → 401" "401" "$(ma_http "$GW/api/ho_so")"
kiem "/api/ho_so token sửa chữ ký → 401" "401" \
  "$(ma_http -H "Authorization: Bearer ${TOKEN%?????}AAAAA" "$GW/api/ho_so")"
kiem "/api/ho_so token công dân → 200" "200" "$(ma_http -H "Authorization: Bearer $TOKEN" "$GW/api/ho_so")"

# --- RLS cong_dan qua API ------------------------------------------------------------
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
truoc="$(curl -s "${AUTH[@]}" "$GW/api/ho_so" | jq length)"
moi="$(curl -s "${AUTH[@]}" -H 'Prefer: return=representation' \
  -d '{"ma_thu_tuc":"KS01","ho_ten_nguoi_nop":"Người Thử Smoke"}' "$GW/api/ho_so")"
ID_MOI="$(jq -r '.[0].id // empty' <<<"$moi")"
kiem "cong_dan nộp hồ sơ → có id" "có" "$([ -n "$ID_MOI" ] && echo có || echo không)"
kiem "cong_dan: nguoi_nop_sub = sub của token" "$SUB" "$(jq -r '.[0].nguoi_nop_sub' <<<"$moi")"
ds="$(curl -s "${AUTH[@]}" "$GW/api/ho_so")"
kiem "cong_dan thấy thêm đúng 1 hồ sơ" "$((truoc + 1))" "$(jq length <<<"$ds")"
kiem "cong_dan chỉ thấy hồ sơ của mình" "true" "$(jq --arg s "$SUB" 'all(.[]; .nguoi_nop_sub == $s)' <<<"$ds")"
kiem "cong_dan tự đặt trang_thai → 403" "403" \
  "$(ma_http "${AUTH[@]}" -d '{"ma_thu_tuc":"KS01","ho_ten_nguoi_nop":"X","trang_thai":"hoan_tat"}' "$GW/api/ho_so")"
kiem "cong_dan PATCH hồ sơ → 403" "403" \
  "$(ma_http -X PATCH "${AUTH[@]}" -d '{"trang_thai":"hoan_tat"}' "$GW/api/ho_so?id=eq.$ID_MOI")"
kiem "cong_dan (sub giả c001) trong CSDL chỉ thấy 1 hồ sơ" "1" \
  "$(sql "SET ROLE cong_dan; SET request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000c001\"}'; SELECT count(*) FROM mot_cua.ho_so" | tail -1)"

# --- RLS can_bo, lanh_dao trong CSDL -------------------------------------------------
TONG="$(sql "SELECT count(*) FROM mot_cua.ho_so")"
kiem "can_bo thấy tất cả hồ sơ ($TONG)" "$TONG" "$(sql "SET ROLE can_bo; SELECT count(*) FROM mot_cua.ho_so" | tail -1)"
kiem "lanh_dao thấy tất cả hồ sơ ($TONG)" "$TONG" "$(sql "SET ROLE lanh_dao; SELECT count(*) FROM mot_cua.ho_so" | tail -1)"
# Trong một transaction rồi ROLLBACK: đóng hồ sơ (1 dòng), sửa tiếp hồ sơ đã đóng (0 dòng).
kiem "can_bo đóng hồ sơ đang mở → 1 dòng; sửa hồ sơ đã đóng → 0 dòng" "1 0" "$(docker compose exec -T postgres psql -XqtA -v ON_ERROR_STOP=1 \
  -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-commune}" <<SQL | tr '\n' ' ' | sed 's/ $//'
BEGIN;
SET LOCAL ROLE can_bo;
WITH u AS (UPDATE mot_cua.ho_so SET trang_thai = 'hoan_tat' WHERE id = $ID_MOI RETURNING 1) SELECT count(*) FROM u;
WITH u AS (UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = $ID_MOI RETURNING 1) SELECT count(*) FROM u;
ROLLBACK;
SQL
)"
kiem "can_bo không được nộp hồ sơ" "permission denied for table ho_so" \
  "$(sql_loi "SET ROLE can_bo; INSERT INTO mot_cua.ho_so (ma_thu_tuc, ho_ten_nguoi_nop) VALUES ('KS01', 'X')")"
kiem "lanh_dao không được sửa hồ sơ" "permission denied for table ho_so" \
  "$(sql_loi "SET ROLE lanh_dao; UPDATE mot_cua.ho_so SET trang_thai = 'hoan_tat'")"
