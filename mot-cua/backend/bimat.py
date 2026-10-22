# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Đọc bí mật của bộ máy một cửa từ OpenBao của lõi (#10), chỉ thư viện chuẩn Python.

mot-cua-api đăng nhập AppRole `tang2` bằng role_id/secret_id mà bao-init của lõi đặt trong
volume bí mật của bộ máy một cửa (DXOS_BAO_APPROLE_DIR, chỉ đọc). Token chỉ mang policy dxos-tang2:
đọc bí mật của chính ứng dụng (dxos/tang2/<DXOS_TANG2>/…) và tài khoản kỹ thuật Flowable; không
đọc được mật khẩu CSDL hay quản trị Keycloak (nen-tang/openbao/policies/app.hcl).

Bí mật chỉ nằm trong bộ nhớ tiến trình: không ghi ra đĩa, không vào biến môi trường, không
in ra log. Token hết hạn hoặc bị thu hồi thì đăng nhập lại.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request

ADDR = os.environ.get("DXOS_BAO_ADDR", "http://openbao:8200").rstrip("/")
MOUNT = os.environ.get("DXOS_BAO_MOUNT", "dxos")
APPROLE_DIR = os.environ.get("DXOS_BAO_APPROLE_DIR", "/run/dxos-secrets/approle")


class LoiBiMat(Exception):
    """OpenBao không trả được bí mật (thông điệp không chứa giá trị bí mật)."""


_lock = threading.Lock()
_token = {"id": None, "het_han": 0.0}


def _goi(method, path, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{ADDR}/v1/{path}", data=data, method=method)
    if token:
        req.add_header("X-Vault-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise LoiBiMat(f"không gọi được OpenBao: {e}") from None


def _dang_nhap():
    cred = {}
    for k in ("role_id", "secret_id"):
        try:
            with open(os.path.join(APPROLE_DIR, k), encoding="utf-8") as f:
                cred[k] = f.read().strip()
        except OSError as e:
            raise LoiBiMat(f"thiếu {k} của AppRole: {e.strerror}") from None
    status, kq = _goi("POST", "auth/approle/login", cred)
    if status != 200:
        raise LoiBiMat(f"đăng nhập AppRole thất bại (HTTP {status})")
    auth = kq["auth"]
    _token.update(id=auth["client_token"], het_han=time.time() + int(auth["lease_duration"]))


def doc(duong):
    """→ dict dữ liệu của bí mật KV v2 `<MOUNT>/<duong>`. Lỗi → LoiBiMat."""
    for lan in range(2):
        with _lock:
            if lan or not _token["id"] or time.time() > _token["het_han"] - 60:
                _dang_nhap()
            tk = _token["id"]
        status, kq = _goi("GET", f"{MOUNT}/data/{duong}", token=tk)
        if status == 200:
            return kq["data"]["data"]
        if status != 403:
            break
        # 403: token có thể đã bị thu hồi (OpenBao khởi động lại) → đăng nhập lại một lần.
    raise LoiBiMat(f"không đọc được {MOUNT}/{duong} (HTTP {status})")
