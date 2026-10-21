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
  4. Ghi thông tin kết nối + khóa vào volume bí mật của ứng dụng (tệp s3.json, quyền 600)
     cho backend của ứng dụng đọc. Khóa không nằm trong repo, không in ra log.
     TODO(#10): ghi khóa vào OpenBao thay cho tệp trong volume.

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
ADMIN_TOKEN_FILE = os.environ.get("GARAGE_ADMIN_TOKEN_FILE", "/run/garage-secrets/admin_token")
S3_ENDPOINT = os.environ.get("GARAGE_S3_ENDPOINT", "http://garage:3900")
S3_REGION = os.environ.get("GARAGE_S3_REGION", "garage")
ZONE = os.environ.get("GARAGE_ZONE", "dxos")
CAPACITY = int(os.environ.get("GARAGE_CAPACITY_BYTES", str(10 * 1024**3)))
APP = os.environ["DXOS_APP"]
BUCKETS_FILE = os.environ.get("APP_BUCKETS_FILE", "/app/s3/buckets.conf")
SECRETS_DIR = os.environ.get("APP_SECRETS_DIR", "/run/dxos-secrets")

TEN_BUCKET = re.compile(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]")


def log(msg):
    print(f"garage-init: {msg}", flush=True)


with open(ADMIN_TOKEN_FILE, encoding="utf-8") as f:
    _AUTH = "Bearer " + f.read().strip()


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


def ghi_bi_mat(ten_tep, noi_dung):
    os.makedirs(SECRETS_DIR, exist_ok=True)
    duong = os.path.join(SECRETS_DIR, ten_tep)
    tam = duong + ".tmp"
    fd = os.open(tam, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(noi_dung, f)
    os.replace(tam, duong)
    os.chmod(duong, 0o600)


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
    ghi_bi_mat("s3.json", {"endpoint": S3_ENDPOINT, "region": S3_REGION, "accessKeyId": key_id,
                           "secretAccessKey": khoa["secretAccessKey"], "buckets": buckets})
    log(f"khóa {ten_khoa} đọc/ghi {', '.join(buckets)}; thông tin kết nối ở {SECRETS_DIR}/s3.json")


if __name__ == "__main__":
    main()
