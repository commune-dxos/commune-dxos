#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke trợ lý thủ tục hành chính (RAG, #91), được mot-cua/tests/smoke.sh `source` ở mục 4p (dùng kiem, sql,
# ma_http, gioi_han của scripts/lib-smoke.sh). Mọi câu hỏi đi qua APISIX /tro-ly như cổng công dân.
# Kiểm:
#   - Meilisearch healthy, không mở cổng; meili-init chạy lại không đổi gì; khóa API của Tầng 2 chỉ dùng được
#     index mot-cua-* (tạo index khác, xóa index, đọc danh sách khóa → 403);
#   - kho tri thức nạp đủ: số đoạn trong Meilisearch = trong mot_cua.tri_thuc_doan = số đoạn của repo;
#   - chế độ đang chạy (LLM_PROVIDER của .env, mặc định tat = chỉ tìm kiếm): hỏi → tài liệu liên quan, không có
#     câu trả lời sinh, có thông báo; tìm không dấu; lỗi đầu vào 400/405/413;
#   - chế độ gia-lap (đổi tạm container tro-ly, không tải mô hình): nap-tri-thuc nhúng mọi đoạn vào pgvector, chạy
#     lại không nhúng lại; câu trả lời có trích dẫn [n] trỏ đúng nguồn, tìm ngữ nghĩa chạy, lọc theo mã thủ tục;
#   - mô hình hỏng (ollama ở địa chỉ không tồn tại): vẫn trả kết quả Meilisearch kèm thông báo (suy giảm êm);
#     mô hình sai giấy phép (qwen2.5:3b) bị từ chối;
#   - câu hỏi không bị ghi vào log; trang /hoi-dap của cổng công dân; giới hạn 10 câu/phút/IP (429).
# Trả container tro-ly về cấu hình của .env khi xong (kể cả khi có kiểm tra trượt).

echo "== Trợ lý thủ tục hành chính qua APISIX /tro-ly (#91)"
CHE_DO_ENV="${LLM_PROVIDER:-tat}"
TL_TD="$(mktemp -d)"

# hoi <JSON body> → body phản hồi; mã HTTP ghi vào $TL_TD/ma. Gặp 429 (lần smoke trước vừa dùng hết hạn mức) thì
# chờ tối đa 70 giây.
hoi() {
  local ma
  for _ in $(seq 1 15); do
    ma="$(curl -s -o "$TL_TD/b" -w '%{http_code}' -H 'Content-Type: application/json' -d "$1" "$GW/tro-ly/hoi")"
    [ "$ma" = 429 ] || break
    sleep 5
  done
  printf '%s' "$ma" > "$TL_TD/ma"
  cat "$TL_TD/b"
}

# doi_tro_ly [BIẾN=giá trị…]: tạo lại container tro-ly với biến môi trường cho trước (rỗng = theo .env), chờ healthy.
doi_tro_ly() {
  env "$@" docker compose up -d --no-deps tro-ly > /dev/null 2>&1
  for _ in $(seq 1 30); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q tro-ly)" 2>/dev/null)" = healthy ] && return 0
    sleep 2
  done
  return 1
}

# meili_tang2 → "<index> <số tài liệu> <mã: tạo index khác> <mã: xóa index> <mã: đọc danh sách khóa>" bằng khóa của Tầng 2
# (đọc từ OpenBao trong container tro-ly, không ra khỏi container).
meili_tang2() {
  gioi_han 60 docker compose exec -T tro-ly python - <<'PY' 2>&1
import sys
sys.path.insert(0, "/mot-cua/backend")
import tri_thuc
c = tri_thuc.MEILI.cfg()
def ma(method, path, body=None):
    return tri_thuc.goi(method, c["url"] + path, body, c["h"])
_, ds = ma("GET", f"/indexes/{c['index']}/documents?fields=id&limit=1")
print(c["index"], ds["total"], ma("POST", "/indexes", {"uid": "khac-tang2"})[0],
      ma("DELETE", f"/indexes/{c['index']}")[0], ma("GET", "/keys")[0])
PY
}

SO_DOAN="$(PYTHONDONTWRITEBYTECODE=1 python3 mot-cua/backend/nap_tri_thuc.py mot-cua/tro-ly/kho-tri-thuc thu-tuc --chi-kiem 2>/dev/null \
  | sed -nE 's/^OK: .* ([0-9]+) đoạn hợp lệ$/\1/p' || true)"
kiem "kho tri thức của repo hợp lệ (nap_tri_thuc --chi-kiem)" "có" "$([ -n "$SO_DOAN" ] && echo có || echo không)"

# --- Nền tảng: Meilisearch, khóa riêng của Tầng 2 -------------------------------------------------------
if out="$(docker compose run --rm --no-deps meili-init 2>&1)"; then ma=0; else ma=$?; fi
kiem "meili-init chạy lại: mã 0, khóa giữ nguyên, OpenBao không đổi" "0 có có" \
  "$ma $(grep -q 'giữ nguyên' <<<"$out" && echo có || echo không) $(grep -q '(không đổi)' <<<"$out" && echo có || echo không)"
kiem "khóa Tầng 2: index mot-cua-tri-thuc đủ $SO_DOAN đoạn; tạo index khác, xóa index, đọc khóa → 403" \
  "mot-cua-tri-thuc $SO_DOAN 403 403 403" "$(meili_tang2 | tail -1)"
kiem "mot_cua.tri_thuc_doan đủ $SO_DOAN đoạn" "$SO_DOAN" "$(sql "SELECT count(*) FROM mot_cua.tri_thuc_doan")"
kiem "nap-tri-thuc thoát 0" "0" "$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq nap-tri-thuc | head -1)")"

# --- Chế độ của .env --------------------------------------------------------------------------------------
kiem "GET /tro-ly/thong-tin → chế độ $CHE_DO_ENV" "$CHE_DO_ENV" "$(curl -s "$GW/tro-ly/thong-tin" | jq -r .che_do)"
if [ "$CHE_DO_ENV" = tat ]; then
  kq="$(hoi '{"cau_hoi":"Đăng ký kết hôn cần giấy tờ gì?"}')"
  kiem "tat: hỏi → 200, không sinh câu trả lời, có thông báo chỉ tìm kiếm" "200 null có" \
    "$(cat "$TL_TD/ma") $(jq -r .cau_tra_loi <<<"$kq") $(jq -r '.thong_bao // ""' <<<"$kq" | grep -q 'chỉ tìm kiếm' && echo có || echo không)"
  kiem "tat: tài liệu liên quan nhất là của thủ tục đăng ký kết hôn (HT02)" "HT02" "$(jq -r '.nguon[0].ma_thu_tuc' <<<"$kq")"
fi
kiem "tìm không dấu 'ket hon' → kết quả đầu là HT02" "HT02" \
  "$(curl -s "$GW/tro-ly/tim?q=ket+hon" | jq -r '.ket_qua[0].ma_thu_tuc')"
hoi '{"cau_hoi":""}' > /dev/null
kiem "câu hỏi rỗng → 400" "400" "$(cat "$TL_TD/ma")"
kiem "GET /tro-ly/hoi → 405" "405" "$(ma_http "$GW/tro-ly/hoi")"
kiem "body > 4 KiB → 413 ở gateway" "413" \
  "$(ma_http -H 'Content-Type: application/json' -d "{\"cau_hoi\":\"$(head -c 5000 /dev/zero | tr '\0' a)\"}" "$GW/tro-ly/hoi")"
kiem "tro-ly, meilisearch không mở cổng ra host" "|" "$(cong_host tro-ly)|$(cong_host meilisearch)"

# --- Chế độ gia-lap: đủ đường RAG không cần mô hình ------------------------------------------------------
if out="$(LLM_PROVIDER=gia-lap docker compose run --rm --no-deps nap-tri-thuc 2>&1)"; then ma=0; else ma=$?; fi
kiem "gia-lap: nap-tri-thuc mã 0" "0" "$ma"
kiem "gia-lap: mọi đoạn có vector 1024 chiều của mô hình gia-lap/bam-tu" "$SO_DOAN 1024" \
  "$(sql "SELECT count(*) || ' ' || coalesce(max(vector_dims(nhung)), 0) FROM mot_cua.tri_thuc_doan WHERE mo_hinh = 'gia-lap/bam-tu'")"
if out="$(LLM_PROVIDER=gia-lap docker compose run --rm --no-deps nap-tri-thuc 2>&1)"; then ma=0; else ma=$?; fi
kiem "gia-lap: nạp lại không nhúng lại đoạn không đổi" "0 nhúng mới 0" "$ma $(grep -oE 'nhúng mới [0-9]+' <<<"$out")"
kiem "gia-lap: tro-ly khởi động lại healthy" "0" "$(doi_tro_ly LLM_PROVIDER=gia-lap && echo 0 || echo 1)"
kiem "gia-lap: GET /tro-ly/thong-tin" "gia-lap true" "$(curl -s "$GW/tro-ly/thong-tin" | jq -r '"\(.che_do) \(.co_mo_hinh_ngon_ngu)"')"
CAU_RIENG="khai sinh cho con smoke-$(openssl rand -hex 4) trong bao lâu"
kq="$(hoi "{\"cau_hoi\":\"$CAU_RIENG\"}")"
kiem "gia-lap: hỏi → 200, câu trả lời dẫn nguồn [1], nguồn 1 được trích" "200 có true" \
  "$(cat "$TL_TD/ma") $(jq -r '.cau_tra_loi // ""' <<<"$kq" | grep -q '\[1\]' && echo có || echo không) $(jq -r '.nguon[0].duoc_trich' <<<"$kq")"
kiem "gia-lap: tìm lai chạy cả từ khóa và ngữ nghĩa" '{"tu_khoa":true,"ngu_nghia":true}' "$(jq -c .tim_kiem <<<"$kq")"
kiem "gia-lap: nguồn đầu thuộc thủ tục khai sinh (KS01)" "KS01" "$(jq -r '.nguon[0].ma_thu_tuc' <<<"$kq")"
kq="$(hoi '{"cau_hoi":"lệ phí bao nhiêu","ma_thu_tuc":"CT01"}')"
kiem "gia-lap: hỏi riêng thủ tục CT01 → mọi nguồn là CT01" "200 true" \
  "$(cat "$TL_TD/ma") $(jq '(.nguon | length > 0) and all(.nguon[]; .ma_thu_tuc == "CT01")' <<<"$kq")"
kiem "câu hỏi của người dân không bị ghi vào log tro-ly" "0" \
  "$(docker compose logs --no-log-prefix tro-ly 2>/dev/null | grep -cF "${CAU_RIENG#khai sinh cho con }" || true)"

# --- Mô hình hỏng / sai giấy phép -------------------------------------------------------------------------
kiem "mô hình hỏng: tro-ly (ollama ở địa chỉ không tồn tại) healthy" "0" \
  "$(doi_tro_ly LLM_PROVIDER=ollama LLM_BASE_URL=http://khong-co-ollama:11434 LLM_TIMEOUT=5 && echo 0 || echo 1)"
kq="$(hoi '{"cau_hoi":"Đăng ký khai tử trong bao lâu?"}')"
kiem "mô hình hỏng: vẫn 200, không câu trả lời sinh, có thông báo, tài liệu từ Meilisearch (HT03)" "200 null có HT03" \
  "$(cat "$TL_TD/ma") $(jq -r .cau_tra_loi <<<"$kq") $(jq -r '.thong_bao // ""' <<<"$kq" | grep -q 'không phản hồi' && echo có || echo không) $(jq -r '.nguon[0].ma_thu_tuc' <<<"$kq")"
kiem "mô hình hỏng: tìm từ khóa chạy, tìm ngữ nghĩa báo lỗi" '{"tu_khoa":true,"ngu_nghia":false}' "$(jq -c .tim_kiem <<<"$kq")"
if out="$(LLM_PROVIDER=ollama LLM_MODEL=qwen2.5:3b docker compose run --rm --no-deps nap-tri-thuc 2>&1)"; then ma=0; else ma=$?; fi
kiem "mô hình sai giấy phép (qwen2.5:3b) bị từ chối" "1 có" "$ma $(grep -q 'không được phép' <<<"$out" && echo có || echo không)"

# --- Trả về cấu hình .env -------------------------------------------------------------------------------
# Chế độ gia-lap đã ghi vector của nó lên mọi đoạn: chế độ .env có mô hình nhúng thật thì nhúng lại bằng mô hình đó.
case "$CHE_DO_ENV" in
  tat | gia-lap) ;;
  *) kiem "nhúng lại kho bằng mô hình của .env ($CHE_DO_ENV)" "0" \
       "$(docker compose run --rm --no-deps nap-tri-thuc > /dev/null 2>&1 && echo 0 || echo 1)" ;;
esac
kiem "trả tro-ly về LLM_PROVIDER của .env ($CHE_DO_ENV)" "0 $CHE_DO_ENV" \
  "$(doi_tro_ly && echo 0 || echo 1) $(curl -s "$GW/tro-ly/thong-tin" | jq -r .che_do)"
kiem "cổng công dân: trang /hoi-dap → 200" "200" "$(ma_http "$GW/hoi-dap")"

# --- Giới hạn tần suất (cuối mục: dùng hết hạn mức /tro-ly/hoi của IP này trong 1 phút) ------------------
ma_cuoi=""
for _ in $(seq 1 12); do
  ma_cuoi="$(ma_http -H 'Content-Type: application/json' -d '{"cau_hoi":"x"}' "$GW/tro-ly/hoi")"
  [ "$ma_cuoi" = 429 ] && break
done
kiem "quá 10 câu hỏi/phút/IP → 429" "429" "$ma_cuoi"
rm -rf "$TL_TD"
