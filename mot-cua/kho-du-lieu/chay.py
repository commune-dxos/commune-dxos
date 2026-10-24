#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Kho dữ liệu lịch sử của bộ máy một cửa (#80): dịch vụ một lần `kho-du-lieu` (make kho-du-lieu).

  1. xuất  Đọc hồ sơ ĐÃ ĐÓNG, lịch sử trạng thái của chúng, ngày nghỉ qua PostgREST bằng tài khoản
           dịch vụ mot_cua_bao_cao (role dich_vu_bao_cao: chỉ cột không phải dữ liệu cá nhân), khử
           định danh (mot-cua/backend/kho_du_lieu.py) rồi ghi Parquet bằng DuckDB vào DXOS_KHO_DIR/parquet/:
             ho_so/thang=YYYY-MM/thu_tuc=<mã>/du_lieu_0.parquet
             lich_su_trang_thai/thang=…/thu_tuc=…/du_lieu_0.parquet
             ngay_nghi/du_lieu.parquet, _manifest.json (số dòng, SHA-256 từng tệp)
           Ghi lại toàn bộ mỗi lần (hồ sơ đã đóng không đổi nữa; quy mô xã nhỏ) vào thư mục mới rồi đổi
           tên một lần: dbt không bao giờ đọc nửa cũ nửa mới. Cùng dữ liệu → cùng tệp (idempotent).
  2. dbt   dbt-core + dbt-duckdb `build` (model staging → mart + test) và `docs generate` (lineage)
           trên DXOS_KHO_DIR/kho.duckdb; target/ và log của dbt nằm trong DXOS_KHO_DIR, không vào git.
  3. nạp   Gọi RPC mot_cua.nap_bao_cao: thay bảng bao_cao.fct_ho_so, bao_cao.hieu_suat_thang trong
           PostgreSQL trong một transaction, cho Superset đọc bằng driver PostgreSQL.

Chạy tay (`make kho-du-lieu`) hoặc theo lịch của máy chủ (cron gọi cùng lệnh); không chạy trong
mot-cua-worker vì dbt nặng (~170 MB thư viện) và không cần thời gian thực.
  python chay.py                      xuất từ PostgREST → dbt → nạp
  python chay.py --mau du-lieu-mau.json --khong-nap   dữ liệu mẫu giả (CI, test), không cần lõi
  python chay.py --chi-xuat           chỉ bước 1
Mã thoát khác 0 khi bất kỳ bước nào lỗi (kể cả một test dbt trượt).
"""

import argparse
import datetime
import decimal
import hashlib
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

THU_MUC = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(THU_MUC, "..", "backend"))

import kho_du_lieu  # noqa: E402

KHO_DIR = os.environ.get("DXOS_KHO_DIR", "/kho")
POSTGREST_URL = os.environ.get("DXOS_POSTGREST_URL", "http://postgrest:3000")
TOKEN_URL = os.environ.get("DXOS_TOKEN_URL", "http://keycloak:8080/realms/dxos/protocol/openid-connect/token")
TANG2 = os.environ.get("DXOS_TANG2", "mot-cua")
CLIENT = "mot_cua_bao_cao"
DBT_DIR = os.path.join(THU_MUC, "dbt")
TRANG = 1000  # PGRST_DB_MAX_ROWS
BANG_MART = ("fct_ho_so", "hieu_suat_thang")
# Khóa phân vùng Parquet (ghi cả trong tệp để dbt đọc không phụ thuộc tên thư mục).
PHAN_VUNG = {"ho_so": ("thang", "thu_tuc"), "lich_su_trang_thai": ("thang", "thu_tuc"), "ngay_nghi": ()}
COT = {"ho_so": kho_du_lieu.COT_HO_SO, "lich_su_trang_thai": kho_du_lieu.COT_LICH_SU,
       "ngay_nghi": kho_du_lieu.COT_NGAY_NGHI}


def log(msg):
    print(f"kho-du-lieu: {msg}", flush=True)


# --- 1. Đọc PostgREST --------------------------------------------------------------------
def _goi(method, url, body=None, token=None, form=None, timeout=60):
    data = urllib.parse.urlencode(form).encode() if form else (None if body is None else json.dumps(body).encode())
    req = urllib.request.Request(url, data=data, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"null", parse_float=decimal.Decimal)


def token_dich_vu():
    import bimat  # mot-cua/backend/bimat.py: AppRole tang2, secret client do tang2-realm ghi
    bi_mat = bimat.doc(f"tang2/{TANG2}/keycloak/{CLIENT}")["secret"]
    kq = _goi("POST", TOKEN_URL, form={"grant_type": "client_credentials", "client_id": CLIENT, "client_secret": bi_mat})
    return kq["access_token"]


def doc_postgrest(token):
    du_lieu = {}
    for ten, duong in (("ho_so", kho_du_lieu.DUONG_HO_SO), ("lich_su_trang_thai", kho_du_lieu.DUONG_LICH_SU),
                       ("ngay_nghi", kho_du_lieu.DUONG_NGAY_NGHI)):
        ds, tu = [], 0
        while True:
            trang = _goi("GET", f"{POSTGREST_URL}{duong}&limit={TRANG}&offset={tu}", token=token)
            ds += trang
            if len(trang) < TRANG:
                break
            tu += TRANG
        du_lieu[ten] = ds
    return du_lieu


# --- 1. Ghi Parquet ----------------------------------------------------------------------
def _sha(duong):
    h = hashlib.sha256()
    with open(duong, "rb") as f:
        for khoi in iter(lambda: f.read(1 << 20), b""):
            h.update(khoi)
    return h.hexdigest()


def ghi_parquet(ban_ghi, dich):
    """Ghi các bảng ra thư mục `dich` (chưa có), trả manifest. Một luồng DuckDB, thứ tự cố định."""
    import duckdb
    os.makedirs(dich)
    con = duckdb.connect()
    con.execute("SET threads = 1")
    try:
        for bang, ds in ban_ghi.items():
            cot = COT[bang]
            thu_muc = os.path.join(dich, bang)
            con.execute(f"CREATE TABLE t ({', '.join(f'{k} {v}' for k, v in cot.items())})")
            if ds:
                con.executemany(f"INSERT INTO t VALUES ({', '.join('?' * len(cot))})", [[r[k] for k in cot] for r in ds])
            khoa_sap = "ho_so_id" if bang == "ho_so" else ("id" if bang == "lich_su_trang_thai" else "ngay")
            pv = PHAN_VUNG[bang]
            if pv and ds:
                con.execute(f"COPY (SELECT * FROM t ORDER BY {khoa_sap}) TO '{thu_muc}' (FORMAT parquet, "
                            f"PARTITION_BY ({', '.join(pv)}), WRITE_PARTITION_COLUMNS true, FILENAME_PATTERN 'du_lieu_{{i}}')")
            else:  # bảng không phân vùng, hoặc rỗng: một tệp đủ cột để dbt vẫn đọc được
                os.makedirs(thu_muc)
                con.execute(f"COPY (SELECT * FROM t ORDER BY {khoa_sap}) TO '{os.path.join(thu_muc, 'du_lieu.parquet')}' "
                            "(FORMAT parquet)")
            con.execute("DROP TABLE t")
    finally:
        con.close()
    tep = sorted(os.path.relpath(os.path.join(g, t), dich) for g, _, ts in os.walk(dich) for t in ts)
    manifest = {"bang": {b: len(ds) for b, ds in ban_ghi.items()},
                "tep": [{"duong": t, "sha256": _sha(os.path.join(dich, t))} for t in tep]}
    with open(os.path.join(dich, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
    return manifest


def xuat(du_lieu, kho=KHO_DIR):
    """Khử định danh + ghi Parquet vào kho/parquet (đổi thư mục một lần ở cuối)."""
    ban_ghi = kho_du_lieu.chuan_bi(du_lieu)
    os.makedirs(kho, exist_ok=True)
    moi = os.path.join(kho, f".parquet-{uuid.uuid4().hex}")
    manifest = ghi_parquet(ban_ghi, moi)
    dich, cu = os.path.join(kho, "parquet"), os.path.join(kho, f".parquet-cu-{uuid.uuid4().hex}")
    if os.path.exists(dich):
        os.replace(dich, cu)
    os.replace(moi, dich)
    shutil.rmtree(cu, ignore_errors=True)
    log("xuất Parquet: " + ", ".join(f"{b} {n} dòng" for b, n in manifest["bang"].items())
        + f", {len(manifest['tep'])} tệp → {dich}")
    return manifest


# --- 2. dbt -------------------------------------------------------------------------------
def chay_dbt(kho=KHO_DIR):
    """dbt build (model + test) rồi docs generate. → invocation_id của lần build."""
    from dbt.cli.main import dbtRunner
    os.environ["DXOS_KHO_DIR"] = kho
    chung = ["--project-dir", DBT_DIR, "--profiles-dir", DBT_DIR, "--target-path", os.path.join(kho, "dbt-target"),
             "--log-path", os.path.join(kho, "dbt-logs")]
    for lenh in (["build"], ["docs", "generate"]):
        kq = dbtRunner().invoke(lenh + chung)
        if not kq.success:
            raise SystemExit(f"kho-du-lieu: dbt {' '.join(lenh)} lỗi: {kq.exception or 'có model/test trượt'}")
        if lenh == ["build"]:
            # docs generate ghi đè run_results.json: giữ kết quả của build (model, test, invocation_id).
            goc = os.path.join(kho, "dbt-target", "run_results.json")
            shutil.copyfile(goc, os.path.join(kho, "dbt-target", "run_results_build.json"))
            with open(goc, encoding="utf-8") as f:
                rr = json.load(f)
            dem = {}
            for r in rr["results"]:
                dem[r["status"]] = dem.get(r["status"], 0) + 1
            run_id = rr["metadata"]["invocation_id"]
            log(f"dbt build {run_id}: " + ", ".join(f"{k} {v}" for k, v in sorted(dem.items())))
    log(f"dbt docs generate → {os.path.join(kho, 'dbt-target')} (lineage: make kho-du-lieu-tai-lieu)")
    return run_id


# --- 3. Nạp mart về PostgreSQL --------------------------------------------------------------
def _json(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return str(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


def doc_mart(kho=KHO_DIR):
    import duckdb
    # Cùng cấu hình với kết nối dbt-duckdb còn mở trong tiến trình (DuckDB không cho mở một tệp hai kiểu).
    con = duckdb.connect(os.path.join(kho, "kho.duckdb"))
    try:
        kq = {}
        for bang in BANG_MART:
            cur = con.execute(f"SELECT * FROM main.{bang} ORDER BY ALL")
            ten_cot = [c[0] for c in cur.description]
            kq[bang] = [{k: _json(v) for k, v in zip(ten_cot, dong)} for dong in cur.fetchall()]
        return kq
    finally:
        con.close()


def nap(token, mart, run_id):
    kq = _goi("POST", f"{POSTGREST_URL}/rpc/nap_bao_cao", {"p_du_lieu": mart, "p_dbt_run_id": run_id}, token=token)
    log("nạp schema bao_cao: " + ", ".join(f"{b} {n} dòng" for b, n in kq.items()))
    return kq


def main(argv=None):
    ap = argparse.ArgumentParser(description="Kho dữ liệu: xuất Parquet → dbt build → nạp mart (#80)")
    ap.add_argument("--mau", help="đọc dữ liệu từ tệp JSON dạng PostgREST thay vì gọi lõi (CI, test)")
    ap.add_argument("--kho", default=KHO_DIR, help=f"thư mục kho (mặc định DXOS_KHO_DIR={KHO_DIR})")
    ap.add_argument("--chi-xuat", action="store_true", help="chỉ xuất Parquet")
    ap.add_argument("--khong-nap", action="store_true", help="không nạp mart về PostgreSQL")
    a = ap.parse_args(argv)
    bat_dau = time.time()
    token = None
    if a.mau:
        with open(a.mau, encoding="utf-8") as f:
            du_lieu = json.load(f)
    else:
        token = token_dich_vu()
        du_lieu = doc_postgrest(token)
    try:
        xuat(du_lieu, a.kho)
    except kho_du_lieu.LoiKhuDinhDanh as e:
        raise SystemExit(f"kho-du-lieu: dừng, không xuất: {e}") from None
    if a.chi_xuat:
        return 0
    run_id = chay_dbt(a.kho)
    if not a.khong_nap:
        nap(token or token_dich_vu(), doc_mart(a.kho), run_id)
    log(f"xong sau {time.time() - bat_dau:.1f} giây")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("DBT_SEND_ANONYMOUS_USAGE_STATS", "false")
    sys.exit(main())
