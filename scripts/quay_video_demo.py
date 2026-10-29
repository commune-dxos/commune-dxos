# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Video demo dự phòng cho buổi trình bày 15 phút (#108): đủ luồng H-P-D-I trên hệ thống chạy thật, một tệp MP4.

Bảy đoạn theo đúng thứ tự của docs/trinh-bay/kich-ban-demo.md, mỗi đoạn mở bằng một khung tiêu đề:
  1 [I] công dân hỏi trợ lý thủ tục (RAG, Qwen2.5 7B nếu LLM_PROVIDER=ollama), câu trả lời dẫn nguồn
  2 [P] công dân nộp đăng ký khai sinh: Poka-yoke chặn thiếu giấy, OCR đọc ảnh mẫu giả và tự điền, tải biên nhận ký số
  3 [P] cán bộ hộ tịch (mật khẩu + OTP): chuông thông báo sắp trễ hạn, xác nhận thông tin máy đọc (HITL),
        tiếp nhận và thẩm định theo bước Flowable
  4 [P] lãnh đạo phê duyệt → thông báo kết quả ký số; công dân tải kết quả, xác minh chữ ký qua /files/xac-minh
  5 [D] xác minh độc lập chuỗi băm nhật ký kiểm toán (mot-cua/backend/kiem_toan.py qua API)
  6 [D] dashboard Superset "Hiệu suất một cửa" (đăng nhập SSO của lãnh đạo)
  7 [H] cắm gói thủ tục mới không sửa mã: gói ví dụ XNCT01 của docs/thu-tuc.md → make nap-thu-tuc → có trên cổng;
        quay xong rút gói (xóa thư mục, nạp lại)
Đoạn 5, 7 và phần xác minh chữ ký của đoạn 4 hiện lệnh thật và kết quả thật của lệnh trong khung "terminal".

Tài khoản mẫu congdan01, canbo01, lanhdao01 được đặt mật khẩu và OTP ngẫu nhiên chỉ trong bộ nhớ (như
scripts/quay_demo.py), không mật khẩu hay mã OTP nào lên hình; quay xong (kể cả khi lỗi) ba người dùng trở lại
đúng như mot-cua/keycloak/realm.json, nên sau đó chạy lại make demo-users và cài lại OTP trên điện thoại.

Cần: hệ thống đang chạy, tốt nhất make up-ai (LLM_PROVIDER=ollama) + make up-bi, đã chạy make du-lieu-demo; venv
như make quay-demo; ffmpeg. Video ghi NGOÀI repo (không commit), ví dụ:
    make quay-demo VIDEO=../.smoke/video-t2
"""
import argparse
import datetime
import html
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import quay_demo as qd  # noqa: E402 (đường dẫn thêm ở trên)

GOC = qd.GOC
GW = qd.GW
KC = f"http://localhost:{os.environ.get('KEYCLOAK_PORT', '8080')}"
NGUOI_DUNG = ("congdan01", "canbo01", "lanhdao01")
CAU_HOI = "Đăng ký khai sinh cho con cần những giấy tờ gì và mất bao lâu?"
SO_DIEN_THOAI = "0900 000 108"  # số giả
KHUNG = {"width": 1280, "height": 800}
THU_TUC_MOI = "thu-tuc/xac-nhan-cu-tru"
GIAY_TOI_DA = 300   # video ≤ 5 phút
GIAY_RAG = 40       # đoạn chờ mô hình trả lời được tua cho vừa ngần này giây


# --- Người dùng mẫu, token ----------------------------------------------------------------
def chuan_bi(mat_khau, otp):
    ds = [dict(qd.nguoi_dung_mau("congdan01"),
               credentials=[{"type": "password", "value": mat_khau, "temporary": False}])]
    for ten in ("canbo01", "lanhdao01"):
        u = {k: v for k, v in qd.nguoi_dung_mau(ten).items() if k != "requiredActions"}
        u["credentials"] = [
            {"type": "password", "value": mat_khau, "temporary": False},
            {"type": "otp", "userLabel": "quay-video", "secretData": json.dumps({"value": otp[ten]}),
             "credentialData": json.dumps({"subType": "totp", "digits": 6, "period": 30, "counter": 0,
                                           "algorithm": "HmacSHA1"})}]
        ds.append(u)
    qd.nhap_nguoi_dung(ds)


def tra_lai():
    qd.nhap_nguoi_dung([qd.nguoi_dung_mau(t) for t in NGUOI_DUNG])


_ma_da_dung = {}


def ma_otp_moi(ten, otp):
    """Mã TOTP chưa dùng của người này (Keycloak từ chối mã đã dùng trong cùng khung 30 giây)."""
    while True:
        ma = qd.ma_totp(otp[ten])
        if _ma_da_dung.get(ten) != ma:
            _ma_da_dung[ten] = ma
            return ma
        time.sleep(31 - time.time() % 30)


def token(ten, mat_khau, otp=None):
    du_lieu = {"grant_type": "password", "client_id": "dxos_cli", "username": ten, "password": mat_khau}
    if otp:
        du_lieu["totp"] = ma_otp_moi(ten, otp)
    yc = urllib.request.Request(f"{KC}/realms/dxos/protocol/openid-connect/token",
                                data=urllib.parse.urlencode(du_lieu).encode())
    with urllib.request.urlopen(yc, timeout=30) as r:
        return json.load(r)["access_token"]


# --- Khung tiêu đề, khung terminal ----------------------------------------------------------
CSS_KHUNG = """
body { margin: 0; height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 0 96px;
       background: #0F766E; color: #fff; font-family: 'Be Vietnam Pro', system-ui, sans-serif; }
.nhan { font-size: 26px; opacity: .85; letter-spacing: .04em; }
h1 { font-size: 54px; margin: 16px 0 20px; line-height: 1.15; }
p { font-size: 26px; line-height: 1.5; max-width: 980px; opacity: .95; margin: 0; }
"""
CSS_TERM = """
body { margin: 0; height: 100vh; background: #111827; color: #E5E7EB; display: flex; flex-direction: column;
       font-family: ui-monospace, Menlo, monospace; }
.dau { background: #1F2937; padding: 14px 24px; font: 600 20px 'Be Vietnam Pro', system-ui, sans-serif; color: #fff; }
pre { margin: 0; padding: 24px 28px; font-size: 17px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
.lenh { color: #5EEAD4; } .ok { color: #86EFAC; font-weight: 700; } .mo { color: #9CA3AF; }
"""


def trang_trong(trang):
    """Rời trang của cổng trước khi vẽ khung: CSP của APISIX (style-src 'self') chặn <style> nội tuyến."""
    trang.goto("about:blank")


def khung_tieu_de(trang, nhan, tieu_de, mo_ta, giay=4.0):
    trang_trong(trang)
    trang.set_content(f"<html lang=vi><style>{CSS_KHUNG}</style><body><div class=nhan>{html.escape(nhan)}</div>"
                      f"<h1>{html.escape(tieu_de)}</h1><p>{html.escape(mo_ta)}</p></body></html>")
    qd.dung(trang, giay)


def khung_terminal(trang, tieu_de, buoc, giay_moi_buoc=3.5):
    """buoc = [(lệnh, kết quả)]: hiện lần lượt từng lệnh rồi kết quả thật của nó."""
    trang_trong(trang)
    trang.set_content(f"<html lang=vi><style>{CSS_TERM}</style><body><div class=dau>{html.escape(tieu_de)}</div>"
                      "<pre id=ra></pre></body></html>")
    for lenh, kq in buoc:
        dong = []
        for d in kq.rstrip().splitlines():
            lop = "ok" if re.search(r"\b(OK|hợp lệ|hopLe\": true|\"toanVen\": true|đã nạp)", d) else ""
            dong.append(f"<span class='{lop}'>{html.escape(d)}</span>")
        trang.evaluate("([l, k]) => { const ra = document.getElementById('ra');"
                       " ra.insertAdjacentHTML('beforeend', l); window.scrollTo(0, document.body.scrollHeight);"
                       " setTimeout(() => { ra.insertAdjacentHTML('beforeend', k); window.scrollTo(0, document.body.scrollHeight); }, 900); }",
                       [f"<span class=lenh>$ {html.escape(lenh)}</span>\n", "\n".join(dong) + "\n\n"])
        qd.dung(trang, giay_moi_buoc)


def chay(lenh, **kw):
    kq = subprocess.run(lenh, cwd=GOC, capture_output=True, text=True, timeout=600, **kw)
    return kq.returncode, (kq.stdout + kq.stderr)


# --- Các đoạn --------------------------------------------------------------------------------
def dang_nhap(trang, ten, mat_khau, otp=None):
    qd.dang_nhap_keycloak(trang, ten, mat_khau)
    if otp:
        trang.wait_for_selector("#otp")
        trang.locator("#otp").press_sequentially(ma_otp_moi(ten, otp), delay=70)
        qd.dung(trang, 0.4)
        trang.locator("#kc-login").click()


def doan_tro_ly(trang, _):
    trang.goto(GW + "/hoi-dap")
    trang.get_by_role("heading", level=1, name="Hỏi đáp thủ tục").wait_for()
    qd.dung(trang, 1.5)
    trang.locator("#cau-hoi").press_sequentially(CAU_HOI, delay=35)
    qd.dung(trang, 0.6)
    trang.get_by_role("button", name="Gửi câu hỏi").click()
    trang.mark_rag_bat_dau = time.time()
    trang.get_by_role("region", name="Nguồn tham khảo").first.wait_for(timeout=300000)
    trang.mark_rag_xong = time.time()
    trang.get_by_role("article", name=re.compile("Câu hỏi:")).last.scroll_into_view_if_needed()
    qd.dung(trang, 6)
    trang.get_by_role("region", name="Nguồn tham khảo").first.scroll_into_view_if_needed()
    qd.dung(trang, 5)


def doan_nop(trang, ctx):
    trang.goto(GW + "/thu-tuc/KS01")
    trang.get_by_role("link", name=re.compile("Bắt đầu nộp")).first.wait_for()
    qd.dung(trang, 2)
    trang.get_by_role("link", name=re.compile("Bắt đầu nộp")).first.click()
    trang.get_by_role("button", name=re.compile("Đăng nhập")).first.click()
    dang_nhap(trang, "congdan01", ctx["mat_khau"])
    o_sdt = trang.get_by_label("Số điện thoại")
    o_sdt.wait_for(timeout=20000)
    o_sdt.press_sequentially(SO_DIEN_THOAI, delay=45)
    trang.get_by_role("button", name="Tiếp tục").click()
    trang.get_by_label(re.compile("Chọn tệp cho Tờ khai")).set_input_files(
        files=[{"name": "to-khai.png", "mimeType": "image/png", "buffer": qd.anh_png()}])
    qd.dung(trang, 0.8)
    trang.get_by_role("button", name="Tiếp tục").click()
    trang.get_by_role("alert").first.wait_for()  # Poka-yoke: thiếu giấy chứng sinh, chưa gửi gì
    qd.dung(trang, 3)
    for nhan, tep in (("Giấy chứng sinh", "giay-chung-sinh.png"), ("Giấy tờ tùy thân", "giay-to-tuy-than.png")):
        with urllib.request.urlopen(f"{GW}/mau-gia/{tep}", timeout=30) as r:
            anh = r.read()
        trang.get_by_label(re.compile(f"Chọn tệp cho {nhan}")).set_input_files(
            files=[{"name": tep, "mimeType": "image/png", "buffer": anh}])
        qd.dung(trang, 0.6)
    nut_doc = trang.get_by_role("button", name="Đọc thông tin từ ảnh")
    for da_doc in range(1, nut_doc.count() + 1):
        nut_doc.first.scroll_into_view_if_needed()
        nut_doc.first.click()
        trang.get_by_role("button", name="Đọc lại ảnh").nth(da_doc - 1).wait_for(timeout=120000)
        qd.dung(trang, 2.5)
    trang.get_by_role("button", name="Tiếp tục").click()
    trang.get_by_role("button", name="Đồng ý và nộp hồ sơ").wait_for()
    qd.dung(trang, 2.5)
    trang.get_by_role("button", name="Đồng ý và nộp hồ sơ").click()
    trang.get_by_text(re.compile(r"HS\d{8}-\d{6}")).first.wait_for(timeout=60000)
    ctx["ma"] = re.search(r"HS\d{8}-\d{6}", trang.inner_text("main")).group(0)
    qd.dung(trang, 2)
    trang.get_by_role("button", name=re.compile("Tải .*PDF có ký số")).first.click()
    trang.get_by_role("status").filter(has_text=re.compile("ký")).first.wait_for(timeout=60000)
    qd.dung(trang, 4)


def mo_ho_so(trang, ma):
    trang.goto(GW + "/can-bo")
    trang.get_by_role("link", name=re.compile(ma)).first.click()
    trang.get_by_role("heading", level=1, name=f"Hồ sơ {ma}").wait_for()
    qd.dung(trang, 2)


def hoan_thanh_buoc(trang, cho):
    trang.keyboard.press("Escape")  # đóng popover chuông nếu đang mở
    co = trang.get_by_role("radio", name="Có").first
    co.scroll_into_view_if_needed()
    co.click()
    qd.dung(trang, 0.8)
    trang.get_by_role("button", name="Hoàn thành bước").click()
    trang.get_by_text(re.compile(cho)).first.wait_for(timeout=30000)
    qd.dung(trang, 2.5)


def doan_can_bo(trang, ctx):
    trang.goto(GW + "/can-bo")
    trang.get_by_role("button", name="Đăng nhập").click()
    dang_nhap(trang, "canbo01", ctx["mat_khau"], ctx["otp"])
    trang.get_by_role("heading", level=1, name="Hộp việc").wait_for(timeout=20000)
    qd.dung(trang, 2.5)
    trang.goto(GW + "/can-bo/thong-bao")
    trang.get_by_text(re.compile("sắp (trễ|tới) hạn", re.I)).first.wait_for(timeout=20000)
    qd.dung(trang, 4)
    mo_ho_so(trang, ctx["ma"])
    trang.get_by_role("heading", name="Thông tin đọc từ giấy tờ").scroll_into_view_if_needed()
    qd.dung(trang, 3)
    nut_xn = trang.get_by_role("button", name="Xác nhận đúng với ảnh gốc")
    for con in range(nut_xn.count(), 0, -1):
        nut_xn.first.scroll_into_view_if_needed()
        qd.dung(trang, 1.5)
        nut_xn.first.click()
        trang.wait_for_function(f"() => [...document.querySelectorAll('button')].filter(b => b.textContent.includes("
                                f"'Xác nhận đúng với ảnh gốc')).length < {con}", timeout=30000)
        qd.dung(trang, 1.5)
    hoan_thanh_buoc(trang, "Thẩm định")
    hoan_thanh_buoc(trang, "Phê duyệt")


def doan_lanh_dao(trang, ctx):
    trang.goto(GW + "/can-bo")
    trang.get_by_role("button", name="Đăng nhập").click()
    dang_nhap(trang, "lanhdao01", ctx["mat_khau"], ctx["otp"])
    trang.get_by_role("heading", level=1, name="Hộp việc").wait_for(timeout=20000)
    qd.dung(trang, 2)
    mo_ho_so(trang, ctx["ma"])
    hoan_thanh_buoc(trang, "Hoàn tất|hoàn tất")
    ctx["trang_ld"] = trang


def doan_ket_qua(trang, ctx):
    """Công dân (phiên đăng nhập của đoạn 2) tải thông báo kết quả, rồi xác minh chữ ký của chính tệp đó."""
    trang.goto(GW + "/ho-so")
    trang.get_by_text(ctx["ma"]).first.click()
    trang.get_by_text(re.compile("Hồ sơ đã có kết quả")).first.wait_for(timeout=30000)
    qd.dung(trang, 2)
    with trang.expect_download(timeout=60000) as tai:
        trang.get_by_role("button", name=re.compile("Tải thông báo kết quả")).first.click()
    pdf = Path(ctx["td"]) / "ket-qua.pdf"
    tai.value.save_as(pdf)
    qd.dung(trang, 3)
    tk = token("congdan01", ctx["mat_khau"])
    yc = urllib.request.Request(f"{GW}/files/xac-minh", data=pdf.read_bytes(), method="POST",
                                headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/pdf"})
    with urllib.request.urlopen(yc, timeout=60) as r:
        kq = json.load(r)
    gon = {k: kq[k] for k in ("hopLe", "toanVen", "tinCay", "nguoiKy", "phatHanh") if k in kq}
    khung_terminal(trang, "Xác minh chữ ký số của thông báo kết quả vừa tải (pyHanko, chứng thư step-ca của xã)", [
        (f"sha256sum ket-qua.pdf", f"{_sha(pdf)}  ket-qua.pdf"),
        ("curl -H 'Authorization: Bearer $TOKEN' --data-binary @ket-qua.pdf http://localhost:9080/files/xac-minh",
         json.dumps(gon, ensure_ascii=False, indent=2))], giay_moi_buoc=5)


def _sha(duong):
    import hashlib
    return hashlib.sha256(Path(duong).read_bytes()).hexdigest()


def doan_kiem_toan(trang, ctx):
    tk = token("lanhdao01", ctx["mat_khau"], ctx["otp"])
    ma, ra = chay([sys.executable, "mot-cua/backend/kiem_toan.py", "--api", f"{GW}/api"],
                  env=dict(os.environ, DXOS_TOKEN=tk))
    if ma:
        raise RuntimeError(f"kiem_toan.py mã {ma}: {ra[-400:]}")
    khung_terminal(trang, "Nhật ký kiểm toán: tự tính lại chuỗi băm SHA-256 qua API, không tin hàm trong CSDL", [
        ("DXOS_TOKEN=<token lãnh đạo> python3 mot-cua/backend/kiem_toan.py --api http://localhost:9080/api", ra)],
        giay_moi_buoc=7)


def doan_superset(trang, ctx):
    trang = ctx.get("trang_ld", trang)
    bang = GW + "/bao-cao/superset/dashboard/hieu-suat-mot-cua/"
    # Vào thẳng /bao-cao/login/keycloak: nút "Sign in with Keycloak" của trang đăng nhập Superset trỏ tới
    # /login/keycloak, thiếu tiền tố /bao-cao (SUPERSET_APP_ROOT), nên rơi vào trang 404 của cổng.
    trang.goto(GW + "/bao-cao/login/keycloak?next=" + urllib.parse.quote(bang, safe=""))
    bieu_do = trang.locator(".dashboard-chart, .chart-container")
    trang.locator("#username").or_(bieu_do).first.wait_for(timeout=60000)
    if trang.locator("#username").count():
        dang_nhap(trang, "lanhdao01", ctx["mat_khau"], ctx["otp"])
    trang.wait_for_url(re.compile(r"/bao-cao/superset/"), timeout=60000)
    if "dashboard" not in trang.url:
        trang.goto(bang)
    bieu_do.first.wait_for(timeout=90000)
    trang.wait_for_load_state("networkidle", timeout=60000)
    qd.dung(trang, 10)


def doan_cam_goi(trang, ctx):
    _, ra1 = chay([sys.executable, "scripts/goi_vi_du.py", "--ra", "thu-tuc"])
    _, ra2 = chay(["docker", "compose", "run", "--rm", "--no-deps", "nap-thu-tuc"])
    ra2 = "\n".join(d for d in ra2.splitlines() if "nap-thu-tuc:" in d)
    khung_terminal(trang, "Cắm gói thủ tục mới: thêm một thư mục, không sửa dòng mã nào", [
        ("ls thu-tuc/", "  ".join(sorted(p.name for p in (GOC / "thu-tuc").iterdir() if p.is_dir()))),
        ("ls thu-tuc/xac-nhan-cu-tru/", "  ".join(sorted(p.name for p in (GOC / THU_TUC_MOI).iterdir()))),
        ("make nap-thu-tuc", ra2)], giay_moi_buoc=4.5)
    trang.goto(GW + "/")
    the = trang.get_by_role("link", name=re.compile("Xác nhận thông tin về cư trú")).first
    the.wait_for(timeout=20000)
    the.scroll_into_view_if_needed()
    qd.dung(trang, 2.5)
    the.click()
    trang.get_by_role("heading", level=1, name=re.compile("Xác nhận thông tin về cư trú")).wait_for()
    qd.dung(trang, 5)


def rut_goi():
    if (GOC / THU_TUC_MOI).exists():
        shutil.rmtree(GOC / THU_TUC_MOI)
        chay(["docker", "compose", "run", "--rm", "--no-deps", "nap-thu-tuc"])
        print("  đã rút gói ví dụ (xóa thu-tuc/xac-nhan-cu-tru, nạp lại)")


DOAN = [
    ("tro-ly", "1 · [I] Trợ lý thủ tục", "Công dân hỏi, trợ lý trả lời có dẫn nguồn",
     "Tìm lai Meilisearch + pgvector, Qwen2.5 7B chạy trên máy của xã. Không có nguồn thì không trả lời.", doan_tro_ly),
    ("nop", "2 · [P] Nộp hồ sơ khai sinh", "Thiếu giấy là bị chặn, ảnh giấy tờ được đọc tự điền",
     "Poka-yoke theo JSON Schema của gói; OCR PaddleOCR + VietOCR đọc ảnh mẫu giả; biên nhận PDF có ký số.", doan_nop),
    ("can-bo", "3 · [P] Cán bộ hộ tịch", "Thông báo sắp trễ hạn, xác nhận máy đọc, xử lý theo bước Flowable",
     "Đăng nhập một lần + OTP. Cán bộ so ảnh gốc với thông tin máy đọc rồi xác nhận (human-in-the-loop).", doan_can_bo),
    ("lanh-dao", "4 · [P] Lãnh đạo phê duyệt", "Phê duyệt → thông báo kết quả ký số → công dân tải và xác minh",
     "Gotenberg in PDF, pyHanko ký PAdES bằng chứng thư của CA nội bộ step-ca.", doan_lanh_dao),
    ("ket-qua", None, None, None, doan_ket_qua),
    ("kiem-toan", "5 · [D] Nhật ký kiểm toán", "Ai làm gì, lúc nào: không sửa, không xóa được",
     "Chuỗi băm SHA-256, trình xác minh độc lập tự tính lại từng bản ghi qua API.", doan_kiem_toan),
    ("superset", "6 · [D] Dashboard lãnh đạo", "Thời gian giải quyết, tỷ lệ trễ hạn theo tháng",
     "Hồ sơ đã đóng → Parquet + DuckDB → dbt (lineage) → Superset, đăng nhập SSO. Số liệu là dữ liệu mẫu giả.", doan_superset),
    ("cam-goi", "7 · [H] Cắm–rút gói thủ tục", "Thêm thủ tục mới không sửa mã",
     "Một thư mục thu-tuc/<mã>/ gồm 5 tệp; bộ nạp kiểm, deploy BPMN lên Flowable, cổng công dân tự có thủ tục mới.", doan_cam_goi),
]


# --- Ghép video ------------------------------------------------------------------------------
def ghep(doan, ra):
    """doan = [(webm, hệ số tua)] → MP4 H.264 1280×800, 25 khung/giây."""
    vao, loc = [], []
    for i, (v, tua) in enumerate(doan):
        vao += ["-i", str(v)]
        loc.append(f"[{i}:v]setpts=PTS/{tua:.3f},fps=25,scale=1280:800:flags=lanczos,setsar=1[v{i}]")
    loc.append("".join(f"[v{i}]" for i in range(len(doan))) + f"concat=n={len(doan)}:v=1:a=0[ra]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *vao, "-filter_complex", ";".join(loc), "-map", "[ra]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(ra)], check=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--video", required=True, help="thư mục ghi video (ngoài repo)")
    ap.add_argument("--chi", help="chỉ quay các đoạn này, phân cách bằng dấu phẩy (gỡ lỗi), ví dụ: tro-ly,nop")
    ap.add_argument("--kenh")
    ap.add_argument("--hien", action="store_true")
    a = ap.parse_args(argv)
    for cmd in ("ffmpeg", "ffprobe", "docker"):
        if not shutil.which(cmd):
            sys.exit(f"LỖI: thiếu {cmd}")
    ra_dir = Path(a.video).resolve()
    if GOC in ra_dir.parents or ra_dir == GOC:
        sys.exit("LỖI: video phải ghi ngoài repo (không commit video)")
    ra_dir.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright

    chon = set(a.chi.split(",")) if a.chi else None
    ctx = {"mat_khau": "demo-" + secrets.token_urlsafe(12), "otp": {t: secrets.token_hex(10) for t in NGUOI_DUNG[1:]}}
    chuan_bi(ctx["mat_khau"], ctx["otp"])
    try:
        with tempfile.TemporaryDirectory(prefix="quay-video-") as td, sync_playwright() as p:
            ctx["td"] = td
            trinh_duyet = p.chromium.launch(channel=a.kenh, headless=not a.hien)
            phien = {}   # vai → context trình duyệt (giữ phiên đăng nhập giữa các đoạn)
            vai = {"tro-ly": "cong-dan-1", "nop": "cong-dan", "ket-qua": "cong-dan", "can-bo": "can-bo",
                   "lanh-dao": "lanh-dao", "kiem-toan": "lanh-dao", "superset": "lanh-dao", "cam-goi": "cam-goi"}
            ghi = []
            for ten, nhan, tieu_de, mo_ta, ham in DOAN:
                if chon and ten not in chon:
                    continue
                v = vai[ten]
                if v not in phien:
                    c = trinh_duyet.new_context(viewport=KHUNG, locale="vi-VN", accept_downloads=True,
                                                record_video_dir=str(Path(td) / v), record_video_size=KHUNG)
                    c.add_init_script(f"""document.addEventListener('DOMContentLoaded', () => {{
                        const s = document.createElement('style'); s.textContent = {json.dumps(qd.CHE_OTP)};
                        document.head.appendChild(s); }});""")
                    c.set_default_timeout(20000)
                    phien[v] = (c, c.new_page())
                c, trang = phien[v]
                t0 = time.time()
                if nhan:
                    khung_tieu_de(trang, nhan, tieu_de, mo_ta)
                try:
                    ham(trang, ctx)
                except Exception:
                    anh = ra_dir / f"loi-{ten}.png"
                    trang.screenshot(path=str(anh), full_page=True)
                    print(f"  LỖI ở đoạn {ten}: ảnh màn hình {anh}")
                    raise
                ghi.append((ten, v, t0, time.time(), getattr(trang, "mark_rag_bat_dau", None), getattr(trang, "mark_rag_xong", None)))
                print(f"  đoạn {ten}: {time.time() - t0:.0f} giây" + (f", mã hồ sơ {ctx['ma']}" if ten == "nop" else ""))
            # Video của mỗi context ghi xong khi đóng; mỗi đoạn là một khoảng thời gian trong video của vai đó.
            for v, (c, trang) in phien.items():
                duong = trang.video.path()
                c.close()
                phien[v] = Path(duong)
            trinh_duyet.close()
            cat = []
            goc_vai = {}
            for ten, v, t0, t1, rag0, rag1 in ghi:
                goc_vai.setdefault(v, t0)
            for i, (ten, v, t0, t1, rag0, rag1) in enumerate(ghi):
                # Thời điểm trong video của vai = thời gian thực kể từ đoạn đầu của vai đó (context mở ngay trước).
                tu, den = t0 - goc_vai[v], t1 - goc_vai[v]
                if rag0 and rag1 and rag1 - rag0 > GIAY_RAG:
                    manh = [(tu, rag0 - goc_vai[v], 1.0), (rag0 - goc_vai[v], rag1 - goc_vai[v], (rag1 - rag0) / GIAY_RAG),
                            (rag1 - goc_vai[v], den, 1.0)]
                else:
                    manh = [(tu, den, 1.0)]
                for j, (a0, a1, tua) in enumerate(manh):
                    tep = Path(td) / f"cat-{i:02d}-{j}.mp4"
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, a0):.2f}", "-to", f"{a1:.2f}",
                                    "-i", str(phien[v]), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                                    str(tep)], check=True)
                    cat.append((tep, tua))
            tong = sum(qd.thoi_luong(t) / tua for t, tua in cat)
            nhanh = max(1.0, tong / GIAY_TOI_DA)
            ten_ra = ra_dir / f"commune-dxos-demo-{datetime.date.today():%Y%m%d}.mp4"
            ghep([(t, tua * nhanh) for t, tua in cat], ten_ra)
            print(f"  {ten_ra}: {qd.thoi_luong(ten_ra):.0f} giây, {ten_ra.stat().st_size / 1048576:.1f} MiB"
                  + (f" (tua x{nhanh:.2f} cho vừa {GIAY_TOI_DA} giây)" if nhanh > 1 else ""))
    finally:
        rut_goi()
        tra_lai()
        print("  congdan01, canbo01, lanhdao01 đã trở lại như realm.json: chạy make demo-users, cài lại OTP")


if __name__ == "__main__":
    main()
