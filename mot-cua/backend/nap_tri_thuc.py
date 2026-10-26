#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Bộ nạp kho tri thức của trợ lý thủ tục (dịch vụ một lần nap-tri-thuc, #91; make nap-tri-thuc).

  python nap_tri_thuc.py <kho-tri-thuc> <thu-tuc> [--chi-kiem]

1. Đọc kho: mỗi tệp <kho-tri-thuc>/*.md (phần đầu ma, ten, …; mỗi mục ## một đoạn) và mỗi gói
   <thu-tuc>/*/ (thu-tuc.yaml → đoạn tóm tắt thời hạn, lệ phí, căn cứ; JSON Schema → thành phần hồ sơ). Tệp sai
   định dạng hay trùng id → dừng, mã 1 (--chi-kiem: chỉ bước này, chạy trong `make check`).
2. Meilisearch: tạo index `<tiền tố>tri-thuc` (khóa chính id), cấu hình trường tìm/lọc và ngôn ngữ tiếng
   Việt, ghi mọi đoạn, xóa tài liệu không còn trong kho.
3. PostgreSQL (pgvector, bảng mot_cua.tri_thuc_doan qua PostgREST): ghi chữ mọi đoạn; nhúng bằng mô hình của
   LLM_PROVIDER những đoạn mới, đã sửa (SHA-256 khác) hoặc nhúng bằng mô hình khác; xóa đoạn không còn.
   Không có mô hình nhúng (tat) hoặc mô hình chưa sẵn sàng (Ollama chưa kéo bge-m3) → vẫn ghi chữ, đoạn đã
   sửa thì bỏ vector cũ, in cảnh báo, mã thoát 0: trợ lý vẫn tìm bằng Meilisearch; chạy lại sau khi có
   mô hình. Mã 1 chỉ khi Meilisearch hoặc PostgREST không gọi được.
Chạy lại an toàn: đoạn không đổi thì không nhúng lại.
"""

import glob
import json
import logging
import os
import sys
import time
import urllib.parse

import goi_thu_tuc
import mo_hinh
import rag
import tri_thuc

log = logging.getLogger("nap-tri-thuc")

CAI_DAT_INDEX = {
    "searchableAttributes": ["tieu_de", "ma_thu_tuc", "noi_dung"],
    "filterableAttributes": ["ma_thu_tuc", "nguon"],
    "localizedAttributes": [{"attributePatterns": ["*"], "locales": ["vie"]}],
}


def doc_kho(thu_muc_kho, thu_muc_thu_tuc):
    """→ [rag.Doan] của cả kho. Lỗi định dạng → rag.LoiKho."""
    ds = []
    for tep in sorted(glob.glob(os.path.join(thu_muc_kho, "*.md"))):
        if os.path.basename(tep).upper() == "README.MD":
            continue
        with open(tep, encoding="utf-8") as f:
            ten = os.path.basename(tep)
            ds += rag.doan_markdown(f.read(), ten, f"kho-tri-thuc/{ten[:-3]}")
    for tep in sorted(glob.glob(os.path.join(thu_muc_thu_tuc, "*", "thu-tuc.yaml"))):
        thu_muc = os.path.dirname(tep)
        ten_goi = os.path.basename(thu_muc)
        with open(tep, encoding="utf-8") as f:
            try:
                goi = goi_thu_tuc.doc_yaml(f.read())
            except goi_thu_tuc.LoiYaml as e:
                raise rag.LoiKho(f"thu-tuc/{ten_goi}/thu-tuc.yaml: {e}") from None
        schema = None
        duong_schema = os.path.join(thu_muc, "thanh-phan-ho-so.schema.json")
        if os.path.isfile(duong_schema):
            with open(duong_schema, encoding="utf-8") as f:
                try:
                    schema = json.load(f)
                except ValueError as e:
                    raise rag.LoiKho(f"thu-tuc/{ten_goi}/thanh-phan-ho-so.schema.json: {e}") from None
        ds += rag.doan_goi_thu_tuc(goi, schema, ten_goi)
    return rag.kiem_trung_id(ds)


def cho_san_sang():
    """Chờ Meilisearch và PostgREST (tối đa 3 phút) – nap-tri-thuc chạy ngay khi lõi vừa lên."""
    for _ in range(60):
        try:
            tri_thuc.MEILI.goi("GET", "/health")
            tri_thuc.pgrst("GET", "/tri_thuc_doan?select=id&limit=1")
            return
        except tri_thuc.LoiKhoTriThuc as e:
            loi = e
            time.sleep(3)
    raise loi


def nap_meili(ds):
    m = tri_thuc.MEILI
    status, _ = m.goi("GET", "/indexes/{index}", cho_phep=(404,))
    if status == 404:
        _, t = m.goi("POST", "/indexes", {"uid": m.cfg()["index"], "primaryKey": "id"})
        m.cho_tac_vu(t["taskUid"])
        log.info("đã tạo index %s", m.cfg()["index"])
    _, t = m.goi("PATCH", "/indexes/{index}/settings", CAI_DAT_INDEX)
    m.cho_tac_vu(t["taskUid"])
    _, t = m.goi("POST", "/indexes/{index}/documents", [d.tai_lieu() for d in ds])
    m.cho_tac_vu(t["taskUid"])
    co = set()
    offset = 0
    while True:
        _, trang = m.goi("GET", f"/indexes/{{index}}/documents?fields=id&limit=1000&offset={offset}")
        ket_qua = (trang or {}).get("results") or []
        co |= {x["id"] for x in ket_qua}
        offset += len(ket_qua)
        if not ket_qua or offset >= (trang or {}).get("total", 0):
            break
    thua = sorted(co - {d.id for d in ds})
    if thua:
        _, t = m.goi("POST", "/indexes/{index}/documents/delete-batch", thua)
        m.cho_tac_vu(t["taskUid"])
    log.info("Meilisearch %s: %d đoạn, xóa %d đoạn không còn trong kho", m.cfg()["index"], len(ds), len(thua))


def nap_vector(ds, mh):
    """Ghi chữ + vector vào tri_thuc_doan. → (số đoạn nhúng mới, cảnh báo hoặc None)."""
    hien = {r["id"]: r for r in tri_thuc.pgrst("GET", "/tri_thuc_doan?select=id,sha256,mo_hinh")}
    can_nhung = [d for d in ds if mh.nhan_nhung
                 and (d.id not in hien or hien[d.id]["sha256"] != d.sha256() or hien[d.id]["mo_hinh"] != mh.nhan_nhung)]
    vec, canh_bao = {}, None
    if can_nhung:
        try:
            for d, v in zip(can_nhung, mh.nhung([d.van_ban_nhung() for d in can_nhung]), strict=True):
                vec[d.id] = rag.vector_chu(v)
        except (mo_hinh.LoiMoHinh, ValueError) as e:
            vec, canh_bao = {}, f"chưa nhúng được bằng {mh.nhan_nhung} ({e}); trợ lý chỉ tìm từ khóa tới khi chạy lại"
    dong = []
    for d in ds:
        r = {"id": d.id, "nguon": d.nguon, "ma_thu_tuc": d.ma_thu_tuc, "tieu_de": d.tieu_de, "noi_dung": d.noi_dung,
             "lien_ket": d.lien_ket, "sha256": d.sha256()}
        cu = hien.get(d.id)
        if d.id in vec:
            r.update(mo_hinh=mh.nhan_nhung, nhung=vec[d.id])
        elif cu is None or cu["sha256"] != r["sha256"]:
            r.update(mo_hinh=None, nhung=None)  # chữ mới/đã sửa mà chưa nhúng: không giữ vector cũ
        dong.append(r)
    # Upsert theo khóa chính. Cột vắng trong một dòng: PostgREST lấy tập cột theo dòng đầu (missing=default)
    # nên tách hai nhóm: có cột vector và không.
    for nhom in ([r for r in dong if "nhung" in r], [r for r in dong if "nhung" not in r]):
        if nhom:
            tri_thuc.pgrst("POST", "/tri_thuc_doan?on_conflict=id", nhom,
                           prefer="resolution=merge-duplicates,return=minimal")
    thua = sorted(set(hien) - {d.id for d in ds})
    if thua:
        tri_thuc.pgrst("DELETE", "/tri_thuc_doan?id=in.(" + ",".join(urllib.parse.quote(i) for i in thua) + ")")
    log.info("pgvector: %d đoạn, nhúng mới %d (%s), xóa %d", len(ds), len(vec), mh.nhan_nhung or "không nhúng", len(thua))
    return len(vec), canh_bao


def main(argv):
    logging.basicConfig(level=logging.INFO, format="nap-tri-thuc: %(message)s")
    chi_kiem = "--chi-kiem" in argv
    tham_so = [a for a in argv[1:] if a != "--chi-kiem"]
    if len(tham_so) != 2:
        sys.exit("Cách dùng: nap_tri_thuc.py <kho-tri-thuc> <thu-tuc> [--chi-kiem]")
    try:
        ds = doc_kho(*tham_so)
    except rag.LoiKho as e:
        log.error("kho tri thức lỗi: %s", e)
        return 1
    so_tep = len({d.nguon for d in ds})
    log.info("kho tri thức: %d nguồn, %d đoạn", so_tep, len(ds))
    if chi_kiem:
        print(f"OK: kho tri thức {so_tep} nguồn, {len(ds)} đoạn hợp lệ")
        return 0
    try:
        mh = mo_hinh.tu_moi_truong()
    except ValueError as e:
        log.error("%s", e)
        return 1
    try:
        cho_san_sang()
        nap_meili(ds)
        _, canh_bao = nap_vector(ds, mh)
    except tri_thuc.LoiKhoTriThuc as e:
        log.error("%s", e)
        return 1
    if canh_bao:
        log.warning("CẢNH BÁO: %s", canh_bao)
    log.info("xong (LLM_PROVIDER=%s)", mh.che_do)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
