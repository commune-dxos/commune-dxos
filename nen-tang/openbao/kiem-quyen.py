#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Kiểm policy OpenBao bằng chính danh tính của từng dịch vụ (make smoke gọi).

  python kiem-quyen.py <danh tính>:<read|write>:<đường dẫn KV> …

Mỗi danh tính đăng nhập AppRole bằng role_id/secret_id trong volume của nó (/vol/<danh
tính>/approle/), thử thao tác rồi in một dòng `<danh tính>:<thao tác>:<đường dẫn> <mã HTTP>`.
read: 200 = đọc được, 403 = policy chặn. write: ghi kèm check-and-set cas=0 (chỉ ghi khi
khóa chưa tồn tại) lên đường dẫn ĐÃ CÓ, nên không bao giờ đổi bí mật thật kể cả khi policy
sai: 400 = policy cho ghi (bị cas chặn), 403 = policy chặn. Token thu hồi sau khi kiểm.
Không in giá trị bí mật.
"""

import json
import os
import sys
import urllib.error
import urllib.request

ADDR = os.environ.get("BAO_ADDR", "http://openbao:8200").rstrip("/")
VOL = os.environ.get("BAO_IDENTITY_VOLUMES", "/vol")


def goi(method, path, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{ADDR}/v1/{path}", data=data, method=method)
    if token:
        req.add_header("X-Vault-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


def dang_nhap(ten):
    cred = {}
    for k in ("role_id", "secret_id"):
        with open(os.path.join(VOL, ten, "approle", k), encoding="utf-8") as f:
            cred[k] = f.read().strip()
    status, kq = goi("POST", "auth/approle/login", cred)
    if status != 200:
        sys.exit(f"kiem-quyen: {ten} không đăng nhập được AppRole (HTTP {status})")
    return kq["auth"]["client_token"]


def main():
    token = {}
    for muc in sys.argv[1:]:
        ten, thao_tac, duong = muc.split(":", 2)
        if ten not in token:
            token[ten] = dang_nhap(ten)
        if thao_tac == "read":
            status, _ = goi("GET", f"dxos/data/{duong}", token=token[ten])
        else:
            status, _ = goi("POST", f"dxos/data/{duong}", {"options": {"cas": 0}, "data": {"smoke": "1"}}, token[ten])
        print(f"{muc} {status}", flush=True)
    for tk in token.values():
        goi("POST", "auth/token/revoke-self", {}, tk)


if __name__ == "__main__":
    main()
