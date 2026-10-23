#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
# Smoke kho dữ liệu (#80), được mot-cua/tests/smoke.sh `source` ở mục 4l, sau khi hồ sơ $WEB_HS đã được nộp
# từ web và xử lý tới hoàn tất (smoke-can-bo.sh). Kiểm:
#   make kho-du-lieu (build image, xuất → dbt build + docs → nạp) thoát 0; mọi model và test dbt đạt;
#   Parquet không có cột cá nhân, không chứa họ tên người nộp; xuất lại ra đúng các tệp cũ (manifest);
#   bảng mart trong PostgreSQL (bao_cao) khớp số liệu tính trực tiếp bằng SQL trên kho nóng: số hồ sơ đã
#   đóng, số trễ hạn (đóng sau 17:00 ngày hạn, giờ Việt Nam), số lần bổ sung của hồ sơ $WEB_HS;
#   lineage (manifest.json, catalog.json của dbt) có trong volume; lần nạp ghi đúng invocation của dbt.

echo "== Kho dữ liệu: Parquet + DuckDB + dbt (#80)"
# kho <lệnh python> → chạy trong container kho-du-lieu (volume /kho), không khởi động thêm dịch vụ.
kho() { docker compose --profile bi run --rm --no-deps -T --entrypoint python kho-du-lieu -c "$1"; }

if out="$(docker compose --profile bi run --rm --build -T kho-du-lieu 2>&1)"; then ma=0; else ma=$?; fi
kiem "make kho-du-lieu: xuất → dbt build → docs → nạp, mã thoát 0" "0" "$ma"
[ "$ma" = 0 ] || tail -20 <<<"$out"
kiem "dbt build: không model/test nào lỗi hay trượt" "0" \
  "$(kho 'import json; r = json.load(open("/kho/dbt-target/run_results_build.json")); print(sum(x["status"] not in ("pass", "success") for x in r["results"]))')"
kiem "dbt build: có model mart và test dữ liệu" "có" \
  "$(kho 'import json; r = json.load(open("/kho/dbt-target/run_results_build.json")); ids = [x["unique_id"] for x in r["results"]]; print("có" if "model.kho_mot_cua.hieu_suat_thang" in ids and sum(i.startswith("test.") for i in ids) >= 30 else "không")')"
kiem "lineage: hieu_suat_thang ← fct_ho_so ← stg_ho_so, có catalog.json" "fct_ho_so stg_ho_so có" \
  "$(kho 'import json, os; m = json.load(open("/kho/dbt-target/manifest.json"))["parent_map"]
p = lambda n: [x.split(".")[-1] for x in m["model.kho_mot_cua." + n] if x.startswith("model.")]
print(p("hieu_suat_thang")[0], [x for x in p("fct_ho_so") if x == "stg_ho_so"][0], "có" if os.path.exists("/kho/dbt-target/catalog.json") else "không")')"

KH_TEN="$(sql "SELECT ho_ten_nguoi_nop FROM mot_cua.ho_so WHERE id = '${WEB_HS:-00000000-0000-0000-0000-000000000000}'")"
kiem "Parquet có cột báo cáo, không có cột dữ liệu cá nhân" "ho_so_id có, cá nhân: không" \
  "$(kho 'import duckdb; c = {r[0] for r in duckdb.sql("DESCRIBE SELECT * FROM read_parquet(\"/kho/parquet/*/**/*.parquet\", union_by_name = true)").fetchall()}
print("ho_so_id " + ("có" if "ho_so_id" in c else "không") + ", cá nhân: " + (" ".join(sorted(c & {"ho_ten_nguoi_nop", "so_dien_thoai", "nguoi_nop_sub", "nguoi_sub", "ly_do"})) or "không"))')"
kiem "Parquet không chứa họ tên người nộp hồ sơ $WEB_HS" "0" \
  "$(kho "import duckdb, json; t = json.dumps(duckdb.sql(\"SELECT * FROM read_parquet('/kho/parquet/ho_so/**/*.parquet')\").fetchall(), default=str, ensure_ascii=False); print(t.count('''$KH_TEN''') if '''$KH_TEN''' else 'thiếu tên')")"
KH_MF="$(kho 'print(open("/kho/parquet/_manifest.json").read())' | shasum -a 256 | cut -d' ' -f1)"
docker compose --profile bi run --rm --no-deps -T kho-du-lieu python -u /mot-cua/kho-du-lieu/chay.py --chi-xuat > /dev/null 2>&1
kiem "xuất lại → đúng các tệp Parquet cũ (manifest SHA-256 không đổi)" "$KH_MF" \
  "$(kho 'print(open("/kho/parquet/_manifest.json").read())' | shasum -a 256 | cut -d' ' -f1)"

# Số liệu đúng: tính thẳng trên kho nóng bằng SQL, so với mart dbt đã nạp về bao_cao.
kiem "mart: tổng số hồ sơ = số hồ sơ đã đóng trong mot_cua.ho_so" \
  "$(sql "SELECT count(*) FROM mot_cua.ho_so WHERE trang_thai IN ('hoan_tat', 'tu_choi')")" \
  "$(sql "SELECT coalesce(sum(so_ho_so), 0) FROM bao_cao.hieu_suat_thang")"
kiem "mart: số trễ hạn = số hồ sơ đóng sau 17:00 ngày hạn (giờ Việt Nam)" \
  "$(sql "SELECT count(*) FROM mot_cua.ho_so WHERE trang_thai IN ('hoan_tat', 'tu_choi')
            AND (ngay_hoan_tat AT TIME ZONE 'Asia/Ho_Chi_Minh') > han_xu_ly + time '17:00'")" \
  "$(sql "SELECT coalesce(sum(so_tre_han), 0) FROM bao_cao.hieu_suat_thang")"
kiem "mart: số hồ sơ theo thủ tục KS01 khớp" \
  "$(sql "SELECT count(*) FROM mot_cua.ho_so h JOIN mot_cua.thu_tuc t ON t.id = h.thu_tuc_id
            WHERE h.trang_thai IN ('hoan_tat', 'tu_choi') AND t.ma = 'KS01'")" \
  "$(sql "SELECT coalesce(sum(so_ho_so), 0) FROM bao_cao.hieu_suat_thang WHERE thu_tuc = 'KS01'")"
if [ -n "${WEB_HS:-}" ]; then
  kiem "fct_ho_so: hồ sơ $WEB_HS vừa hoàn tất có trong mart, đúng số lần bổ sung" \
    "hoan_tat KS01 $(sql "SELECT count(*) FROM mot_cua.lich_su_trang_thai WHERE ho_so_id = '$WEB_HS' AND den_trang_thai = 'cho_bo_sung'")" \
    "$(sql "SELECT ket_qua || ' ' || thu_tuc || ' ' || so_lan_bo_sung FROM bao_cao.fct_ho_so WHERE ho_so_id = '$WEB_HS'")"
fi
kiem "bao_cao.lan_nap ghi invocation_id của lần dbt build vừa chạy" \
  "$(kho 'import json; print(json.load(open("/kho/dbt-target/run_results_build.json"))["metadata"]["invocation_id"])')" \
  "$(sql "SELECT dbt_run_id FROM bao_cao.lan_nap ORDER BY id DESC LIMIT 1")"
kiem "bao_cao không có cột dữ liệu cá nhân" "0" \
  "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'bao_cao'
            AND column_name IN ('ho_ten_nguoi_nop', 'so_dien_thoai', 'nguoi_nop_sub', 'nguoi_sub', 'ly_do')")"
