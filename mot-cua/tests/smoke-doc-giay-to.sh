#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke đọc giấy tờ bằng OCR + cán bộ xác nhận (#93), được mot-cua/tests/smoke.sh `source` ở mục 4q, trước khi xóa
# người dùng tạm (dùng cán bộ tạm $U_CB/$OTP_CB/$CB_ID, mật khẩu $MK, hàm kt_token_otp của smoke-kiem-toan.sh, nop_du,
# tai_giay_to, gw của smoke.sh). Ảnh là ảnh mẫu GIẢ của cổng công dân (public/mau-gia/, scripts/sinh_giay_to_gia.py).
# Dịch vụ ocr (profile ai) chưa chạy thì mục này tự bật (build image, lần đầu tải ~150 MB mô hình) rồi để chạy tiếp.
# Kiểm:
#   - OCR tắt: đọc thử → 503 có lời giải thích, tải ảnh lên vẫn 201 (nộp hồ sơ không phụ thuộc OCR), máy ghi lý do chưa đọc;
#   - dịch vụ ocr: healthy, không mở cổng, user không phải root, rootfs chỉ đọc, mô hình nằm trong volume;
#   - đọc thử ảnh giấy tờ tùy thân và giấy chứng sinh mẫu → đúng các trường; ClamAV chặn EICAR, PDF/ảnh lạ → 415; không
#     lưu gì;
#   - nộp KS01 với ảnh thật: máy đọc tệp đã lưu ở luồng nền (truong_may), công dân khai (truong_cong_dan);
#   - quyền: công dân không xác nhận được, cán bộ lĩnh vực khác không thấy, cán bộ phụ trách xác nhận có sửa một trường
#     → CSDL ghi trường đã sửa, xác nhận lần hai → 409, máy đọc lại sau xác nhận → 409;
#   - nhật ký kiểm toán giay_to.khai/doc/xac_nhan không chứa giá trị trên giấy tờ; chuỗi kiểm toán vẫn hợp lệ.

echo "== Đọc giấy tờ bằng OCR + cán bộ xác nhận (#93)"
DG_TD="$(mktemp -d)"
MAU=mot-cua/web-cong-dan/public/mau-gia
AI=(docker compose --profile core --profile ai)
DG_CD="$(lay_token congdan01 "$MK" | jq -r '.access_token // empty')"
DG_CB="$(kt_token_otp "${U_CB:?}" "${OTP_CB:?}")"
kiem "token mới của công dân, cán bộ tạm" "có có" \
  "$([ -n "$DG_CD" ] && echo có || echo không) $([ -n "$DG_CB" ] && echo có || echo không)"
# Cán bộ tạm phụ trách thêm lĩnh vực hộ tịch (thủ tục KS01); mục Dọn của smoke.sh xóa mọi phân công của cán bộ tạm.
LV_HT="$(sql "SELECT linh_vuc_id FROM mot_cua.thu_tuc WHERE ma = 'KS01'")"
sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_HT') ON CONFLICT DO NOTHING" > /dev/null

# dg <token> <phương thức> <đường dẫn> [tham số curl…] → mã HTTP, body ở $DG_TD/b
dg() { local tk="$1" m="$2" d="$3"; shift 3; curl -s -o "$DG_TD/b" -w '%{http_code}' -X "$m" -H "Authorization: Bearer $tk" "$@" "$GW$d"; }
doc_thu() { dg "$DG_CD" POST "/files/doc-giay-to?loai=$1" -H "Content-Type: ${3:-image/png}" --data-binary "@$2"; }
ocr_chay() { [ -n "$("${AI[@]}" ps -q --status running ocr 2>/dev/null)" ]; }

# --- OCR tắt: chức năng đọc báo rõ, nộp hồ sơ vẫn chạy -------------------------------------------------
if ocr_chay; then "${AI[@]}" stop ocr > /dev/null 2>&1; fi
kiem "OCR tắt: đọc thử → 503 kèm lời giải thích" "503 có" \
  "$(doc_thu giay_to_tuy_than "$MAU/giay-to-tuy-than.png") $(jq -r '.loi // ""' "$DG_TD/b" | grep -q 'chưa bật' && echo có || echo không)"
KS_ID="$(sql "SELECT id FROM mot_cua.thu_tuc WHERE ma = 'KS01'")"
YC_TT="$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND ma = 'giay_to_tuy_than'")"
YC_GCS="$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND ma = 'giay_chung_sinh'")"
HS_TAT="$(curl -s -H "Authorization: Bearer $DG_CD" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Trần Văn Mẫu\",\"so_dien_thoai\":\"0900000093\"}" "$GW/api/ho_so" | jq -r '.[0].id // empty')"
kiem "OCR tắt: tải ảnh giấy tờ tùy thân lên hồ sơ → 201" "201" \
  "$(dg "$DG_CD" POST "/files/ho-so/$HS_TAT/tep?ten=tuy-than.png&thanh_phan_yeu_cau_id=$YC_TT" -H 'Content-Type: image/png' \
     --data-binary "@$MAU/giay-to-tuy-than.png")"
TEP_TAT="$(jq -r '.id // empty' "$DG_TD/b")"
for _ in $(seq 1 20); do [ -n "$(sql "SELECT 1 FROM mot_cua.doc_giay_to WHERE tep_id = '$TEP_TAT'")" ] && break; sleep 1; done
kiem "OCR tắt: máy ghi chưa đọc được kèm lý do, chờ cán bộ nhập" "chua_doc có" \
  "$(sql "SELECT trang_thai || ' ' || CASE WHEN loi_doc LIKE '%chưa bật%' THEN 'có' ELSE 'không' END FROM mot_cua.doc_giay_to WHERE tep_id = '$TEP_TAT'")"

# --- Bật dịch vụ OCR --------------------------------------------------------------------------------------
echo "  (bật dịch vụ ocr, lần đầu build image và tải mô hình có thể mất vài phút)"
gioi_han 1800 "${AI[@]}" up -d --build --no-deps ocr > "$DG_TD/up.log" 2>&1 || tail -5 "$DG_TD/up.log"
for _ in $(seq 1 180); do
  st="$(docker inspect -f '{{.State.Health.Status}}' "$("${AI[@]}" ps -q ocr)" 2>/dev/null || echo khong-chay)"
  [ "$st" = healthy ] && break
  sleep 5
done
kiem "ocr healthy (mô hình đã nạp)" "healthy" "$st"
kiem "ocr: không mở cổng ra host, user 1000, rootfs chỉ đọc" "| 1000 true" \
  "$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{$p}} {{end}}' "$("${AI[@]}" ps -q ocr)")| $("${AI[@]}" exec -T ocr id -u) $(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$("${AI[@]}" ps -q ocr)")"
kiem "ocr: trọng số trong volume (PaddleOCR + VietOCR), không trong image" "có có" \
  "$("${AI[@]}" exec -T ocr sh -c 'test -s /models/vietocr/vgg_transformer.pth && echo có || echo không; test -d /models/paddlex/official_models/PP-OCRv5_mobile_det && echo có || echo không' | tr '\n' ' ' | sed 's/ $//')"

# --- Đọc thử (tự điền form, không lưu) ---------------------------------------------------------------------
DT_TRUOC="$(sql "SELECT count(*) FROM mot_cua.doc_giay_to")"
kiem "đọc thử giấy tờ tùy thân mẫu → đúng họ tên, số định danh, ngày sinh, giới tính" \
  "200|Trần Văn Mẫu|000090001234|01/01/1990|Nam" \
  "$(doc_thu giay_to_tuy_than "$MAU/giay-to-tuy-than.png")|$(jq -r '[.truong.ho_ten.gia_tri, .truong.so_dinh_danh.gia_tri, .truong.ngay_sinh.gia_tri, .truong.gioi_tinh.gia_tri] | join("|")' "$DG_TD/b")"
kiem "đọc thử giấy chứng sinh mẫu → đủ 8 trường, họ tên mẹ, ngày sinh con, tên con đúng" \
  "200 8|Nguyễn Thị Mẫu Thử|12/10/2026|Trần Văn Thử Nghiệm" \
  "$(doc_thu giay_chung_sinh "$MAU/giay-chung-sinh.png") $(jq -r '"\(.truong | length)|\(.truong.ho_ten_me.gia_tri)|\(.truong.ngay_sinh_con.gia_tri)|\(.truong.ten_con.gia_tri)"' "$DG_TD/b")"
# Chuỗi thử EICAR (vô hại) giải mã lúc chạy như smoke-tep.sh, không nằm nguyên văn trong repo.
printf 'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=' \
  | base64 -d > "$DG_TD/eicar.png"
kiem "đọc thử tệp EICAR → 422 (ClamAV chặn trước khi đọc)" "422" "$(doc_thu giay_to_tuy_than "$DG_TD/eicar.png")"
printf '%%PDF-1.4\n%%%%EOF\n' > "$DG_TD/a.pdf"
kiem "đọc thử PDF, loại giấy tờ lạ → 415, 404" "415 404" \
  "$(doc_thu giay_to_tuy_than "$DG_TD/a.pdf" application/pdf) $(doc_thu khong_co "$MAU/giay-to-tuy-than.png")"
kiem "đọc thử không có token → 401 ở gateway" "401" \
  "$(ma_http -H 'Content-Type: image/png' --data-binary "@$MAU/giay-to-tuy-than.png" "$GW/files/doc-giay-to?loai=giay_to_tuy_than")"
kiem "đọc thử không lưu gì vào CSDL" "$DT_TRUOC" "$(sql "SELECT count(*) FROM mot_cua.doc_giay_to")"

# --- Nộp KS01 với ảnh thật: máy đọc nền + công dân khai -------------------------------------------------------
HS="$(curl -s -H "Authorization: Bearer $DG_CD" -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Trần Văn Mẫu\",\"so_dien_thoai\":\"0900000093\"}" "$GW/api/ho_so" | jq -r '.[0].id // empty')"
dg "$DG_CD" POST "/files/ho-so/$HS/tep?ten=tuy-than.png&thanh_phan_yeu_cau_id=$YC_TT" -H 'Content-Type: image/png' \
  --data-binary "@$MAU/giay-to-tuy-than.png" > /dev/null
TEP_TT="$(jq -r '.id // empty' "$DG_TD/b")"
dg "$DG_CD" POST "/files/ho-so/$HS/tep?ten=gcs.png&thanh_phan_yeu_cau_id=$YC_GCS" -H 'Content-Type: image/png' \
  --data-binary "@$MAU/giay-chung-sinh.png" > /dev/null
TEP_GCS="$(jq -r '.id // empty' "$DG_TD/b")"
YC_TK="$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' AND ma = 'to_khai'")"
tai_giay_to "$DG_CD" "$HS" "$YC_TK" > /dev/null
kiem "công dân khai thông tin giấy tờ tùy thân (sửa quê quán) → 200" "200" \
  "$(dg "$DG_CD" POST "/files/tep/$TEP_TT/khai" -H 'Content-Type: application/json' \
     -d '{"truong":{"ho_ten":"Trần Văn Mẫu","so_dinh_danh":"000090001234","que_quan":"Xã Mẫu, tỉnh Thử Nghiệm"}}')"
kiem "khai trường không thuộc loại giấy tờ → 400" "400" \
  "$(dg "$DG_CD" POST "/files/tep/$TEP_TT/khai" -H 'Content-Type: application/json' -d '{"truong":{"mat_khau":"x"}}')"
kiem "khởi tạo quy trình KS01 → bước tiếp nhận" "tiep_nhan" \
  "$(gw "$DG_CD" "/ho-so/$HS/khoi-tao" '{}' | jq -r '.buocDangMo[0].buoc // .loi')"
for _ in $(seq 1 60); do
  [ "$(sql "SELECT count(*) FROM mot_cua.doc_giay_to WHERE tep_id IN ('$TEP_TT', '$TEP_GCS') AND truong_may IS NOT NULL")" = 2 ] && break
  sleep 2
done
kiem "máy đọc nền cả hai ảnh đã lưu → cho_xac_nhan, đúng số định danh và tên con" \
  "cho_xac_nhan|000090001234 cho_xac_nhan|Trần Văn Thử Nghiệm" \
  "$(sql "SELECT trang_thai || '|' || (truong_may -> 'so_dinh_danh' ->> 'gia_tri') FROM mot_cua.doc_giay_to WHERE tep_id = '$TEP_TT'") $(sql "SELECT trang_thai || '|' || (truong_may -> 'ten_con' ->> 'gia_tri') FROM mot_cua.doc_giay_to WHERE tep_id = '$TEP_GCS'")"
kiem "kết quả đọc có cả máy đọc và công dân khai, mô hình ghi rõ" "true true VietOCR vgg_transformer" \
  "$(sql "SELECT (truong_may IS NOT NULL) || ' ' || (truong_cong_dan IS NOT NULL) || ' ' || (mo_hinh ->> 'nhan_dang') FROM mot_cua.doc_giay_to WHERE tep_id = '$TEP_TT'")"

# --- Quyền đọc/xác nhận ----------------------------------------------------------------------------------
kiem "công dân đọc kết quả hồ sơ mình qua /api → 2 dòng" "2" \
  "$(curl -s -H "Authorization: Bearer $DG_CD" "$GW/api/doc_giay_to?ho_so_id=eq.$HS&select=tep_id" | jq length)"
kiem "cán bộ phụ trách đọc qua /api → 2 dòng" "2" \
  "$(curl -s -H "Authorization: Bearer $DG_CB" "$GW/api/doc_giay_to?ho_so_id=eq.$HS&select=tep_id" | jq length)"
kiem "công dân tự xác nhận → 403" "403" \
  "$(dg "$DG_CD" POST "/files/tep/$TEP_TT/xac-nhan" -H 'Content-Type: application/json' -d '{"truong":{"ho_ten":"A"}}')"
sql "DELETE FROM mot_cua.can_bo_linh_vuc WHERE can_bo_id = '$CB_ID' AND linh_vuc_id = '$LV_HT'" > /dev/null
kiem "cán bộ không phụ trách hộ tịch xác nhận → 403" "403" \
  "$(dg "$DG_CB" POST "/files/tep/$TEP_TT/xac-nhan" -H 'Content-Type: application/json' -d '{"truong":{"ho_ten":"A"}}')"
sql "INSERT INTO mot_cua.can_bo_linh_vuc (can_bo_id, linh_vuc_id) VALUES ('$CB_ID', '$LV_HT')" > /dev/null
DAU="$(sql "SELECT stt FROM mot_cua.dau_chuoi_kiem_toan")"
kiem "cán bộ đọc lại bằng máy → 200, vẫn chờ xác nhận" "200 cho_xac_nhan" \
  "$(dg "$DG_CB" POST "/files/tep/$TEP_GCS/doc" -H 'Content-Type: application/json' -d '{}') $(jq -r .trang_thai "$DG_TD/b")"
kiem "cán bộ xác nhận (sửa nơi thường trú so với máy) → 200, CSDL ghi trường đã sửa" '200 da_xac_nhan ["noi_thuong_tru"]' \
  "$(dg "$DG_CB" POST "/files/tep/$TEP_TT/xac-nhan" -H 'Content-Type: application/json' \
     -d '{"truong":{"ho_ten":"Trần Văn Mẫu","so_dinh_danh":"000090001234","ngay_sinh":"01/01/1990","gioi_tinh":"Nam","que_quan":"Xã Mẫu, tỉnh Thử Nghiệm","noi_thuong_tru":"Thôn 1, xã Mẫu, tỉnh Thử Nghiệm"}}') $(jq -r .trang_thai "$DG_TD/b") $(jq -c .truong_da_sua "$DG_TD/b")"
kiem "xác nhận lần hai → 409" "409" \
  "$(dg "$DG_CB" POST "/files/tep/$TEP_TT/xac-nhan" -H 'Content-Type: application/json' -d '{"truong":{"ho_ten":"Khác"}}')"
kiem "máy đọc lại tệp đã xác nhận → 409" "409" "$(dg "$DG_CB" POST "/files/tep/$TEP_TT/doc" -H 'Content-Type: application/json' -d '{}')"
kiem "công dân khai lại sau xác nhận (hồ sơ đã tiếp nhận) → bị chặn (409)" "409" \
  "$(dg "$DG_CD" POST "/files/tep/$TEP_TT/khai" -H 'Content-Type: application/json' -d '{"truong":{"ho_ten":"Khác"}}')"

# --- Kiểm toán ------------------------------------------------------------------------------------------
kiem "nhật ký kiểm toán: một bản ghi xác nhận, người xác nhận là cán bộ tạm, có tên trường đã sửa" \
  "1|${SUB_CB:-?}|[\"noi_thuong_tru\"]" \
  "$(sql "SELECT count(*) || '|' || max(nguoi_sub) || '|' || max((du_lieu -> 'truongDaSua')::text)
          FROM mot_cua.nhat_ky_kiem_toan WHERE stt > $DAU AND doi_tuong_id = '$HS' AND hanh_dong = 'giay_to.xac_nhan'")"
kiem "nhật ký kiểm toán: máy đọc và công dân khai của hồ sơ đều được ghi" "có có" \
  "$(for h in giay_to.doc giay_to.khai; do [ "$(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong_id = '$HS' AND hanh_dong = '$h'")" -ge 1 ] && echo có || echo không; done | tr '\n' ' ' | sed 's/ $//')"
kiem "nhật ký kiểm toán của hồ sơ không chứa giá trị trên giấy tờ" "0" \
  "$(sql "SELECT count(*) FROM mot_cua.nhat_ky_kiem_toan WHERE doi_tuong_id = '$HS' AND (du_lieu::text LIKE '%000090001234%' OR du_lieu::text LIKE '%Thử Nghiệm%')")"
kiem "chuỗi kiểm toán vẫn hợp lệ" "true" "$(sql "SELECT mot_cua.xac_minh_kiem_toan() ->> 'hopLe'")"
kiem "ocr không ghi chữ đọc được ra log" "0" \
  "$("${AI[@]}" logs --no-log-prefix ocr 2>/dev/null | grep -cE '000090001234|Trần Văn' || true)"
rm -rf "$DG_TD"
