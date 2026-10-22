// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung trang: đầu trang (tên cổng, đăng nhập/đăng xuất), nội dung, chân trang.
import { Link, Outlet } from "react-router";
import { tenHienThi, useXacThuc } from "@/auth/xac-thuc";
import { Button } from "@/components/ui/button";

function NutTaiKhoan() {
  const { nguoiDung, dangTai, dangNhap, dangXuat } = useXacThuc();
  if (dangTai) return null;
  if (!nguoiDung) {
    return (
      <Button variant="outline" className="border-white bg-transparent text-white hover:bg-white/15" onClick={() => dangNhap()}>
        Đăng nhập
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <span className="text-base">
        Xin chào, <strong>{tenHienThi(nguoiDung)}</strong>
      </span>
      <Button variant="ghost" className="text-white hover:bg-white/15" onClick={() => dangXuat()}>
        Đăng xuất
      </Button>
    </div>
  );
}

export function BoCuc() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src="/favicon.svg" alt="" width={40} height={40} className="rounded-md ring-2 ring-white/40" />
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-bold">Cổng dịch vụ công xã</span>
              <span className="text-sm opacity-90">Nộp hồ sơ trực tuyến · Commune DX-OS</span>
            </span>
          </Link>
          <NutTaiKhoan />
        </div>
      </header>
      <main id="noi-dung" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="border-t-2 bg-muted">
        <div className="mx-auto max-w-5xl px-4 py-4 text-base text-muted-foreground">
          Bản thử nghiệm của dự án mã nguồn mở Commune DX-OS (GPL-3.0-or-later). Dữ liệu trên cổng là dữ liệu mẫu, không
          phải hồ sơ thật.
        </div>
      </footer>
    </div>
  );
}
