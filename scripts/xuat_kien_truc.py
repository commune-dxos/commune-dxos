# SPDX-FileCopyrightText: 2026 DTU_DZ_2
# SPDX-License-Identifier: GPL-3.0-or-later
"""Xuất sơ đồ kiến trúc động docs/images/kien-truc-dong.svg ra GIF (README) và MP4 (slide trình bày).

Chromium headless (Playwright) mở SVG, dừng đồng hồ SMIL rồi chụp từng khung ở đúng thời điểm
(setCurrentTime), nên khung hình đều và vòng lặp khép kín. ffmpeg ghép khung thành MP4 H.264 và GIF
có bảng màu riêng (palettegen/paletteuse). Playwright và ffmpeg chỉ là công cụ trên máy người xuất,
không phải phụ thuộc của dự án (#43).

Cài một lần (venv và Chromium nằm ngoài git):
    python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements-xuat.txt
    .venv/bin/playwright install chromium     # hoặc --kenh chrome để dùng Google Chrome có sẵn
    brew install ffmpeg                        # hoặc apt install ffmpeg
Chạy: make xuat-kien-truc XUAT_PY=.venv/bin/python
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

GOC = Path(__file__).resolve().parent.parent
SVG = GOC / "docs/images/kien-truc-dong.svg"
GIF = GOC / "docs/images/kien-truc-dong.gif"
MP4 = GOC / "docs/media/kien-truc-dong.mp4"
GIF_TOI_DA = 5 * 1024 * 1024


def thoi_luong(svg: Path) -> float:
    """Độ dài một vòng animation: mọi thẻ animate trong SVG dùng chung dur."""
    ds = set(re.findall(r'dur="([\d.]+)s"', svg.read_text(encoding="utf-8")))
    if len(ds) != 1:
        sys.exit(f"LỖI: {svg.name} cần đúng một giá trị dur chung, thấy {sorted(ds) or 'không có'}")
    return float(ds.pop())


def chup_khung(svg: Path, thu_muc: Path, fps: int, rong: int, kenh: str | None) -> int:
    from playwright.sync_api import Error, sync_playwright

    dur = thoi_luong(svg)
    so_khung = round(dur * fps)
    with sync_playwright() as p:
        try:
            trinh_duyet = p.chromium.launch(channel=kenh)
        except Error as e:
            sys.exit(f"LỖI: không mở được Chromium ({e.message.splitlines()[0]}).\n"
                     "Chạy .venv/bin/playwright install chromium, hoặc thêm KENH=chrome nếu máy có Google Chrome.")
        trang = trinh_duyet.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=rong / 1600)
        trang.goto(svg.as_uri())
        trang.evaluate("document.documentElement.pauseAnimations()")
        for i in range(so_khung):
            # Khung cuối dừng trước t = dur một khung, nên MP4/GIF lặp lại không giật.
            trang.evaluate("t => document.documentElement.setCurrentTime(t)", i / fps)
            trang.screenshot(path=str(thu_muc / f"k{i:04d}.png"))
        trinh_duyet.close()
    return so_khung


def ffmpeg(*doi_so: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *doi_so], check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fps", type=int, default=30, help="khung/giây của MP4 (mặc định 30)")
    ap.add_argument("--rong-mp4", type=int, default=1920, help="chiều ngang MP4, giữ tỉ lệ 16:9 (mặc định 1920)")
    ap.add_argument("--fps-gif", type=int, default=12, help="khung/giây của GIF (mặc định 12)")
    ap.add_argument("--rong-gif", type=int, default=1200, help="chiều ngang GIF (mặc định 1200)")
    ap.add_argument("--kenh", default=os.environ.get("KENH") or None,
                    help="kênh trình duyệt của Playwright, ví dụ chrome; bỏ trống = Chromium của Playwright")
    ap.add_argument("--mp4", type=Path, default=MP4, help=f"tệp MP4 ra (mặc định {MP4.relative_to(GOC)}, ngoài git)")
    a = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("LỖI: chưa có ffmpeg — brew install ffmpeg (macOS) hoặc apt install ffmpeg (Linux)")

    with tempfile.TemporaryDirectory(prefix="kien-truc-") as tam:
        tam = Path(tam)
        n = chup_khung(SVG, tam, a.fps, a.rong_mp4, a.kenh)
        print(f"Đã chụp {n} khung {a.rong_mp4}×{a.rong_mp4 * 9 // 16} từ {SVG.relative_to(GOC)}")

        a.mp4.parent.mkdir(parents=True, exist_ok=True)
        ffmpeg("-framerate", str(a.fps), "-i", str(tam / "k%04d.png"),
               "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
               "-movflags", "+faststart", str(a.mp4))
        ffmpeg("-framerate", str(a.fps), "-i", str(tam / "k%04d.png"), "-vf",
               f"fps={a.fps_gif},scale={a.rong_gif}:-1:flags=lanczos,split[a][b];"
               "[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
               "-loop", "0", str(GIF))

    for tep in (a.mp4, GIF):
        print(f"{tep}: {tep.stat().st_size / 1024 / 1024:.2f} MB")
    if GIF.stat().st_size > GIF_TOI_DA:
        sys.exit("LỖI: GIF vượt 5 MB — giảm --fps-gif hoặc --rong-gif")


if __name__ == "__main__":
    main()
