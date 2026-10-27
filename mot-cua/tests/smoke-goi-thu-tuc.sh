#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke gói thủ tục (D-009), được mot-cua/tests/smoke.sh `source` sau mục 4f (dùng kiem, sql,
# wf, gw, gw_ma, task_cua và TOKEN, TK_CB, TK_LD, CB_ID, HAU_TO do smoke.sh đặt). Kiểm:
#   1. Danh mục /public/thu_tuc có đúng các gói trong thu-tuc/, Flowable có quy trình của từng gói.
#   2. nap-thu-tuc chạy lại: mã 0, không deploy lại BPMN không đổi.
#   3. Cắm–rút thật: thêm một thư mục gói (chép từ chứng thực, đổi mã) + một gói hỏng →
#      nạp → gói mới có trong danh mục và Flowable, gói hỏng bị báo lỗi và bỏ qua; xóa thư mục
#      → nạp → thủ tục thôi có quy trình. Không sửa dòng mã nào của mot-cua/ hay nen-tang/.
#   4. Hồ sơ chứng thực bản sao (CT01) chạy hết quy trình qua /workflow: hạn trong ngày, biến
#      từng bước theo formProperty của gói (sai kiểu/thiếu → 400), sự kiện ho_so.hoan_tat.
echo "-- gói thủ tục (thu-tuc/, D-009)"

# shellcheck disable=SC2010  # tên thư mục gói chỉ gồm [a-z0-9-]
GOI_LIST="$(ls -1 thu-tuc | grep -E '^[a-z0-9][a-z0-9-]+$' | grep -v '^zz-smoke-' | sort | paste -sd, -)"
SO_GOI="$(tr ',' '\n' <<<"$GOI_LIST" | grep -c .)"
kiem "thu-tuc/ có ít nhất 2 gói" "true" "$([ "$SO_GOI" -ge 2 ] && echo true || echo false)"
dm="$(curl -s "$GW/public/thu_tuc?goi=not.is.null&select=ma,goi,quy_trinh,so_ngay_xu_ly,thanh_phan_yeu_cau(ma,bat_buoc)&order=goi")"
kiem "GET /public/thu_tuc: đúng các gói trong thu-tuc/ ($GOI_LIST)" "$GOI_LIST" \
  "$(jq -r '[.[].goi] | join(",")' <<<"$dm")"
kiem "danh mục: khai-sinh → KS01, chung-thuc-ban-sao → CT01" "chung-thuc-ban-sao:CT01,khai-sinh:KS01" \
  "$(jq -r '[.[] | select(.goi == "khai-sinh" or .goi == "chung-thuc-ban-sao") | "\(.goi):\(.ma)"] | join(",")' <<<"$dm")"
for g in $(tr ',' ' ' <<<"$GOI_LIST"); do
  pid="$(sed -n 's/^quy_trinh: *//p' "thu-tuc/$g/thu-tuc.yaml")"
  kiem "gói $g: danh mục có quy trình $pid" "$pid" "$(jq -r --arg g "$g" '.[] | select(.goi == $g) | .quy_trinh' <<<"$dm")"
  kiem "gói $g: Flowable có quy trình $pid (nap-thu-tuc deploy, không tự quét thư mục)" "1" \
    "$(wf "repository/process-definitions?key=$pid&latest=true" | jq .total)"
done
kiem "CT01: hạn trong ngày (0 ngày làm việc)" "0" "$(jq -r '.[] | select(.ma == "CT01") | .so_ngay_xu_ly' <<<"$dm")"
kiem "CT01: thành phần theo schema của gói" "ban_chinh:true,ban_sao:false" \
  "$(jq -r '.[] | select(.ma == "CT01") | [.thanh_phan_yeu_cau[] | "\(.ma):\(.bat_buoc)"] | sort | join(",")' <<<"$dm")"
kiem "JSON Schema CT01 qua /public/rpc lấy đúng tệp của gói" \
  "$(jq -c '.properties.thanh_phan.required' thu-tuc/chung-thuc-ban-sao/thanh-phan-ho-so.schema.json)" \
  "$(curl -s "$GW/public/rpc/json_schema_thu_tuc?ma=CT01" | jq -c '.properties.thanh_phan.required')"

# Dữ liệu mở (#102): bộ công bố du-lieu-mo/thu-tuc-cap-xa/ khớp hệ thống đang chạy – cùng danh sách thủ tục công khai
# có gói, cùng thời hạn, lệ phí, thành phần bắt buộc, và JSON Schema công bố giống hệt schema API công khai trả về.
DM_MO=du-lieu-mo/thu-tuc-cap-xa/danh-muc.json
kiem "dữ liệu mở: danh mục công bố = thủ tục công khai có gói trên /public/thu_tuc (mã:thời hạn:lệ phí:thành phần bắt buộc)" \
  "$(jq -r '[.thu_tuc[] | "\(.ma):\(.thoi_han_ngay_lam_viec):\(.le_phi):\([.thanh_phan[] | select(.bat_buoc) | .ma] | sort | join("+"))"] | sort | join(",")' "$DM_MO")" \
  "$(curl -s "$GW/public/thu_tuc?goi=not.is.null&cong_khai=is.true&select=ma,so_ngay_xu_ly,le_phi,thanh_phan_yeu_cau(ma,bat_buoc)" \
     | jq -r '[.[] | "\(.ma):\(.so_ngay_xu_ly):\(.le_phi | tonumber | floor):\([.thanh_phan_yeu_cau[] | select(.bat_buoc) | .ma] | sort | join("+"))"] | sort | join(",")')"
lech_mo=""
for ma_mo in $(jq -r '.thu_tuc[].ma' "$DM_MO"); do
  [ "$(jq -cS . "du-lieu-mo/thu-tuc-cap-xa/schema/$ma_mo.schema.json")" = "$(curl -s "$GW/public/rpc/json_schema_thu_tuc?ma=$ma_mo" | jq -cS .)" ] \
    || lech_mo="$lech_mo $ma_mo"
done
kiem "dữ liệu mở: JSON Schema công bố của mọi thủ tục giống hệt /public/rpc/json_schema_thu_tuc" "" "${lech_mo# }"

# --- 2. Chạy lại bộ nạp ---------------------------------------------------------------------
if out="$(docker compose run --rm --no-deps nap-thu-tuc 2>&1)"; then ma=0; else ma=$?; fi
kiem "nap-thu-tuc lần 2: mã thoát 0" "0" "$ma"
kiem "nap-thu-tuc lần 2: không deploy lại BPMN không đổi" "0" "$(grep -c 'deploy mới' <<<"$out" || true)"
kiem "nap-thu-tuc lần 2: $SO_GOI gói đã nạp, 0 gói lỗi" "$SO_GOI 0" \
  "$(sed -n 's/.*xong: \([0-9]*\) gói đã nạp.*, \([0-9]*\) gói lỗi.*/\1 \2/p' <<<"$out")"

# --- 3. Cắm–rút: thêm thư mục là thêm thủ tục, xóa thư mục là rút --------------------------
TAM="thu-tuc/zz-smoke-$HAU_TO"; HONG="thu-tuc/zz-smoke-hong-$HAU_TO"
trap 'rm -rf "$TAM" "$HONG"' EXIT   # smoke dừng giữa chừng cũng không để lại gói tạm
cp -R thu-tuc/chung-thuc-ban-sao "$TAM"
perl -pi -e 's/^ma: CT01$/ma: ZZSMOKE/; s/^quy_trinh: .*/quy_trinh: zz_smoke_quy_trinh/; s/^cong_khai: true$/cong_khai: false/' "$TAM/thu-tuc.yaml"
perl -pi -e 's/process id="chung_thuc_ban_sao"/process id="zz_smoke_quy_trinh"/' "$TAM/quy-trinh.bpmn20.xml"
mkdir -p "$HONG"; cp thu-tuc/khai-sinh/thu-tuc.yaml "$HONG/"   # thiếu 4 tệp còn lại
if out="$(docker compose run --rm --no-deps nap-thu-tuc 2>&1)"; then ma=0; else ma=$?; fi
kiem "cắm gói mới + gói hỏng: nap-thu-tuc vẫn mã 0" "0" "$ma"
kiem "gói hỏng bị báo lỗi rõ và bỏ qua" "1" "$(grep -c "gói zz-smoke-hong-$HAU_TO LỖI, bỏ qua" <<<"$out" || true)"
kiem "gói mới vào danh mục (nội bộ), có quy trình" "zz_smoke_quy_trinh f" \
  "$(sql "SELECT quy_trinh || ' ' || left(cong_khai::text, 1) FROM mot_cua.thu_tuc WHERE ma = 'ZZSMOKE'")"
kiem "Flowable có quy trình của gói mới" "1" "$(wf "repository/process-definitions?key=zz_smoke_quy_trinh&latest=true" | jq .total)"
kiem "các gói khác vẫn nạp bình thường" "$((SO_GOI + 1))" "$(sql "SELECT count(*) FROM mot_cua.thu_tuc WHERE goi IS NOT NULL")"
rm -rf "$TAM" "$HONG"
if out="$(docker compose run --rm --no-deps nap-thu-tuc 2>&1)"; then ma=0; else ma=$?; fi
kiem "rút gói (xóa thư mục) → nạp lại mã 0, rút đúng ZZSMOKE" "0 (ZZSMOKE)" "$ma $(grep -o 'không còn gói (ZZSMOKE)' <<<"$out" | grep -o '(ZZSMOKE)')"
kiem "thủ tục đã rút thôi có quy trình, danh mục về $SO_GOI gói" "|$SO_GOI" \
  "$(sql "SELECT coalesce(quy_trinh, '') FROM mot_cua.thu_tuc WHERE ma = 'ZZSMOKE'")|$(sql "SELECT count(*) FROM mot_cua.thu_tuc WHERE goi IS NOT NULL")"

# --- 4. Hồ sơ chứng thực bản sao chạy hết quy trình qua /workflow ----------------------------
MAU_CT=thu-tuc/chung-thuc-ban-sao/du-lieu-mau.json
CT_ID="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = 'CT01' AND quy_trinh IS NOT NULL AND cong_khai")"
LV_CT="$(sql "SELECT id FROM mot_cua.linh_vuc WHERE ma = 'chung_thuc'")"
if [ -z "$CT_ID" ] || [ -z "$LV_CT" ]; then
  kiem "có thủ tục CT01 đã nạp từ gói để chạy /workflow" "có" "không"
else
  # Poka-yoke phía máy chủ (#59): chưa có bản chính thì khởi tạo → 422.
  CH0="$(curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
    -d "$(jq -c --arg t "$CT_ID" '.ho_so + {thu_tuc_id: $t}' "$MAU_CT")" "$GW/api/ho_so" | jq -r '.[0].id // "00000000-0000-0000-0000-000000000000"')"
  kiem "CT01: gọi thẳng khoi-tao khi chưa có bản chính → 422, thiếu ban_chinh" "422 ban_chinh" \
    "$(curl -s -o "$NOP_TD/ct.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" "$GW/workflow/ho-so/$CH0/khoi-tao") $(jq -r '[.chiTiet.thanhPhan[]?.thanhPhan] | join(",")' "$NOP_TD/ct.json")"
  r="$(nop_du "$TOKEN" "$(jq -c --arg t "$CT_ID" '.ho_so + {thu_tuc_id: $t}' "$MAU_CT")")"
  CH="$(jq -r '.hoSo.id // empty' <<<"$r")"; CPI="$(jq -r '.processInstanceId // empty' <<<"$r")"
  kiem "cong_dan nộp CT01 (dữ liệu mẫu của gói; tạo hồ sơ → tải bản chính → khởi tạo) → có mã hồ sơ, quy trình chung_thuc_ban_sao, bước tiep_nhan" \
    "có chung_thuc_ban_sao tiep_nhan" "$(jq -r '"\(if .hoSo.ma_ho_so then "có" else "không" end) \(.quyTrinh) \([.buocDangMo[]?.buoc] | join(","))"' <<<"$r")"
  kiem "CT01: tệp bản chính hiện trong GET /files/ho-so/{id}/tep" "$(jq -r '.soTep' <<<"$r") 1" \
    "$(so_tep_api "$TOKEN" "${CH:-00000000-0000-0000-0000-000000000000}") $(jq -r '.soTep' <<<"$r")"
  kiem "CT01: hạn xử lý trong ngày tiếp nhận (ngày làm việc kế tiếp nếu nộp ngày nghỉ)" "t" \
    "$(sql "SELECT han_xu_ly = mot_cua_noi_bo.cong_ngay_lam_viec((ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 0)
            FROM mot_cua.ho_so WHERE id = '${CH:-00000000-0000-0000-0000-000000000000}'")"
  kiem "Flowable: hanXuLyLuc = 17:00 ngày hạn" "$(sql "SELECT han_xu_ly FROM mot_cua.ho_so WHERE id = '${CH:-00000000-0000-0000-0000-000000000000}'")T17:00:00+07:00" \
    "$(wf "runtime/process-instances/$CPI/variables/hanXuLyLuc" | jq -r .value)"
  # shellcheck disable=SC2153  # CB_ID (cán bộ tạm) do mot-cua/tests/smoke.sh đặt trước khi source
  sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_CT') ON CONFLICT DO NOTHING" > /dev/null
  # xong_buoc <token> <bước> → các bước đang mở sau khi hoàn thành bước bằng biến mẫu của gói
  xong_buoc() {
    gw "$1" "/tasks/$(task_cua "$1" "$CH" "$2")/complete" "$(jq -c --arg b "$2" '{bien: .xu_ly[$b]}' "$MAU_CT")" \
      | jq -r '[.buocDangMo[]?.buoc] | join(",")'
  }
  kiem "cán bộ chứng thực: tiếp nhận → kiem_tra_ban_chinh" "kiem_tra_ban_chinh" "$(xong_buoc "$TK_CB" tiep_nhan)"
  TID="$(task_cua "$TK_CB" "$CH" kiem_tra_ban_chinh)"
  kiem "kiem_tra_ban_chinh: biến long gửi dạng chuỗi → 400" "400" \
    "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"khopBanChinh":true,"soTrang":"1"}}')"
  kiem "kiem_tra_ban_chinh: biến của gói khác (datYeuCau của khai sinh) → 400" "400" \
    "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"khopBanChinh":true,"datYeuCau":true}}')"
  kiem "cán bộ: khớp bản chính → ky_chung_thuc" "ky_chung_thuc" "$(xong_buoc "$TK_CB" kiem_tra_ban_chinh)"
  TID="$(wf "runtime/tasks?processInstanceId=$CPI" | jq -r '.data[0].id')"
  kiem "cán bộ ký chứng thực (nhóm lanh_dao) → 403" "403" "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{"daKy":true}}')"
  kiem "lãnh đạo ký chứng thực → tra_ket_qua" "tra_ket_qua" "$(xong_buoc "$TK_LD" ky_chung_thuc)"
  TID="$(task_cua "$TK_CB" "$CH" tra_ket_qua)"
  kiem "tra_ket_qua thiếu soBan (bắt buộc) → 400" "400" "$(gw_ma "$TK_CB" "/tasks/$TID/complete" '{"bien":{}}')"
  kiem "cán bộ trả kết quả → quy trình kết thúc" "" "$(xong_buoc "$TK_CB" tra_ket_qua)"
  kiem "tiến độ CT01: kết thúc Hoàn tất, đi đúng 4 bước" "ket_thuc_hoan_tat tiep_nhan,kiem_tra_ban_chinh,ky_chung_thuc,tra_ket_qua" \
    "$(gw "$TOKEN" "/ho-so/$CH/tien-do" | jq -r '.quyTrinh[0] | "\(.diemKetThuc) \([.lichSu[].buoc] | join(","))"')"
  kiem "Flowable lưu biến soBan (long) = 2, ketQua = hoan_tat" "2 hoan_tat" \
    "$(wf "history/historic-variable-instances?processInstanceId=$CPI&variableName=soBan" | jq -r '.data[0].variable.value') $(wf "history/historic-variable-instances?processInstanceId=$CPI&variableName=ketQua" | jq -r '.data[0].variable.value')"
  kiem "sự kiện ho_so.moi và ho_so.hoan_tat của hồ sơ CT01 vào hộp thư đi" "ho_so.hoan_tat,ho_so.moi" \
    "$(sql "SELECT string_agg(DISTINCT loai, ',' ORDER BY loai) FROM mot_cua.hop_thu_su_kien
            WHERE ho_so_id = '${CH:-00000000-0000-0000-0000-000000000000}' AND loai IN ('ho_so.moi', 'ho_so.hoan_tat')")"
fi

# --- 5. Mọi gói khác hai gói mẫu: chạy hết quy trình bằng dữ liệu mẫu của chính gói (#97) -------------------
# Không viết riêng gì cho từng gói: đọc thu-tuc.yaml, schema, du-lieu-mau.json (thứ tự bước = thứ tự khóa của
# "xu_ly"), người hoàn thành bước theo candidateGroups trong BPMN (lanh_dao → lãnh đạo tạm, còn lại → cán bộ tạm
# được phân công thêm lĩnh vực của gói, giữ tới mục Dọn của smoke.sh như CT01 ở mục 4). Thả một gói mới vào thu-tuc/
# là smoke tự chạy nó.
# gt_token_otp <username> <secret OTP> → access token mới (mã TOTP vừa dùng bị từ chối trong 30 giây: chờ chu kỳ sau).
gt_token_otp() {
  local tk
  tk="$(lay_token_otp "$1" "$MK" "$(ma_totp "$2")" | jq -r '.access_token // empty')"
  if [ -z "$tk" ]; then
    sleep $((31 - $(date +%s) % 30))
    tk="$(lay_token_otp "$1" "$MK" "$(ma_totp "$2")" | jq -r '.access_token // empty')"
  fi
  echo "$tk"
}
GT_CB="$(gt_token_otp "${U_CB:?}" "${OTP_CB:?}")"
GT_LD="$(gt_token_otp "${U_LD:?}" "${OTP_LD:?}")"
GT_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
for g in $(tr ',' ' ' <<<"$GOI_LIST"); do
  case "$g" in khai-sinh|chung-thuc-ban-sao) continue ;; esac
  D="thu-tuc/$g"; MAU="$D/du-lieu-mau.json"
  ma_tt="$(sed -n 's/^ma: *//p' "$D/thu-tuc.yaml")"; pid="$(sed -n 's/^quy_trinh: *//p' "$D/thu-tuc.yaml")"
  lv="$(sed -n 's/^linh_vuc: *//p' "$D/thu-tuc.yaml")"; han="$(sed -n 's/^thoi_han_ngay_lam_viec: *//p' "$D/thu-tuc.yaml")"
  TT="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = '$ma_tt' AND goi = '$g' AND quy_trinh IS NOT NULL AND cong_khai")"
  LV_G="$(sql "SELECT id FROM mot_cua.linh_vuc WHERE ma = '$lv'")"
  if [ -z "$TT" ] || [ -z "$LV_G" ]; then
    kiem "gói $g: có thủ tục $ma_tt và lĩnh vực $lv đã nạp" "có" "không"; continue
  fi
  kiem "gói $g ($ma_tt): thành phần trong danh mục khớp schema của gói (mã:bắt buộc:số tệp tối thiểu)" \
    "$(jq -r '.properties.thanh_phan as $t | [$t.properties | to_entries[] | select(.key as $k | $t.required | index($k) != null)
        | "\(.key):true:\(.value.minItems)"] | sort | join(",")' "$D/thanh-phan-ho-so.schema.json")" \
    "$(sql "SELECT string_agg(ma || ':' || bat_buoc || ':' || so_luong, ',' ORDER BY ma) FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$TT' AND bat_buoc")"
  sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_G') ON CONFLICT DO NOTHING" > /dev/null
  r="$(nop_du "$GT_CD" "$(jq -c --arg t "$TT" '.ho_so + {thu_tuc_id: $t}' "$MAU")")"
  HS_G="$(jq -r '.hoSo.id // "00000000-0000-0000-0000-000000000000"' <<<"$r")"; PI_G="$(jq -r '.processInstanceId // empty' <<<"$r")"
  kiem "gói $g: công dân nộp (tải đủ tệp tối thiểu, khởi tạo) → quy trình $pid ở bước tiep_nhan, $(sql "SELECT sum(so_luong) FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$TT' AND bat_buoc") tệp" \
    "$pid tiep_nhan $(sql "SELECT sum(so_luong) FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$TT' AND bat_buoc")" \
    "$(jq -r '"\(.quyTrinh) \([.buocDangMo[]?.buoc] | join(",")) \(.soTep)"' <<<"$r")"
  kiem "gói $g: hạn xử lý = $han ngày làm việc sau ngày nhận" "t" \
    "$(sql "SELECT han_xu_ly = mot_cua_noi_bo.cong_ngay_lam_viec((ngay_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, $han) FROM mot_cua.ho_so WHERE id = '$HS_G'")"
  T0="$(task_cua "$GT_CB" "$HS_G" tiep_nhan)"
  kiem "gói $g: biến không khai trong BPMN của gói → 400" "400" "$(gw_ma "$GT_CB" "/tasks/$T0/complete" '{"bien":{"hopLe":true,"bienLa":1}}')"
  buoc_da=""
  for b in $(jq -r '.xu_ly | keys_unsorted[]' "$MAU"); do
    nhom="$(grep -o "<userTask id=\"$b\"[^>]*" "$D/quy-trinh.bpmn20.xml" | sed -n 's/.*candidateGroups="\([^"]*\)".*/\1/p')"
    tk="$GT_CB"; [ "$nhom" = lanh_dao ] && tk="$GT_LD"
    tid="$(task_cua "$tk" "$HS_G" "$b")"
    ma_ht="$(gw_ma "$tk" "/tasks/${tid:-00000000-0000-0000-0000-000000000000}/complete" "$(jq -c --arg b "$b" '{bien: .xu_ly[$b]}' "$MAU")")"
    buoc_da="$buoc_da${buoc_da:+,}$b:$ma_ht"
  done
  kiem "gói $g: hoàn thành từng bước theo dữ liệu mẫu bằng đúng người (cán bộ $lv / lãnh đạo) → 200" \
    "$(jq -r '[.xu_ly | keys_unsorted[] | "\(.):200"] | join(",")' "$MAU")" "$buoc_da"
  kiem "gói $g: quy trình kết thúc, đi đúng các bước của dữ liệu mẫu, ketQua = hoan_tat" \
    "ket_thuc $(jq -r '[.xu_ly | keys_unsorted[]] | join(",")' "$MAU") hoan_tat" \
    "$(gw "$GT_CD" "/ho-so/$HS_G/tien-do" | jq -r '.quyTrinh[0] | "\((.diemKetThuc // "")[0:8]) \([.lichSu[].buoc] | join(","))"') $(wf "history/historic-variable-instances?processInstanceId=$PI_G&variableName=ketQua" | jq -r '.data[0].variable.value')"
  kiem "gói $g: CSDL hồ sơ hoan_tat, có sự kiện ho_so.hoan_tat" "hoan_tat 1" \
    "$(sql "SELECT trang_thai FROM mot_cua.ho_so WHERE id = '$HS_G'") $(sql "SELECT count(*) FROM mot_cua.hop_thu_su_kien WHERE ho_so_id = '$HS_G' AND loai = 'ho_so.hoan_tat'")"
done
