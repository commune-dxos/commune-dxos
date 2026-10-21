#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Dịch vụ một lần `garage-init` của lõi: cấu hình Garage qua Admin API v2 rồi thoát.

Chạy lại bao nhiêu lần cũng được (idempotent):
  1. Layout một nút: nút chưa có vai trò thì gán zone + dung lượng rồi áp dụng layout.
  2. Bucket của ứng dụng: đọc apps/<DXOS_APP>/s3/buckets.conf (lõi không biết tên bucket
     nghiệp vụ nào), tạo bucket còn thiếu.
  3. Khóa S3 riêng của ứng dụng (tên dxos-app-<DXOS_APP>): tạo nếu chưa có, chỉ được
     đọc/ghi trên các bucket đã khai báo; bucket không còn khai báo thì thu hồi quyền.
     Khóa không được tạo bucket, không phải owner.
  4. Ghi thông tin kết nối + khóa vào OpenBao (dxos/apps/<DXOS_APP>/s3) cho backend của
     ứng dụng đọc (#10). Khóa không nằm trong repo hay trên đĩa, không in ra log.

admin_token của Garage cũng đọc từ OpenBao. Đăng nhập AppRole `garage-init` (role_id,
secret_id do bao-init đặt trong volume garage-init-secrets); policy chỉ cho đọc
dxos/core/garage và ghi dxos/apps/<DXOS_APP>/s3 (core/openbao/policies/garage-init.hcl).

Chỉ dùng thư viện chuẩn Python (image python gốc, không cài gói).
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ADMIN_URL = os.environ.get("GARAGE_ADMIN_URL", "http://garage:3903")
BAO_ADDR = os.environ.get("BAO_ADDR", "http://openbao:8200").rstrip("/")
BAO_APPROLE_DIR = os.environ.get("BAO_APPROLE_DIR", "/run/dxos-secrets/approle")
S3_ENDPOINT = os.environ.get("GARAGE_S3_ENDPOINT", "http://garage:3900")
S3_REGION = os.environ.get("GARAGE_S3_REGION", "garage")
ZONE = os.environ.get("GARAGE_ZONE", "dxos")
CAPACITY = int(os.environ.get("GARAGE_CAPACITY_BYTES", str(10 * 1024**3)))
APP = os.environ["DXOS_APP"]
BUCKETS_FILE = os.environ.get("APP_BUCKETS_FILE", "/app/s3/buckets.conf")

TEN_BUCKET = re.compile(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]")


def log(msg):
    print(f"garage-init: {msg}", flush=True)


def bao(method, path, body=None, token=None, cho_phep=()):
    """HTTP API của OpenBao → JSON (None nếu mã lỗi nằm trong cho_phep). Lỗi khác → thoát
    (không in body: có thể chứa bí mật)."""
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
        sys.exit(f"garage-init: OpenBao {method} {path} → HTTP {e.code}")
    return json.loads(raw) if raw else None


def bao_token():
    cred = {}
    for k in ("role_id", "secret_id"):
        with open(os.path.join(BAO_APPROLE_DIR, k), encoding="utf-8") as f:
            cred[k] = f.read().strip()
    return bao("POST", "auth/approle/login", cred)["auth"]["client_token"]


BAO_TOKEN = bao_token()
_AUTH = "Bearer " + bao("GET", "dxos/data/core/garage", token=BAO_TOKEN)["data"]["data"]["admin_token"]


def admin(method, path, body=None, params=None, cho_phep=()):
    """Gọi Admin API v2 → (mã HTTP, JSON). Mã ≥ 400 ngoài cho_phep → thoát lỗi."""
    url = f"{ADMIN_URL}/v2/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": _AUTH})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    if status >= 400 and status not in cho_phep:
        # Không in body: một số response (GetKeyInfo) có thể chứa khóa bí mật.
        sys.exit(f"garage-init: {method} {path} → HTTP {status}")
    return status, (json.loads(raw) if raw else None)


def cho_garage():
    for _ in range(90):
        try:
            status, data = admin("GET", "GetClusterStatus", cho_phep=(500, 503))
            if status == 200 and data.get("nodes"):
                return data
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(2)
    sys.exit("garage-init: Garage không phản hồi sau 3 phút")


def dam_bao_layout(trang_thai):
    if any(n.get("role") for n in trang_thai["nodes"]):
        log(f"layout đã có (phiên bản {trang_thai['layoutVersion']})")
        return
    nut = trang_thai["nodes"][0]["id"]
    admin("POST", "UpdateClusterLayout",
          {"roles": [{"id": nut, "zone": ZONE, "capacity": CAPACITY, "tags": ["dxos"]}]})
    _, layout = admin("GET", "GetClusterLayout")
    admin("POST", "ApplyClusterLayout", {"version": layout["version"] + 1})
    log(f"đã áp dụng layout một nút {nut[:16]}…, zone {ZONE}, {CAPACITY // 1024**3} GiB")


def doc_buckets():
    if not os.path.isfile(BUCKETS_FILE):
        return []
    ds = []
    with open(BUCKETS_FILE, encoding="utf-8") as f:
        for dong in f:
            ten = dong.split("#", 1)[0].strip()
            if not ten:
                continue
            if not TEN_BUCKET.fullmatch(ten):
                sys.exit(f"garage-init: tên bucket không hợp lệ trong {BUCKETS_FILE}: {ten!r}")
            ds.append(ten)
    return ds


def dam_bao_bucket(ten):
    status, info = admin("GET", "GetBucketInfo", params={"globalAlias": ten}, cho_phep=(404,))
    if status == 404:
        _, info = admin("POST", "CreateBucket", {"globalAlias": ten})
        log(f"đã tạo bucket {ten}")
    return info["id"]


def dam_bao_khoa(ten):
    _, ds = admin("GET", "ListKeys")
    khoa = next((k for k in ds if k["name"] == ten and not k.get("expired")), None)
    if khoa is None:
        _, moi = admin("POST", "CreateKey", {"name": ten})
        log(f"đã tạo khóa {ten}")
        key_id = moi["accessKeyId"]
    else:
        key_id = khoa["id"]
    _, info = admin("GET", "GetKeyInfo", params={"id": key_id, "showSecretKey": "true"})
    return info


def ghi_bi_mat(duong, noi_dung):
    """Ghi vào OpenBao nếu khác giá trị hiện có (không tạo phiên bản KV thừa mỗi lần up)."""
    hien = bao("GET", f"dxos/data/{duong}", token=BAO_TOKEN, cho_phep=(404,))
    if hien and hien["data"]["data"] == noi_dung:
        return False
    bao("POST", f"dxos/data/{duong}", {"data": noi_dung}, BAO_TOKEN)
    return True



def main():
    dam_bao_layout(cho_garage())
    buckets = doc_buckets()
    if not buckets:
        log(f"apps/{APP} không khai báo bucket (s3/buckets.conf), không tạo khóa")
        return
    ten_khoa = f"dxos-app-{APP}"
    khoa = dam_bao_khoa(ten_khoa)
    key_id = khoa["accessKeyId"]
    id_can = {dam_bao_bucket(b): b for b in buckets}
    for bucket_id, ten in id_can.items():
        admin("POST", "AllowBucketKey", {"bucketId": bucket_id, "accessKeyId": key_id,
                                         "permissions": {"read": True, "write": True, "owner": False}})
    for b in khoa.get("buckets", []):
        if b["id"] not in id_can:
            admin("POST", "DenyBucketKey", {"bucketId": b["id"], "accessKeyId": key_id,
                                            "permissions": {"read": True, "write": True, "owner": True}})
            log(f"thu hồi quyền của {ten_khoa} trên bucket {b['id'][:16]}… (không còn khai báo)")
    duong = f"apps/{APP}/s3"
    doi = ghi_bi_mat(duong, {"endpoint": S3_ENDPOINT, "region": S3_REGION, "accessKeyId": key_id,
                             "secretAccessKey": khoa["secretAccessKey"], "buckets": buckets})
    log(f"khóa {ten_khoa} đọc/ghi {', '.join(buckets)}; thông tin kết nối ở OpenBao dxos/{duong}"
        + ("" if doi else " (không đổi)"))


if __name__ == "__main__":
    main()
