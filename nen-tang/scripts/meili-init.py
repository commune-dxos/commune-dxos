#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Dịch vụ một lần `meili-init` của lõi (#91): cấp khóa API Meilisearch riêng cho dịch vụ Tầng 2 rồi thoát.

Chạy lại bao nhiêu lần cũng được (idempotent):
  1. Chờ Meilisearch sẵn sàng (/health).
  2. Khóa API của Tầng 2 (tên dxos-tang2-<DXOS_TANG2>, uid cố định theo tên): chỉ dùng được trên các index
     có tiền tố `<DXOS_TANG2>-` (lõi không biết tên index nghiệp vụ nào), chỉ các thao tác tìm kiếm, ghi
     tài liệu, tạo/cấu hình index, xem tác vụ. Không quản lý khóa, không xóa index, không snapshot/dump.
     Khóa đã có nhưng khác quyền khai ở đây → xóa rồi cấp lại (Meilisearch không cho sửa quyền của khóa).
  3. Ghi địa chỉ + khóa + tiền tố index vào OpenBao (dxos/tang2/<DXOS_TANG2>/meilisearch) cho backend của
     Tầng 2 đọc. Khóa không nằm trong repo hay trên đĩa, không in ra log.

Khóa chủ của Meilisearch đọc từ OpenBao (dxos/core/meilisearch). Đăng nhập AppRole `meili-init` (role_id,
secret_id do bao-init đặt trong volume meili-init-secrets); policy chỉ cho đọc khóa chủ và ghi
dxos/tang2/<DXOS_TANG2>/meilisearch (nen-tang/openbao/policies/meili-init.hcl).

Chỉ dùng thư viện chuẩn Python (image python gốc, không cài gói).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

MEILI_URL = os.environ.get("MEILI_URL", "http://meilisearch:7700").rstrip("/")
BAO_ADDR = os.environ.get("BAO_ADDR", "http://openbao:8200").rstrip("/")
BAO_APPROLE_DIR = os.environ.get("BAO_APPROLE_DIR", "/run/dxos-secrets/approle")
TANG2 = os.environ["DXOS_TANG2"]

# Thao tác Tầng 2 được làm trên index của mình (https://www.meilisearch.com/docs/reference/api/keys).
HANH_DONG = sorted([
    "search", "documents.add", "documents.get", "documents.delete",
    "indexes.create", "indexes.get", "indexes.update", "settings.get", "settings.update", "tasks.get",
])


def log(msg):
    print(f"meili-init: {msg}", flush=True)


def http(method, url, body=None, headers=None, cho_phep=()):
    """→ (mã HTTP, JSON). Mã ≥ 400 ngoài cho_phep → thoát (không in body: có thể chứa khóa)."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    if status >= 400 and status not in cho_phep:
        sys.exit(f"meili-init: {method} {url.split('?')[0].replace(MEILI_URL, '').replace(BAO_ADDR, '')} → HTTP {status}")
    return status, (json.loads(raw) if raw else None)


def bao_token():
    cred = {}
    for k in ("role_id", "secret_id"):
        with open(os.path.join(BAO_APPROLE_DIR, k), encoding="utf-8") as f:
            cred[k] = f.read().strip()
    return http("POST", f"{BAO_ADDR}/v1/auth/approle/login", cred)[1]["auth"]["client_token"]


BAO = {"X-Vault-Token": bao_token()}
MASTER = {"Authorization": "Bearer " + http("GET", f"{BAO_ADDR}/v1/dxos/data/core/meilisearch",
                                             headers=BAO)[1]["data"]["data"]["master_key"]}


def cho_meili():
    for _ in range(90):
        try:
            status, data = http("GET", f"{MEILI_URL}/health", cho_phep=(500, 502, 503))
            if status == 200 and (data or {}).get("status") == "available":
                return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(2)
    sys.exit("meili-init: Meilisearch không phản hồi sau 3 phút")


def dam_bao_khoa(ten):
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"dxos:meilisearch:{ten}"))
    chi_muc = [f"{TANG2}-*"]
    status, khoa = http("GET", f"{MEILI_URL}/keys/{uid}", headers=MASTER, cho_phep=(404,))
    if status == 200 and sorted(khoa["actions"]) == HANH_DONG and khoa["indexes"] == chi_muc and not khoa["expiresAt"]:
        return khoa, False
    if status == 200:
        http("DELETE", f"{MEILI_URL}/keys/{uid}", headers=MASTER)
        log(f"khóa {ten} khác quyền khai báo: xóa để cấp lại")
    _, khoa = http("POST", f"{MEILI_URL}/keys", {
        "uid": uid, "name": ten, "actions": HANH_DONG, "indexes": chi_muc, "expiresAt": None,
        "description": f"Khóa của dịch vụ Tầng 2 {TANG2}: chỉ index {chi_muc[0]} (meili-init)",
    }, headers=MASTER)
    return khoa, True


def ghi_bi_mat(duong, noi_dung):
    """Ghi vào OpenBao nếu khác giá trị hiện có (không tạo phiên bản KV thừa mỗi lần up)."""
    status, hien = http("GET", f"{BAO_ADDR}/v1/dxos/data/{duong}", headers=BAO, cho_phep=(404,))
    if status == 200 and hien["data"]["data"] == noi_dung:
        return False
    http("POST", f"{BAO_ADDR}/v1/dxos/data/{duong}", {"data": noi_dung}, headers=BAO)
    return True


def main():
    cho_meili()
    ten = f"dxos-tang2-{TANG2}"
    khoa, moi = dam_bao_khoa(ten)
    duong = f"tang2/{TANG2}/meilisearch"
    doi = ghi_bi_mat(duong, {"url": MEILI_URL, "key": khoa["key"], "tien_to_index": f"{TANG2}-"})
    log(f"khóa {ten} ({'mới' if moi else 'giữ nguyên'}) chỉ dùng index {TANG2}-*; thông tin kết nối ở OpenBao "
        f"dxos/{duong}" + ("" if doi else " (không đổi)"))


if __name__ == "__main__":
    main()
