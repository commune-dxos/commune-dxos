#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Smoke API tệp hồ sơ (#7), được apps/mot-cua/tests/smoke.sh `source` sau mục 4d (dùng
# lại token TOKEN/TK_CB/TK_LD, cán bộ tạm CB_ID, lĩnh vực LV_HT, thủ tục KS_ID). Mọi lời gọi
# đi qua APISIX như client thật:
#   tải PDF hợp lệ → lưu Garage + metadata; EICAR → chặn, không có object, có nhật ký;
#   giả mạo đuôi → 415; quá cỡ → 413; quyền theo vai trò/lĩnh vực; link ký sẵn hết hạn.
# Tệp EICAR (chuỗi thử chuẩn, vô hại) được giải mã lúc chạy, không nằm nguyên văn trong repo.

TD="$(mktemp -d)"
BUCKET=mot-cua-ho-so

# tai <token> <hồ sơ> <tên tệp> <Content-Type> <tệp> → mã HTTP; body response ở $TD/tra.json
tai() {
  local ten
  ten="$(jq -rn --arg s "$3" '$s|@uri')"
  curl -s -o "$TD/tra.json" -w '%{http_code}' ${1:+-H "Authorization: Bearer $1"} \
    -H "Content-Type: $4" --data-binary "@$5" "$GW/files/ho-so/$2/tep?ten=$ten"
}
# xem <token> <id tệp> [query] → mã HTTP; body ở $TD/xem.json
xem() {
  curl -s -o "$TD/xem.json" -w '%{http_code}' -H "Authorization: Bearer $1" "$GW/files/tep/$2${3:+?$3}"
}
# so_object <tiền tố> → số object trong bucket (ListObjectsV2 ký bằng khóa của ứng dụng,
# chạy trong app-backend: khóa không ra khỏi container)
so_object() {
  docker compose exec -T app-backend python - "$1" <<'PY'
import hashlib, json, re, sys, urllib.parse, urllib.request
sys.path.insert(0, "/app/backend")
import tep
c = json.load(open("/run/dxos-secrets/s3.json"))
url = f"{c['endpoint']}/mot-cua-ho-so?list-type=2&prefix={urllib.parse.quote(sys.argv[1], safe='')}"
h = tep.ky_header("GET", url, c["region"], c["accessKeyId"], c["secretAccessKey"], hashlib.sha256(b"").hexdigest())
print(len(re.findall(r"<Key>", urllib.request.urlopen(urllib.request.Request(url, headers=h)).read().decode())))
PY
}
nhat_ky() { sql "SELECT count(*) FROM mot_cua.nhat_ky_tep WHERE ho_so_id = '$1' AND hanh_dong = '$2'"; }

if [ -z "${KS_ID:-}" ] || [ -z "${LV_HT:-}" ]; then
  kiem "có thủ tục KS01, lĩnh vực ho_tich để chạy smoke tệp (DXOS_SEED=true)" "có" "không"
else
  echo "== Tệp hồ sơ (/files, #7)"
  # Hạ tầng: dịch vụ chạy, khóa của ứng dụng chỉ có quyền trên bucket đã khai báo.
  kiem "clamd trả lời VERSION" "ClamAV" \
    "$(docker compose exec -T app-backend python -c 'import sys; sys.path.insert(0, "/app/backend"); import tep; print(tep.phien_ban_clamav("clamav", 3310).split()[0])')"
  ki="$(docker compose exec -T garage /garage key info "dxos-app-$DXOS_APP" 2>/dev/null)"
  kiem "khóa S3 của ứng dụng: không được tạo bucket" "false" "$(awk -F': *' '/Can create buckets/ {print $2}' <<<"$ki" | tr -d ' ')"
  kiem "khóa S3 của ứng dụng: chỉ RW trên $BUCKET" "RW $BUCKET" \
    "$(awk '/BUCKETS FOR THIS KEY/ {f=1; next} f && NF >= 3 && $1 != "Permissions" {print $1, $3}' <<<"$ki" | paste -sd, -)"
  kiem "tệp khóa S3 trong volume bí mật chỉ chủ đọc được (600)" "600" \
    "$(docker compose exec -T app-backend stat -c %a /run/dxos-secrets/s3.json)"
  kiem "khóa S3 không nằm trong biến môi trường của app-backend" "0" \
    "$(docker compose exec -T app-backend env | grep -ci 'secretaccesskey\|aws_secret' || true)"

  # Tệp thử.
  printf '%%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%%%EOF\n' > "$TD/to-khai.pdf"
  printf 'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=' \
    | base64 -d > "$TD/eicar.pdf"
  printf '<html><script>alert(1)</script></html>\n' > "$TD/gia-mao.pdf"
  { printf '%%PDF-1.4\n'; head -c $((11 * 1024 * 1024)) /dev/zero; } > "$TD/qua-co.pdf"

  # Hồ sơ KS01 mới của congdan01 (trạng thái moi).
  hs="$(curl -s "${AUTH[@]}" "${REP[@]}" \
    -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Tệp\"}" "$GW/api/ho_so")"
  HT="$(jq -r '.[0].id // empty' <<<"$hs")"
  YC_KS="$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id = '$KS_ID' ORDER BY thu_tu LIMIT 1")"

  kiem "/files tải lên không token → 401" "401" "$(tai "" "$HT" a.pdf application/pdf "$TD/to-khai.pdf")"
  kiem "cong_dan ghi thẳng metadata qua /api/thanh_phan_ho_so (bỏ qua quét) → 403" "403" \
    "$(ma_http "${AUTH[@]}" -d "{\"ho_so_id\":\"$HT\",\"ten_tep\":\"x.pdf\",\"loai_mime\":\"application/pdf\",\"kich_thuoc\":10}" \
       "$GW/api/thanh_phan_ho_so")"

  # 1. PDF hợp lệ → 201, object trong Garage, dòng metadata đủ dấu vết.
  ma="$(tai "$TOKEN" "$HT" "Tờ khai khai sinh.pdf" application/pdf "$TD/to-khai.pdf")"
  TEP_ID="$(jq -r '.id // empty' "$TD/tra.json")"
  kiem "cong_dan tải PDF hợp lệ (tên tiếng Việt) → 201" "201" "$ma"
  SHA="$(shasum -a 256 "$TD/to-khai.pdf" | cut -d' ' -f1)"; CO="$(wc -c < "$TD/to-khai.pdf" | tr -d ' ')"
  kiem "metadata: tên, sha256, kích thước, người tải, quét sạch, object dưới tiền tố hồ sơ" \
    "Tờ khai khai sinh.pdf|$SHA|$CO|$SUB|sach|t|t" \
    "$(sql "SELECT concat_ws('|', ten_tep, sha256, kich_thuoc, nguoi_tai_sub, ket_qua_quet,
              object_key LIKE 'ho-so/$HT/%.pdf', may_quet LIKE 'ClamAV %')
            FROM mot_cua.thanh_phan_ho_so WHERE id = '${TEP_ID:-00000000-0000-0000-0000-000000000000}'")"
  kiem "Garage có đúng 1 object của hồ sơ" "1" "$(so_object "ho-so/$HT/")"
  kiem "tải kèm thành phần yêu cầu của thủ tục → 201" "201" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' \
       --data-binary "@$TD/to-khai.pdf" "$GW/files/ho-so/$HT/tep?ten=to-khai.pdf&thanh_phan_yeu_cau_id=$YC_KS")"
  kiem "thành phần yêu cầu không thuộc thủ tục → 400, không để lại object" "400 2" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/pdf' \
       --data-binary "@$TD/to-khai.pdf" \
       "$GW/files/ho-so/$HT/tep?ten=x.pdf&thanh_phan_yeu_cau_id=$(sql "SELECT id FROM mot_cua.thanh_phan_yeu_cau WHERE thu_tuc_id <> '$KS_ID' LIMIT 1")") $(so_object "ho-so/$HT/")"

  # 2. EICAR → 422, không lưu object hay metadata, có nhật ký.
  truoc="$(sql "SELECT count(*) FROM mot_cua.thanh_phan_ho_so WHERE ho_so_id = '$HT'")"
  kiem "tải tệp mẫu EICAR (đuôi .pdf) → 422 mã độc" "422" "$(tai "$TOKEN" "$HT" eicar.pdf application/pdf "$TD/eicar.pdf")"
  kiem "EICAR: response nêu mẫu virus" "true" "$(jq '.chiTiet.maDoc | test("eicar"; "i")' "$TD/tra.json")"
  kiem "EICAR: không thêm object nào vào Garage" "2" "$(so_object "ho-so/$HT/")"
  kiem "EICAR: không thêm dòng metadata" "$truoc" "$(sql "SELECT count(*) FROM mot_cua.thanh_phan_ho_so WHERE ho_so_id = '$HT'")"
  kiem "EICAR: nhật ký tu_choi_ma_doc có người tải, sha256, tên mẫu virus" "1|$SUB|t|t" \
    "$(sql "SELECT concat_ws('|', count(*), max(nguoi_sub), bool_and(sha256 = '$(shasum -a 256 "$TD/eicar.pdf" | cut -d' ' -f1)'),
              bool_and(chi_tiet ILIKE '%eicar%')) FROM mot_cua.nhat_ky_tep WHERE ho_so_id = '$HT' AND hanh_dong = 'tu_choi_ma_doc'")"

  # 3. Loại tệp: giả mạo, đuôi lạ, Content-Type lệch; 4. kích thước.
  kiem "tệp giả mạo (đuôi .pdf, nội dung HTML) → 415" "415" "$(tai "$TOKEN" "$HT" gia-mao.pdf application/pdf "$TD/gia-mao.pdf")"
  kiem "giả mạo: có nhật ký tu_choi_loai_tep, không có object mới" "1 2" "$(nhat_ky "$HT" tu_choi_loai_tep) $(so_object "ho-so/$HT/")"
  kiem "đuôi .exe → 415" "415" "$(tai "$TOKEN" "$HT" setup.exe application/pdf "$TD/to-khai.pdf")"
  kiem "PDF nhưng khai Content-Type image/png → 415" "415" "$(tai "$TOKEN" "$HT" a.pdf image/png "$TD/to-khai.pdf")"
  kiem "PDF giả làm ảnh (a.png, image/png) → 415" "415" "$(tai "$TOKEN" "$HT" a.png image/png "$TD/to-khai.pdf")"
  kiem "tệp 11 MiB (giới hạn 10 MiB) → 413 ở gateway" "413" "$(tai "$TOKEN" "$HT" lon.pdf application/pdf "$TD/qua-co.pdf")"

  # 5. Quyền tải lên.
  kiem "cán bộ tải tệp lên → 403" "403" "$(tai "$TK_CB" "$HT" a.pdf application/pdf "$TD/to-khai.pdf")"
  kiem "lãnh đạo tải tệp lên → 403" "403" "$(tai "$TK_LD" "$HT" a.pdf application/pdf "$TD/to-khai.pdf")"
  dat_mat_khau congdan02 "$MK"
  TOKEN2="$(lay_token congdan02 "$MK" | jq -r '.access_token // empty')"
  kiem "công dân khác tải vào hồ sơ không phải của mình → 404 (RLS)" "404" \
    "$(tai "$TOKEN2" "$HT" a.pdf application/pdf "$TD/to-khai.pdf")"
  hs2="$(curl -s "${AUTH[@]}" "${REP[@]}" -d "{\"thu_tuc_id\":\"$KS_ID\",\"ho_ten_nguoi_nop\":\"Người Thử Tệp 2\"}" "$GW/api/ho_so")"
  HT2="$(jq -r '.[0].id // empty' <<<"$hs2")"
  sql "UPDATE mot_cua.ho_so SET trang_thai = 'dang_xu_ly' WHERE id = '$HT2'" > /dev/null
  kiem "tải vào hồ sơ của mình đang xử lý → 409" "409" "$(tai "$TOKEN" "$HT2" a.pdf application/pdf "$TD/to-khai.pdf")"

  # 6. Xem tệp: link ký sẵn qua /files/s3, theo RLS của người gọi.
  kiem "cong_dan xem tệp của mình → 200 kèm link" "200 true" \
    "$(xem "$TOKEN" "$TEP_ID") $(jq '.link | startswith("'"$GW"'/files/s3/'"$BUCKET"'/ho-so/")' "$TD/xem.json")"
  LINK="$(jq -r .link "$TD/xem.json")"
  kiem "link: tải về đúng nội dung (sha256), Content-Type PDF, nosniff" "$SHA application/pdf nosniff" \
    "$(curl -s "$LINK" | shasum -a 256 | cut -d' ' -f1) $(header_http Content-Type "$LINK") $(header_http X-Content-Type-Options "$LINK")"
  kiem "link không chứa secret của khóa S3" "0" \
    "$(docker compose exec -T app-backend python -c 'import json,sys; print(int(json.load(open("/run/dxos-secrets/s3.json"))["secretAccessKey"] in sys.stdin.read()))' <<<"$LINK")"
  ky="${LINK#*X-Amz-Signature=}"; ky="${ky:0:1}"
  kiem "link bị sửa chữ ký → 403" "403" \
    "$(ma_http "${LINK/X-Amz-Signature=$ky/X-Amz-Signature=$([ "$ky" = 0 ] && echo 1 || echo 0)}")"
  kiem "link bị đổi sang object khác → 403" "403" "$(ma_http "${LINK/ho-so\/$HT\//ho-so\/$HT2\/}")"
  kiem "GET thẳng object không có chữ ký → 403" "403" \
    "$(ma_http "$GW/files/s3/$BUCKET/$(sql "SELECT object_key FROM mot_cua.thanh_phan_ho_so WHERE id = '$TEP_ID'")")"
  kiem "ghi thẳng Garage qua gateway (PUT /files/s3/…) không token → 401" "401" \
    "$(ma_http -X PUT --data-binary "@$TD/to-khai.pdf" "$GW/files/s3/$BUCKET/ho-so/x.pdf")"
  kiem "ttl vượt giới hạn → 400" "400" "$(xem "$TOKEN" "$TEP_ID" "ttl=999999")"
  xem "$TOKEN" "$TEP_ID" "ttl=1" > /dev/null
  LINK_NGAN="$(jq -r .link "$TD/xem.json")"
  sleep 3
  # Garage từ chối link quá hạn bằng 400 InvalidRequest "Date is too old" (AWS S3 dùng 403).
  kiem "link ttl 1 giây, sau 3 giây → 400 Date is too old (hết hạn, không tải được)" "400 true" \
    "$(ma_http "$LINK_NGAN") $(curl -s "$LINK_NGAN" | grep -q 'Date is too old' && echo true || echo false)"

  kiem "cán bộ lĩnh vực hộ tịch xem tệp → 200, link tải được" "200 200" \
    "$(xem "$TK_CB" "$TEP_ID") $(ma_http "$(jq -r .link "$TD/xem.json")")"
  kiem "cán bộ: danh sách tệp của hồ sơ → 2 tệp" "2" \
    "$(curl -s -H "Authorization: Bearer $TK_CB" "$GW/files/ho-so/$HT/tep" | jq length)"
  kiem "lãnh đạo xem tệp → 200" "200" "$(xem "$TK_LD" "$TEP_ID")"
  kiem "công dân khác xem tệp → 403" "403" "$(xem "$TOKEN2" "$TEP_ID")"
  kiem "công dân khác xem danh sách tệp của hồ sơ → 403" "403" \
    "$(ma_http -H "Authorization: Bearer $TOKEN2" "$GW/files/ho-so/$HT/tep")"
  kiem "xem tệp không tồn tại → 404" "404" "$(xem "$TOKEN" 00000000-0000-4000-8000-000000000000)"
  kiem "xem tệp không token → 401" "401" "$(ma_http "$GW/files/tep/$TEP_ID")"
  sql "DELETE FROM mot_cua.can_bo_linh_vuc WHERE can_bo_id = '$CB_ID' AND linh_vuc_id = '$LV_HT'" > /dev/null
  kiem "cán bộ sai lĩnh vực (bỏ phân công hộ tịch) xem tệp → 403" "403" "$(xem "$TK_CB" "$TEP_ID")"
  kiem "nhật ký: có tai_len (2) và cap_link" "2 true" \
    "$(nhat_ky "$HT" tai_len) $([ "$(nhat_ky "$HT" cap_link)" -ge 4 ] && echo true || echo false)"
  kiem "lãnh đạo đọc nhật ký tệp qua /api → 200; công dân → 403" "200 403" \
    "$(ma_http -H "Authorization: Bearer $TK_LD" "$GW/api/nhat_ky_tep") $(ma_http -H "Authorization: Bearer $TOKEN" "$GW/api/nhat_ky_tep")"
fi
rm -rf "$TD"
