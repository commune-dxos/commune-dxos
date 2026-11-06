# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Quay demo dạng khung hình nét cho bản dựng video chuyên nghiệp (#143): 8 đoạn, mỗi đoạn một MP4 + meta.json.

Khác scripts/quay_video_demo.py (quay thời gian thực 1280×800 rồi tua): ở đây quay kiểu stop-motion. Mỗi thao tác (gõ
một ký tự, con trỏ trượt một nhịp, bấm, cuộn một nấc) chụp một khung 1920×1080 với DPR 2 (ảnh 3840×2160), giữ N khung
rồi ghép 30 khung/giây. Không rơi khung khi máy bận, chữ vẫn nét khi phóng to 2–3 lần, và cùng lúc biết chính xác con
trỏ, phần tử đang thao tác ở đâu. Trang được mở với "giảm chuyển động" (src/index.css tắt hiệu ứng chuyển tiếp) và chỉ
chụp khi đã đứng yên, nên không có khung chồng hai trạng thái.

Ra (thư mục ghi NGOÀI repo):
  <đoạn>.mp4   3840×2160, 30 khung/giây, H.264
  meta.json    { fps, w, h, dpr, doan: { <đoạn>: { tep, khung, vai, tieu_de, con_tro[], su_kien[], moc{} } }, lenh{} }
    con_tro[i]  = [x, y, bấm] theo pixel video, null = ẩn
    su_kien     = [{ f, loai: bam|go|nhan_manh|tai_len, bbox: [x, y, w, h] (pixel video), nhan }]
    moc         = khung bắt đầu/kết thúc của từng bước (vd. "go_cau_hoi", "da_nop")
    lenh        = kết quả thật của lệnh ở đoạn ket-qua (xác minh chữ ký), kiem-toan, cam-goi, để bản dựng vẽ khung terminal

Tám đoạn theo docs/trinh-bay/kich-ban-demo.md: tro-ly, nop, can-bo, lanh-dao, ket-qua, kiem-toan, superset, cam-goi.
Tài khoản mẫu và OTP như quay_video_demo.py: mật khẩu, secret OTP ngẫu nhiên chỉ trong bộ nhớ, ô mật khẩu hiện dấu chấm,
ô OTP bị che bằng CSS; xong (kể cả lỗi) trả congdan01, canbo01, lanhdao01 về đúng realm.json và rút gói ví dụ.

Cần: hệ thống đang chạy (make up, nên có up-bi và OCR), make du-lieu-demo; venv như make quay-demo; ffmpeg.
Chạy: make quay-demo XUAT_PY=.venv/bin/python KHUNG=../video-demo/khung
"""
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import quay_demo as qd  # noqa: E402
import quay_video_demo as qv  # noqa: E402

GOC = qd.GOC
GW = qd.GW
FPS = 30
DPR = 2
KHUNG = {"width": 1920, "height": 1080}
CAU_HOI = "Đăng ký khai sinh cho con cần những giấy tờ gì?"
SO_DIEN_THOAI = "0900 000 143"  # số giả
VAI = {"tro-ly": "Công dân", "nop": "Công dân", "can-bo": "Cán bộ một cửa", "lanh-dao": "Lãnh đạo xã",
       "ket-qua": "Công dân", "kiem-toan": "Lãnh đạo xã", "superset": "Lãnh đạo xã", "cam-goi": "Lập trình viên"}
TIEU_DE = {"tro-ly": "Công dân hỏi trợ lý thủ tục", "nop": "Công dân nộp hồ sơ khai sinh",
           "can-bo": "Cán bộ một cửa xử lý hồ sơ", "lanh-dao": "Lãnh đạo phê duyệt",
           "ket-qua": "Công dân nhận kết quả ký số", "kiem-toan": "Xác minh nhật ký kiểm toán",
           "superset": "Dashboard của lãnh đạo", "cam-goi": "Cắm gói thủ tục mới"}


def em(k):
    """Nhanh dần rồi phanh (ease-in-out bậc 3)."""
    return 4 * k ** 3 if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2


class Doan:
    """Bộ ghi một đoạn: chụp khung, giữ khung, ghi con trỏ, sự kiện, mốc."""

    def __init__(self, ten, trang, td):
        self.ten, self.trang = ten, trang
        self.dir = Path(td) / ten
        self.dir.mkdir(parents=True)
        self.n = self.so_anh = 0
        self.con_tro_hien = None  # [x, y] theo px CSS của khung nhìn
        self.bam_cho = 0
        self.con_tro, self.su_kien, self.moc_k = [], [], {}

    # --- khung hình ---
    def snap(self, giu=1):
        anh = self.dir / f"s{self.so_anh:05d}.jpg"
        self.so_anh += 1
        self.trang.screenshot(path=str(anh), type="jpeg", quality=92)
        for i in range(giu):
            os.link(anh, self.dir / f"f{self.n:05d}.jpg")
            c = self.con_tro_hien
            self.con_tro.append([round(c[0] * DPR), round(c[1] * DPR), self.bam_cho if i == 0 else 0] if c else None)
            self.n += 1
        self.bam_cho = 0

    def moc(self, k):
        self.moc_k[k] = self.n

    def an_con_tro(self):
        self.con_tro_hien = None

    # --- vị trí ---
    def hop(self, loc):
        b = loc.bounding_box()
        if not b:
            raise RuntimeError(f"không thấy phần tử để lấy khung bao ({self.ten})")
        return b

    def su(self, loai, loc, nhan, hop=None):
        b = hop or self.hop(loc)
        self.su_kien.append({"f": self.n, "loai": loai, "nhan": nhan,
                             "bbox": [round(b["x"] * DPR), round(b["y"] * DPR), round(b["width"] * DPR), round(b["height"] * DPR)]})

    def cuon_toi(self, loc, vi_tri=0.38, nac=16):
        """Cuộn mượt (mỗi nấc một khung) để phần tử nằm ở khoảng vi_tri chiều cao khung nhìn, nếu đang ở ngoài vùng giữa."""
        b = self.hop(loc)
        h = KHUNG["height"]
        if 0.12 * h < b["y"] and b["y"] + b["height"] < 0.86 * h:
            return
        y0 = self.trang.evaluate("window.scrollY")
        dich = max(0, y0 + b["y"] - h * vi_tri)
        toi_da = self.trang.evaluate("document.documentElement.scrollHeight - window.innerHeight")
        dich = min(dich, max(0, toi_da))
        if abs(dich - y0) < 4:
            return
        for i in range(1, nac + 1):
            self.trang.evaluate("y => window.scrollTo(0, y)", y0 + (dich - y0) * em(i / nac))
            self.snap()

    def luot(self, x, y, nhip=9):
        x0, y0 = self.con_tro_hien or (KHUNG["width"] * 0.62, KHUNG["height"] * 0.72)
        for i in range(1, nhip + 1):
            k = 1 - (1 - i / nhip) ** 3
            self.con_tro_hien = [x0 + (x - x0) * k, y0 + (y - y0) * k]
            self.trang.mouse.move(*self.con_tro_hien)
            self.snap()

    # --- thao tác ---
    def bam(self, loc, nhan, cho=None, giu=8, hop_loc=None):
        loc.wait_for()
        self.cuon_toi(hop_loc or loc)
        b = self.hop(hop_loc or loc)
        self.luot(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        self.su("bam", None, nhan, hop=b)
        self.bam_cho = 1
        loc.click()
        if cho:
            cho()
        self.trang.wait_for_timeout(350)
        self.snap(giu)

    def go(self, loc, chu, nhan, nhip=1, giu=10):
        self.bam(loc, nhan, giu=3)
        self.moc(f"go_{nhan}")
        b = self.hop(loc)
        for ch in chu:
            loc.press_sequentially(ch)
            self.snap(nhip)
        self.su("go", None, nhan, hop=b)
        self.snap(giu)

    def tai_len(self, o_tep, tep, nhan):
        nhan_o = o_tep.locator("xpath=ancestor::label[1]")
        self.cuon_toi(nhan_o)
        b = self.hop(nhan_o)
        self.luot(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        self.su("tai_len", None, nhan, hop=b)
        self.bam_cho = 1
        o_tep.set_input_files(files=[tep])
        self.trang.wait_for_timeout(300)
        self.snap(10)

    def nhan_manh(self, loc, nhan, giu=45):
        """Thông tin then chốt: bản dựng khoanh/tô dạ quang và giữ camera ≥ 1 giây."""
        loc.wait_for()
        self.cuon_toi(loc)
        self.su("nhan_manh", loc, nhan)
        self.snap(giu)

    def xong(self, ra):
        tep = Path(ra) / f"{self.ten}.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(self.dir / "f%05d.jpg"),
                        "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-g", "30",
                        str(tep)], check=True)
        shutil.rmtree(self.dir)
        print(f"  {self.ten}: {self.n} khung ({self.n / FPS:.1f} giây), {self.so_anh} ảnh chụp", flush=True)
        return {"tep": tep.name, "khung": self.n, "vai": VAI[self.ten], "tieu_de": TIEU_DE[self.ten],
                "con_tro": self.con_tro, "su_kien": self.su_kien, "moc": self.moc_k}


def dang_nhap(d, ten, mat_khau, otp=None):
    t = d.trang
    t.wait_for_selector("#username")
    d.snap(12)
    d.go(t.locator("#username"), ten, "ten_dang_nhap", giu=3)
    d.go(t.locator("#password"), mat_khau[:10], "mat_khau", giu=2)  # chỉ hiện chấm; gõ phần còn lại không chụp
    t.locator("#password").press_sequentially(mat_khau[10:])
    d.bam(t.locator("#kc-login"), "dang_nhap", giu=2)
    if otp:
        t.wait_for_selector("#otp")
        d.snap(6)
        # Gõ từng ký tự (mỗi ký tự một ảnh 4K) mất vài giây: chỉ sinh mã khi khung 30 giây còn ≥ 12 giây.
        while 30 - time.time() % 30 < 12:
            time.sleep(0.5)
        d.go(t.locator("#otp"), qv.ma_otp_moi(ten, otp), "otp", giu=2)
        d.bam(t.locator("#kc-login"), "xac_nhan_otp", giu=2)


# --- 8 đoạn ------------------------------------------------------------------------------------
def doan_tro_ly(d, ctx):
    t = d.trang
    t.goto(GW + "/hoi-dap")
    t.get_by_role("heading", level=1, name="Hỏi đáp thủ tục").wait_for()
    d.moc("toan_canh")
    d.snap(40)
    d.go(t.locator("#cau-hoi"), CAU_HOI, "cau_hoi")
    d.bam(t.get_by_role("button", name="Gửi câu hỏi"), "gui",
          cho=lambda: t.get_by_role("region", name="Nguồn tham khảo").first.wait_for(timeout=300000))
    d.moc("tra_loi")
    d.an_con_tro()
    d.nhan_manh(t.get_by_role("region", name="Nguồn tham khảo").first.get_by_role("listitem").first, "nguon_1", giu=60)


def doan_nop(d, ctx):
    t = d.trang
    t.goto(GW + "/thu-tuc/KS01")
    t.get_by_role("heading", level=1).first.wait_for()
    d.moc("toan_canh")
    d.snap(40)
    d.nhan_manh(t.get_by_role("heading", name=re.compile("Thành phần hồ sơ")), "thanh_phan", giu=30)
    d.bam(t.get_by_role("link", name=re.compile("Bắt đầu nộp")).first, "bat_dau_nop",
          cho=lambda: t.get_by_role("button", name=re.compile("Đăng nhập")).last.wait_for())
    d.bam(t.get_by_role("main").get_by_role("button", name=re.compile("Đăng nhập")).first, "dang_nhap")
    dang_nhap(d, "congdan01", ctx["mat_khau"])
    o_sdt = t.get_by_label("Số điện thoại")
    o_sdt.wait_for(timeout=30000)
    d.moc("buoc_1")
    d.snap(20)
    d.go(o_sdt, SO_DIEN_THOAI, "so_dien_thoai")
    d.bam(t.get_by_role("button", name="Tiếp tục"), "tiep_tuc_1", cho=lambda: t.get_by_label(re.compile("Chọn tệp cho Tờ khai")).wait_for())
    d.moc("buoc_2")
    d.snap(20)
    d.tai_len(t.get_by_label(re.compile("Chọn tệp cho Tờ khai")),
              {"name": "to-khai.png", "mimeType": "image/png", "buffer": qd.anh_png()}, "to_khai")
    d.bam(t.get_by_role("button", name="Tiếp tục"), "tiep_tuc_thieu",
          cho=lambda: t.get_by_text("Chưa tải giấy chứng sinh").last.wait_for())
    d.moc("poka_yoke")
    d.nhan_manh(t.locator("fieldset[data-invalid=true]").first, "loi_thieu_giay", giu=50)
    for nhan, tep in (("Giấy chứng sinh", "giay-chung-sinh.png"), ("Giấy tờ tùy thân", "giay-to-tuy-than.png")):
        with urllib.request.urlopen(f"{GW}/mau-gia/{tep}", timeout=30) as r:
            anh = r.read()
        d.tai_len(t.get_by_label(re.compile(f"Chọn tệp cho {nhan}")),
                  {"name": tep, "mimeType": "image/png", "buffer": anh}, tep.removesuffix(".png"))
    nut_doc = t.get_by_role("button", name="Đọc thông tin từ ảnh")
    for i in range(nut_doc.count()):
        d.bam(nut_doc.first, f"doc_anh_{i + 1}",
              cho=lambda i=i: t.get_by_role("button", name="Đọc lại ảnh").nth(i).wait_for(timeout=180000), giu=6)
        d.moc(f"ocr_{i + 1}")
        d.nhan_manh(t.get_by_role("button", name="Đọc lại ảnh").nth(i).locator("xpath=ancestor::div[contains(@class,'border-dashed')][1]"),
                    f"tu_dien_{i + 1}", giu=40)
    d.bam(t.get_by_role("button", name="Tiếp tục"), "tiep_tuc_2",
          cho=lambda: t.get_by_role("button", name="Đồng ý và nộp hồ sơ").wait_for())
    d.moc("buoc_3")
    d.snap(30)
    d.bam(t.get_by_role("button", name="Đồng ý và nộp hồ sơ"), "nop",
          cho=lambda: t.get_by_text(re.compile(r"HS\d{8}-\d{6}")).first.wait_for(timeout=90000))
    ctx["ma"] = re.search(r"HS\d{8}-\d{6}", t.inner_text("main")).group(0)
    d.moc("da_nop")
    d.an_con_tro()
    d.nhan_manh(t.get_by_text(ctx["ma"]).first, "ma_ho_so", giu=60)
    d.bam(t.get_by_role("button", name=re.compile("Tải .*PDF có ký số")).first, "bien_nhan",
          cho=lambda: t.get_by_role("status").filter(has_text=re.compile("ký")).first.wait_for(timeout=60000))
    d.nhan_manh(t.get_by_role("status").filter(has_text=re.compile("ký")).first, "da_ky_bien_nhan", giu=40)


def cho_hop_viec(t):
    """Cổng cán bộ giữ luồng SSE thông báo nên không bao giờ "networkidle": chờ bảng hồ sơ có dòng rồi để yên một nhịp."""
    t.get_by_role("link", name=re.compile(r"HS\d{8}-\d{6}")).first.wait_for(timeout=30000)
    t.wait_for_timeout(1500)


def hoan_thanh_buoc(d, cho, nhan):
    t = d.trang
    t.keyboard.press("Escape")
    d.bam(t.get_by_role("radio", name="Có").first, f"{nhan}_co", giu=6)
    d.bam(t.get_by_role("button", name="Hoàn thành bước"), f"{nhan}_hoan_thanh",
          cho=lambda: t.get_by_text(re.compile(cho)).first.wait_for(timeout=60000), giu=12)


def mo_ho_so(d, ma):
    t = d.trang
    d.bam(t.get_by_role("link", name=re.compile(ma)).first, "mo_ho_so",
          cho=lambda: t.get_by_role("heading", level=1, name=f"Hồ sơ {ma}").wait_for(), giu=20)


def doan_can_bo(d, ctx):
    t = d.trang
    t.goto(GW + "/can-bo")
    t.get_by_role("button", name="Đăng nhập").wait_for()
    d.snap(20)
    d.bam(t.get_by_role("button", name="Đăng nhập"), "dang_nhap")
    dang_nhap(d, "canbo01", ctx["mat_khau"], ctx["otp"])
    t.get_by_role("heading", level=1, name="Hộp việc").wait_for(timeout=30000)
    cho_hop_viec(t)
    d.moc("hop_viec")
    d.an_con_tro()
    d.snap(40)
    d.nhan_manh(t.get_by_role("link", name=re.compile("Sắp trễ hạn")).last, "the_sap_tre", giu=40)
    d.bam(t.get_by_role("navigation", name="Cổng cán bộ").get_by_role("link", name=re.compile("^Thông báo")), "thong_bao",
          cho=lambda: t.get_by_role("main").get_by_text(re.compile("sắp (trễ|tới) hạn", re.I)).first.wait_for(timeout=30000), giu=12)
    d.nhan_manh(t.get_by_role("main").get_by_role("listitem").filter(has_text=re.compile("sắp (trễ|tới) hạn", re.I)).first,
                "canh_bao", giu=40)
    d.bam(t.get_by_role("navigation", name="Cổng cán bộ").get_by_role("link", name=re.compile("^Hộp việc")), "ve_hop_viec",
          cho=lambda: t.get_by_role("heading", level=1, name="Hộp việc").wait_for(), giu=10)
    mo_ho_so(d, ctx["ma"])
    d.moc("chi_tiet")
    nut_xn = t.get_by_role("button", name="Xác nhận đúng với ảnh gốc")
    if nut_xn.count():
        d.nhan_manh(t.get_by_role("heading", name="Thông tin đọc từ giấy tờ"), "hitl", giu=30)
        for con in range(nut_xn.count(), 0, -1):
            d.bam(nut_xn.first, f"xac_nhan_{con}",
                  cho=lambda con=con: t.wait_for_function(
                      "n => [...document.querySelectorAll('button')].filter(b => b.textContent.includes("
                      "'Xác nhận đúng với ảnh gốc')).length < n", arg=con, timeout=30000), giu=10)
    d.moc("xu_ly")
    hoan_thanh_buoc(d, "Thẩm định", "tiep_nhan")
    hoan_thanh_buoc(d, "Phê duyệt", "tham_dinh")
    d.an_con_tro()
    d.nhan_manh(t.get_by_text(re.compile("Trạng thái hồ sơ")).first, "trang_thai_cho_lanh_dao", giu=40)


def doan_lanh_dao(d, ctx):
    t = d.trang
    t.goto(GW + "/can-bo")
    d.bam(t.get_by_role("button", name="Đăng nhập"), "dang_nhap")
    dang_nhap(d, "lanhdao01", ctx["mat_khau"], ctx["otp"])
    t.get_by_role("heading", level=1, name="Hộp việc").wait_for(timeout=30000)
    cho_hop_viec(t)
    d.moc("hop_viec")
    d.snap(30)
    mo_ho_so(d, ctx["ma"])
    d.nhan_manh(t.get_by_role("heading", name="Xử lý bước").locator("xpath=ancestor::*[@data-slot='card'][1]"), "o_phe_duyet", giu=30)
    d.moc("phe_duyet")
    hoan_thanh_buoc(d, "Hoàn tất|hoàn tất", "phe_duyet")
    d.an_con_tro()
    d.nhan_manh(t.get_by_text(re.compile("Trạng thái hồ sơ")).first, "trang_thai_hoan_tat", giu=45)
    ctx["trang_ld"] = t


def doan_ket_qua(d, ctx):
    t = d.trang
    t.goto(GW + "/ho-so")
    t.get_by_text(ctx["ma"]).first.wait_for(timeout=30000)
    d.snap(24)
    d.bam(t.get_by_text(ctx["ma"]).first, "mo_ho_so",
          cho=lambda: t.get_by_text(re.compile("Hồ sơ đã có kết quả")).first.wait_for(timeout=30000), giu=12)
    d.an_con_tro()
    d.nhan_manh(t.get_by_text(re.compile("Hồ sơ đã có kết quả")).first, "co_ket_qua", giu=40)
    nut = t.get_by_role("button", name=re.compile("Tải thông báo kết quả")).first
    with t.expect_download(timeout=60000) as tai:
        d.bam(nut, "tai_ket_qua", giu=20)
    pdf = Path(ctx["td"]) / "ket-qua.pdf"
    tai.value.save_as(pdf)
    tk = qv.token("congdan01", ctx["mat_khau"])
    yc = urllib.request.Request(f"{GW}/files/xac-minh", data=pdf.read_bytes(), method="POST",
                                headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/pdf"})
    with urllib.request.urlopen(yc, timeout=60) as r:
        kq = json.load(r)
    gon = {k: kq[k] for k in ("hopLe", "toanVen", "tinCay", "nguoiKy", "phatHanh") if k in kq}
    ctx["lenh"]["ket-qua"] = {
        "tieu_de": "Xác minh chữ ký số của thông báo kết quả vừa tải (pyHanko, chứng thư step-ca của xã)",
        "buoc": [{"lenh": "sha256sum ket-qua.pdf", "ket_qua": f"{qv._sha(pdf)}  ket-qua.pdf"},
                 {"lenh": "curl -H 'Authorization: Bearer $TOKEN' --data-binary @ket-qua.pdf http://localhost:9080/files/xac-minh",
                  "ket_qua": json.dumps(gon, ensure_ascii=False, indent=2)}]}


def doan_kiem_toan(d, ctx):
    tk = qv.token("lanhdao01", ctx["mat_khau"], ctx["otp"])
    ma, ra = qv.chay([sys.executable, "mot-cua/backend/kiem_toan.py", "--api", f"{GW}/api"], env=dict(os.environ, DXOS_TOKEN=tk))
    if ma:
        raise RuntimeError(f"kiem_toan.py mã {ma}: {ra[-400:]}")
    ctx["lenh"]["kiem-toan"] = {
        "tieu_de": "Nhật ký kiểm toán: tự tính lại chuỗi băm SHA-256 qua API, không tin hàm trong CSDL",
        "buoc": [{"lenh": "DXOS_TOKEN=<token lãnh đạo> python3 mot-cua/backend/kiem_toan.py --api http://localhost:9080/api",
                  "ket_qua": ra.strip()}]}
    # Đoạn này không có thao tác trên web: một khung trống để bản dựng biết độ dài tối thiểu.
    d.trang.goto("about:blank")
    d.snap(1)


def doan_superset(d, ctx):
    t = d.trang
    t.goto(GW + "/bao-cao/superset/dashboard/hieu-suat-mot-cua/")
    nut = t.get_by_role("button", name=re.compile("Sign in with Keycloak", re.I)).or_(
        t.get_by_role("link", name=re.compile("Sign in with Keycloak", re.I)))
    bieu_do = t.locator(".dashboard-chart, .chart-container")
    nut.or_(bieu_do).first.wait_for(timeout=60000)
    if nut.count():
        nut.first.click()
        t.locator("#username").or_(bieu_do).first.wait_for(timeout=60000)
        if t.locator("#username").count():
            qv.dang_nhap(t, "lanhdao01", ctx["mat_khau"], ctx["otp"])
    bieu_do.first.wait_for(timeout=90000)
    t.wait_for_load_state("networkidle", timeout=90000)
    # Biểu đồ Superset vẽ có chuyển động: chờ đứng yên hẳn rồi mới chụp (stop-motion, không rơi khung).
    t.wait_for_timeout(8000)
    d.moc("toan_canh")
    d.snap(60)
    o = t.locator(".dashboard-component-chart-holder")
    for i in range(min(3, o.count())):
        d.nhan_manh(o.nth(i), f"bieu_do_{i + 1}", giu=40)


def doan_cam_goi(d, ctx):
    _, ra1 = qv.chay([sys.executable, "scripts/goi_vi_du.py", "--ra", "thu-tuc"])
    _, ra2 = qv.chay(["docker", "compose", "run", "--rm", "--no-deps", "nap-thu-tuc"])
    ra2 = "\n".join(x for x in ra2.splitlines() if "nap-thu-tuc:" in x)
    ctx["lenh"]["cam-goi"] = {
        "tieu_de": "Cắm gói thủ tục mới: thêm một thư mục, không sửa dòng mã nào",
        "buoc": [{"lenh": "ls thu-tuc/", "ket_qua": "  ".join(sorted(p.name for p in (GOC / "thu-tuc").iterdir() if p.is_dir()))},
                 {"lenh": "ls thu-tuc/xac-nhan-cu-tru/", "ket_qua": "  ".join(sorted(p.name for p in (GOC / qv.THU_TUC_MOI).iterdir()))},
                 {"lenh": "make nap-thu-tuc", "ket_qua": ra2}]}
    t = d.trang
    t.goto(GW + "/")
    the = t.get_by_role("link", name=re.compile("Xác nhận thông tin về cư trú")).first
    the.wait_for(timeout=30000)
    d.moc("toan_canh")
    d.snap(30)
    d.cuon_toi(the, vi_tri=0.3, nac=24)
    d.nhan_manh(the.locator("xpath=ancestor::article[1]"), "the_moi", giu=40)
    d.bam(the, "mo_thu_tuc", cho=lambda: t.get_by_role("heading", level=1, name=re.compile("Xác nhận thông tin về cư trú")).wait_for(), giu=40)


DOAN = [("tro-ly", "cong-dan-1", doan_tro_ly), ("nop", "cong-dan", doan_nop), ("can-bo", "can-bo", doan_can_bo),
        ("lanh-dao", "lanh-dao", doan_lanh_dao), ("ket-qua", "cong-dan", doan_ket_qua),
        ("kiem-toan", "trong", doan_kiem_toan), ("superset", "lanh-dao", doan_superset), ("cam-goi", "cam-goi", doan_cam_goi)]


def main(ra_dir, chi=None, kenh=None):
    for cmd in ("ffmpeg", "docker"):
        if not shutil.which(cmd):
            sys.exit(f"LỖI: thiếu {cmd}")
    ra = Path(ra_dir).resolve()
    if GOC in ra.parents or ra == GOC:
        sys.exit("LỖI: khung hình phải ghi ngoài repo")
    ra.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright

    ctx = {"mat_khau": "demo-" + secrets.token_urlsafe(12), "otp": {t: secrets.token_hex(10) for t in qv.NGUOI_DUNG[1:]},
           "lenh": {}}
    meta = {"fps": FPS, "w": KHUNG["width"] * DPR, "h": KHUNG["height"] * DPR, "dpr": DPR, "doan": {}, "lenh": ctx["lenh"],
            "ngay": time.strftime("%Y-%m-%d")}
    qv.chuan_bi(ctx["mat_khau"], ctx["otp"])
    try:
        with tempfile.TemporaryDirectory(prefix="quay-khung-") as td, sync_playwright() as p:
            ctx["td"] = td
            trinh_duyet = p.chromium.launch(channel=kenh)
            phien = {}
            for ten, vai, ham in DOAN:
                if chi and ten not in chi:
                    continue
                if vai not in phien:
                    c = trinh_duyet.new_context(viewport=KHUNG, device_scale_factor=DPR, locale="vi-VN", accept_downloads=True,
                                                reduced_motion="reduce")
                    c.add_init_script(f"""document.addEventListener('DOMContentLoaded', () => {{
                        const s = document.createElement('style'); s.textContent = {json.dumps(qd.CHE_OTP)};
                        document.head.appendChild(s); }});""")
                    c.set_default_timeout(30000)
                    phien[vai] = c.new_page()
                d = Doan(ten, phien[vai], td)
                try:
                    ham(d, ctx)
                except Exception:
                    anh = ra / f"loi-{ten}.png"
                    phien[vai].screenshot(path=str(anh))
                    print(f"  LỖI ở đoạn {ten}: ảnh màn hình {anh}")
                    raise
                meta["doan"][ten] = d.xong(ra)
                if ten == "nop":
                    meta["ma_ho_so"] = ctx["ma"]
            trinh_duyet.close()
        (ra / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        print(f"  {ra / 'meta.json'}: {len(meta['doan'])} đoạn, {sum(x['khung'] for x in meta['doan'].values()) / FPS:.0f} giây")
    finally:
        qv.rut_goi()
        qv.tra_lai()
        print("  congdan01, canbo01, lanhdao01 đã trở lại như realm.json: chạy make demo-users, cài lại OTP")
