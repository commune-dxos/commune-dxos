# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Quay GIF demo cho README (#58): cổng công dân và cổng cán bộ chạy thật qua APISIX.

  docs/media/demo-cong-dan.gif  công dân xem danh mục → mở Đăng ký khai sinh → đăng nhập → nộp hồ sơ: thiếu
                                giấy chứng sinh bị chặn (Poka-yoke), đủ thì nộp được → tra cứu tiến độ bằng mã
                                hồ sơ + 4 số cuối số điện thoại
  docs/media/demo-can-bo.gif    cán bộ hộ tịch đăng nhập mật khẩu + OTP → hộp việc → mở hồ sơ vừa nộp →
                                xử lý bước tiếp nhận

Chromium headless (Playwright) quay video từng luồng; ffmpeg tăng tốc cho vừa ≤ 30 giây rồi xuất GIF có bảng
màu riêng (palettegen/paletteuse). Playwright và ffmpeg chỉ là công cụ trên máy người quay, như
scripts/xuat_kien_truc.py (#43).

Tài khoản và dữ liệu đều là mẫu giả: congdan01, canbo01 của mot-cua/keycloak/realm.json. Trước khi quay,
script ghi đè hai người dùng này (giữ nguyên id, nên khớp mot_cua.can_bo) với mật khẩu ngẫu nhiên, canbo01 thêm
OTP có secret ngẫu nhiên; cả hai chỉ nằm trong bộ nhớ, không in ra. Ô mật khẩu vốn hiện dấu chấm, ô OTP bị che
bằng CSS, nên không mật khẩu hay mã OTP nào lên hình. Quay xong (kể cả khi lỗi) hai người dùng trở lại đúng như
realm.json: không mật khẩu, canbo01 phải cài OTP ở lần đăng nhập đầu.

Cần: hệ thống đang chạy (make up), venv như make xuat-kien-truc, ffmpeg.
    python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-xuat.txt
    .venv/bin/playwright install chromium
Chạy: make quay-demo XUAT_PY=.venv/bin/python
"""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
REALM = GOC / "mot-cua/keycloak/realm.json"
RA = {"cong-dan": GOC / "docs/media/demo-cong-dan.gif", "can-bo": GOC / "docs/media/demo-can-bo.gif"}
GIF_TOI_DA = 5 * 1024 * 1024
GIAY_TOI_DA = 30
GW = f"http://localhost:{os.environ.get('APISIX_PORT', '9080')}"
SO_DIEN_THOAI = "0900 000 058"  # số giả
CHE_OTP = "input#otp, input[name=otp] { -webkit-text-security: disc !important; }"


# --- Người dùng mẫu ------------------------------------------------------------------------
def nguoi_dung_mau(ten):
    for u in json.loads(REALM.read_text(encoding="utf-8"))["users"]:
        if u["username"] == ten:
            return u
    sys.exit(f"LỖI: {ten} không có trong {REALM.relative_to(GOC)}")


def nhap_nguoi_dung(ds):
    """Ghi đè người dùng của realm dxos bằng Partial Import (JSON qua stdin, không lộ trong tham số lệnh)."""
    than = json.dumps({"ifResourceExists": "OVERWRITE", "users": ds}, ensure_ascii=False)
    kq = subprocess.run(["bash", "-c", ". scripts/lib-smoke.sh; kc create partialImport -r dxos -f - > /dev/null"],
                        cwd=GOC, input=than, text=True, capture_output=True)
    if kq.returncode:
        sys.exit(f"LỖI: không ghi được người dùng mẫu vào Keycloak ({kq.stderr.strip().splitlines()[-1:]})")


def chuan_bi_nguoi_dung(mat_khau, otp):
    cd = dict(nguoi_dung_mau("congdan01"), credentials=[{"type": "password", "value": mat_khau, "temporary": False}])
    cb = {k: v for k, v in nguoi_dung_mau("canbo01").items() if k != "requiredActions"}
    cb["credentials"] = [
        {"type": "password", "value": mat_khau, "temporary": False},
        {"type": "otp", "userLabel": "quay-demo", "secretData": json.dumps({"value": otp}),
         "credentialData": json.dumps({"subType": "totp", "digits": 6, "period": 30, "counter": 0,
                                       "algorithm": "HmacSHA1"})},
    ]
    nhap_nguoi_dung([cd, cb])


def tra_lai_nguoi_dung():
    nhap_nguoi_dung([nguoi_dung_mau("congdan01"), nguoi_dung_mau("canbo01")])


def ma_totp(secret):
    """RFC 6238 như chính sách OTP của realm (HmacSHA1, 6 số, 30 giây); Keycloak dùng chuỗi secret làm khóa."""
    h = hmac.new(secret.encode(), struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
    o = h[-1] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000)


def anh_png(rong=480, cao=320, mau=(232, 238, 246)):
    """Ảnh PNG giả một màu (bản quét giấy tờ mẫu), không có nội dung thật."""
    dong = b"\x00" + bytes(mau) * rong
    raw = zlib.compress(dong * cao, 9)

    def khoi(loai, du_lieu):
        return struct.pack(">I", len(du_lieu)) + loai + du_lieu + struct.pack(">I", zlib.crc32(loai + du_lieu))
    return (b"\x89PNG\r\n\x1a\n" + khoi(b"IHDR", struct.pack(">IIBBBBB", rong, cao, 8, 2, 0, 0, 0))
            + khoi(b"IDAT", raw) + khoi(b"IEND", b""))


# --- Hai luồng -------------------------------------------------------------------------------
def dung(trang, giay=1.2):
    trang.wait_for_timeout(int(giay * 1000))


def dang_nhap_keycloak(trang, ten, mat_khau):
    trang.wait_for_selector("#username")
    trang.locator("#username").press_sequentially(ten, delay=60)
    trang.locator("#password").press_sequentially(mat_khau, delay=25)
    dung(trang, 0.4)
    trang.locator("#kc-login").click()


def luong_cong_dan(trang, mat_khau):
    """→ (mã hồ sơ, 4 số cuối)."""
    trang.goto(GW + "/")
    trang.get_by_role("heading", level=1).first.wait_for()
    dung(trang, 1.5)
    trang.get_by_role("link", name=re.compile("Đăng ký khai sinh")).first.click()
    trang.get_by_role("link", name=re.compile("Bắt đầu nộp")).first.wait_for()
    dung(trang, 1.5)
    trang.get_by_role("link", name=re.compile("Bắt đầu nộp")).first.click()
    nut = trang.get_by_role("button", name=re.compile("Đăng nhập"))
    nut.first.wait_for()
    dung(trang, 0.8)
    nut.first.click()
    dang_nhap_keycloak(trang, "congdan01", mat_khau)
    o_sdt = trang.get_by_label("Số điện thoại")
    o_sdt.wait_for(timeout=20000)
    dung(trang, 0.8)
    o_sdt.press_sequentially(SO_DIEN_THOAI, delay=50)
    trang.get_by_role("button", name="Tiếp tục").click()
    anh = anh_png()
    trang.get_by_label(re.compile("Chọn tệp cho Tờ khai")).set_input_files(
        files=[{"name": "to-khai.png", "mimeType": "image/png", "buffer": anh}])
    dung(trang, 0.8)
    trang.get_by_role("button", name="Tiếp tục").click()
    trang.get_by_role("alert").wait_for()  # Poka-yoke: thiếu giấy chứng sinh → không gửi
    dung(trang, 2.2)
    trang.get_by_label(re.compile("Chọn tệp cho Giấy chứng sinh")).set_input_files(
        files=[{"name": "giay-chung-sinh.png", "mimeType": "image/png", "buffer": anh}])
    trang.get_by_label(re.compile("Chọn tệp cho Giấy tờ tùy thân")).set_input_files(
        files=[{"name": "giay-to-tuy-than.png", "mimeType": "image/png", "buffer": anh}])
    dung(trang, 0.8)
    trang.get_by_role("button", name="Tiếp tục").click()
    trang.get_by_role("button", name="Đồng ý và nộp hồ sơ").wait_for()
    dung(trang, 1.5)
    trang.get_by_role("button", name="Đồng ý và nộp hồ sơ").click()
    trang.get_by_text(re.compile(r"HS\d{8}-\d{6}")).first.wait_for(timeout=60000)
    dung(trang, 2.5)
    ma = re.search(r"HS\d{8}-\d{6}", trang.inner_text("main")).group(0)
    so_cuoi = re.sub(r"\D", "", SO_DIEN_THOAI)[-4:]
    trang.goto(GW + "/tra-cuu")
    trang.get_by_label("Mã hồ sơ").press_sequentially(ma, delay=40)
    trang.get_by_label("4 số cuối số điện thoại").press_sequentially(so_cuoi, delay=80)
    trang.get_by_role("button", name=re.compile("^Tra cứu")).click()
    trang.get_by_text(ma).last.wait_for()
    dung(trang, 3)
    return ma, so_cuoi


def luong_can_bo(trang, mat_khau, otp, ma):
    trang.goto(GW + "/can-bo")
    nut = trang.get_by_role("button", name="Đăng nhập")
    nut.wait_for()
    dung(trang, 1.2)
    nut.click()
    dang_nhap_keycloak(trang, "canbo01", mat_khau)
    trang.wait_for_selector("#otp")
    # Mã TOTP mới cho khung 30 giây hiện tại (ô bị che, không lên hình).
    trang.locator("#otp").press_sequentially(ma_totp(otp), delay=70)
    dung(trang, 0.4)
    trang.locator("#kc-login").click()
    trang.get_by_role("heading", level=1, name="Hộp việc").wait_for(timeout=20000)
    dung(trang, 2)
    trang.get_by_role("link", name=re.compile(ma)).first.click()
    trang.get_by_role("heading", level=1, name=f"Hồ sơ {ma}").wait_for()
    dung(trang, 2)
    trang.get_by_label("Có").first.click()
    dung(trang, 0.8)
    trang.get_by_role("button", name="Hoàn thành bước").click()
    trang.get_by_role("status").or_(trang.get_by_text(re.compile("Thẩm định"))).first.wait_for(timeout=20000)
    dung(trang, 3)


# --- Video → GIF -----------------------------------------------------------------------------
def thoi_luong(video):
    kq = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                        capture_output=True, text=True, check=True)
    return float(kq.stdout.strip())


def ra_gif(video, gif, rong, fps):
    nhanh = max(1.0, thoi_luong(video) / (GIAY_TOI_DA - 1))
    loc = f"setpts=PTS/{nhanh:.3f},fps={fps},scale={rong}:-1:flags=lanczos"
    tam = gif.with_suffix(".tam.gif")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-filter_complex",
                    f"[0:v]{loc},split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];"
                    "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
                    "-loop", "0", str(tam)], check=True)
    tam.replace(gif)
    return thoi_luong(video) / nhanh


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--rong", type=int, default=800, help="chiều rộng GIF (px)")
    ap.add_argument("--fps", type=int, default=8)
    ap.add_argument("--kenh", help="chrome để dùng Google Chrome có sẵn thay Chromium của Playwright")
    ap.add_argument("--hien", action="store_true", help="mở cửa sổ trình duyệt để xem khi quay")
    a = ap.parse_args()
    for cmd in ("ffmpeg", "ffprobe", "docker"):
        if not shutil.which(cmd):
            sys.exit(f"LỖI: thiếu {cmd}")
    try:
        from playwright.sync_api import Error, sync_playwright
    except ImportError:
        sys.exit("LỖI: thiếu Playwright: .venv/bin/pip install -r scripts/requirements-xuat.txt, chạy với XUAT_PY=.venv/bin/python")

    mat_khau = "demo-" + secrets.token_urlsafe(12)
    otp = secrets.token_hex(10)
    chuan_bi_nguoi_dung(mat_khau, otp)
    try:
        with tempfile.TemporaryDirectory(prefix="quay-demo-") as td, sync_playwright() as p:
            try:
                trinh_duyet = p.chromium.launch(channel=a.kenh, headless=not a.hien)
            except Error as e:
                sys.exit(f"LỖI: không mở được Chromium ({e.message.splitlines()[0]}).")
            video = {}
            ma = None
            for ten, chay in (("cong-dan", lambda t: luong_cong_dan(t, mat_khau)),
                              ("can-bo", lambda t: luong_can_bo(t, mat_khau, otp, ma))):
                thu_muc = Path(td) / ten
                ctx = trinh_duyet.new_context(viewport={"width": 1280, "height": 800}, locale="vi-VN",
                                              record_video_dir=str(thu_muc), record_video_size={"width": 1280, "height": 800})
                ctx.add_init_script(f"""document.addEventListener('DOMContentLoaded', () => {{
                    const s = document.createElement('style'); s.textContent = {json.dumps(CHE_OTP)};
                    document.head.appendChild(s); }});""")
                trang = ctx.new_page()
                trang.set_default_timeout(15000)
                kq = chay(trang)
                if ten == "cong-dan":
                    ma = kq[0]
                    print(f"  công dân: nộp {ma}, tra cứu bằng 4 số cuối {kq[1]}")
                else:
                    print(f"  cán bộ: xử lý bước tiếp nhận của {ma}")
                ctx.close()  # video ghi xong khi đóng context
                video[ten] = next(thu_muc.glob("*.webm"))
            trinh_duyet.close()
            for ten, v in video.items():
                giay = ra_gif(v, RA[ten], a.rong, a.fps)
                kb = RA[ten].stat().st_size / 1024
                print(f"  {RA[ten].relative_to(GOC)}: {giay:.0f} giây, {kb:.0f} KiB")
                if RA[ten].stat().st_size > GIF_TOI_DA:
                    sys.exit(f"LỖI: {RA[ten].name} quá 5 MB, chạy lại với --rong nhỏ hơn hoặc --fps thấp hơn")
    finally:
        tra_lai_nguoi_dung()
        print("  congdan01, canbo01 đã trở lại như realm.json (không mật khẩu, canbo01 phải cài OTP)")


if __name__ == "__main__":
    main()
