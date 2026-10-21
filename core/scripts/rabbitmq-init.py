#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Dịch vụ một lần `rabbitmq-init` của lõi (#9): cấu hình RabbitMQ cho ứng dụng rồi thoát.

Chạy lại bao nhiêu lần cũng được (idempotent), qua HTTP API quản trị (cổng 15672, chỉ trong
mạng nội bộ) bằng tài khoản quản trị khởi tạo:
  1. Vhost riêng của ứng dụng, tên = DXOS_APP: mỗi ứng dụng một không gian exchange/queue.
  2. User `app-<DXOS_APP>` không có tag nào (không đăng nhập được HTTP API quản trị), quyền
     trong vhost của mình: configure không gì cả (không tự khai báo hay xóa exchange/queue),
     write/read mọi thứ trong vhost. Mật khẩu: giá trị đang có trong OpenBao, chưa có thì
     sinh ngẫu nhiên; mỗi lần chạy đặt lại theo OpenBao (đổi trong OpenBao → `make up`).
  3. Topology của ứng dụng: apps/<DXOS_APP>/rabbitmq/definitions.json (lõi không biết tên
     exchange/queue nghiệp vụ nào). Chỉ nhận exchanges, queues, bindings; nạp bằng
     POST /api/definitions/<vhost> (khai báo lại cái đã có, cùng tham số, không đổi gì).
  4. Ghi thông tin kết nối của user ứng dụng vào OpenBao dxos/apps/<DXOS_APP>/rabbitmq cho
     backend của ứng dụng đọc (AppRole `app`). Không ghi nếu không đổi.

Mật khẩu quản trị đọc từ OpenBao (dxos/core/rabbitmq/admin). Đăng nhập AppRole
`rabbitmq-init` (volume rabbitmq-init-secrets chỉ có role_id/secret_id); policy:
core/openbao/policies/rabbitmq-init.hcl. Không in mật khẩu ra log. Chỉ thư viện chuẩn Python.
"""

import base64
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MGMT_URL = os.environ.get("RABBITMQ_MGMT_URL", "http://rabbitmq:15672").rstrip("/")
ADMIN = os.environ.get("RABBITMQ_ADMIN", "admin")
HOST = os.environ.get("RABBITMQ_HOST", "rabbitmq")
STOMP_PORT = int(os.environ.get("RABBITMQ_STOMP_PORT", "61613"))
BAO_ADDR = os.environ.get("BAO_ADDR", "http://openbao:8200").rstrip("/")
BAO_APPROLE_DIR = os.environ.get("BAO_APPROLE_DIR", "/run/dxos-secrets/approle")
APP = os.environ["DXOS_APP"]
DEFS_FILE = os.environ.get("APP_RABBITMQ_DEFS", "/app/rabbitmq/definitions.json")
APP_USER = f"app-{APP}"
KHOA_TOPOLOGY = {"exchanges", "queues", "bindings"}


def log(msg):
    print(f"rabbitmq-init: {msg}", flush=True)


def dung(msg):
    sys.exit(f"rabbitmq-init: {msg}")


def bao(method, path, body=None, token=None, cho_phep=()):
    """HTTP API của OpenBao → JSON (None nếu mã lỗi nằm trong cho_phep). Lỗi khác → thoát."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{BAO_ADDR}/v1/{path}", data=data, method=method)
    if token:
        req.add_header("X-Vault-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        if e.code in cho_phep:
            return None
        dung(f"OpenBao {method} {path} → HTTP {e.code}")
    return json.loads(raw) if raw else None


def bao_token():
    cred = {}
    for k in ("role_id", "secret_id"):
        with open(os.path.join(BAO_APPROLE_DIR, k), encoding="utf-8") as f:
            cred[k] = f.read().strip()
    return bao("POST", "auth/approle/login", cred)["auth"]["client_token"]


BAO_TOKEN = bao_token()
_AUTH = "Basic " + base64.b64encode(
    f"{ADMIN}:{bao('GET', 'dxos/data/core/rabbitmq/admin', token=BAO_TOKEN)['data']['data']['password']}".encode()
).decode()


def mgmt(method, path, body=None, cho_phep=()):
    """HTTP API quản trị → (mã HTTP, JSON). Mã ≥ 400 ngoài cho_phep → thoát (không in body
    của request: có thể chứa mật khẩu)."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{MGMT_URL}/api/{path}", data=data, method=method,
                                 headers={"Authorization": _AUTH, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except (urllib.error.URLError, OSError) as e:
        return 0, str(e)
    if status >= 400 and status not in cho_phep:
        chi_tiet = raw[:300].decode(errors="replace") if method == "GET" or "definitions" in path else ""
        dung(f"{method} /api/{path.split('?')[0]} → HTTP {status} {chi_tiet}".rstrip())
    try:
        return status, (json.loads(raw) if raw else None)
    except ValueError:
        return status, None


def cho_rabbitmq():
    for _ in range(60):
        status, _ = mgmt("GET", "overview", cho_phep=(401, 503))
        if status == 200:
            return
        if status == 401:
            dung(f"tài khoản quản trị {ADMIN} bị từ chối. RabbitMQ chỉ đặt default_user/default_pass "
                 "khi CSDL của nút còn trống: mật khẩu trong OpenBao đã đổi sau lần chạy đầu? Đặt lại: "
                 "docker compose exec rabbitmq rabbitmqctl change_password <user> <mật khẩu trong OpenBao>")
        time.sleep(2)
    dung(f"HTTP API quản trị không phản hồi ở {MGMT_URL} sau 2 phút")


def doc_topology():
    """→ định nghĩa exchanges/queues/bindings của ứng dụng, hoặc None nếu không khai báo."""
    if not os.path.exists(DEFS_FILE):
        return None
    with open(DEFS_FILE, encoding="utf-8") as f:
        try:
            defs = json.load(f)
        except ValueError as e:
            dung(f"{DEFS_FILE} không phải JSON: {e}")
    if not isinstance(defs, dict):
        dung(f"{DEFS_FILE}: phải là object JSON")
    la = set(defs) - KHOA_TOPOLOGY
    if la:
        # Ứng dụng không được khai user, vhost, quyền hay policy: những thứ đó là của lõi.
        dung(f"{DEFS_FILE}: chỉ được khai {sorted(KHOA_TOPOLOGY)}, có thêm {sorted(la)}")
    for k in KHOA_TOPOLOGY:
        for muc in defs.get(k, []):
            if muc.get("vhost") not in (None, APP):
                dung(f"{DEFS_FILE}: {k} {muc.get('name') or muc.get('destination')} khai vhost khác ({muc['vhost']})")
            muc.pop("vhost", None)
    return defs


def main():
    cho_rabbitmq()
    vh = urllib.parse.quote(APP, safe="")
    if mgmt("GET", f"vhosts/{vh}", cho_phep=(404,))[0] == 404:
        mgmt("PUT", f"vhosts/{vh}", {"description": f"Ứng dụng {APP} (DX-OS)", "default_queue_type": "quorum"})
        log(f"đã tạo vhost {APP}")

    hien = bao("GET", f"dxos/data/apps/{APP}/rabbitmq", token=BAO_TOKEN, cho_phep=(404,))
    hien = hien["data"]["data"] if hien else {}
    mat_khau = hien.get("password") or secrets.token_urlsafe(24)
    u = urllib.parse.quote(APP_USER, safe="")
    moi = mgmt("GET", f"users/{u}", cho_phep=(404,))[0] == 404
    # Đặt lại mỗi lần (idempotent): mật khẩu luôn khớp OpenBao, không có tag quản trị nào.
    mgmt("PUT", f"users/{u}", {"password": mat_khau, "tags": ""})
    mgmt("PUT", f"permissions/{vh}/{u}", {"configure": "^$", "write": ".*", "read": ".*"})
    if moi:
        log(f"đã tạo user {APP_USER} (không tag, chỉ đọc/ghi trong vhost {APP})")

    defs = doc_topology()
    if defs is None:
        log(f"{APP} không có rabbitmq/definitions.json, không khai báo topology")
    else:
        mgmt("POST", f"definitions/{vh}", defs)
        log("topology của " + APP + ": " + ", ".join(f"{len(defs.get(k, []))} {k}" for k in sorted(KHOA_TOPOLOGY)))

    ket_noi = {"username": APP_USER, "password": mat_khau, "vhost": APP, "host": HOST, "stomp_port": STOMP_PORT}
    if ket_noi != hien:
        bao("POST", f"dxos/data/apps/{APP}/rabbitmq", {"data": ket_noi}, BAO_TOKEN)
        log(f"thông tin kết nối user {APP_USER} → OpenBao dxos/apps/{APP}/rabbitmq")
    bao("POST", "auth/token/revoke-self", {}, BAO_TOKEN, cho_phep=(403,))
    log("RabbitMQ sẵn sàng cho " + APP)


if __name__ == "__main__":
    main()
