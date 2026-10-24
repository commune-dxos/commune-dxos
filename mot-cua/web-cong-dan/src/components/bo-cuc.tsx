// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung trang: đầu trang trắng một hàng (biểu tượng, tên cổng, đăng nhập/đăng xuất), dải "bản thử
// nghiệm", nội dung, chân trang. Bố cục tham khảo shadcn-admin (satnaing, MIT); không chép mã.
import { FolderOpen, LogIn, LogOut, Search, UserRound } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
import { tenHienThi, useXacThuc } from "@/auth/xac-thuc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function NutTaiKhoan() {
  const { nguoiDung, dangTai, dangNhap, dangXuat } = useXacThuc();
  if (dangTai) return <span className="h-11 w-32" aria-hidden="true" />;
  if (!nguoiDung) {
    return (
      <Button variant="outline" size="sm" onClick={() => dangNhap()}>
        <LogIn aria-hidden="true" />
        Đăng nhập
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="hidden items-center gap-2 text-base md:flex">
        <UserRound aria-hidden="true" className="size-5 text-muted-foreground" />
        <span className="font-semibold">{tenHienThi(nguoiDung)}</span>
      </span>
      <Button variant="outline" size="sm" onClick={() => dangXuat()}>
        <LogOut aria-hidden="true" />
        Đăng xuất
      </Button>
    </div>
  );
}

/** Liên kết đầu trang: tra cứu không cần đăng nhập; "Hồ sơ của tôi" khi đã đăng nhập (#54). */
function LienKetHoSo() {
  const { nguoiDung } = useXacThuc();
  const lop = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-2 rounded-md px-3 font-semibold no-underline ${isActive ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"}`;
  return (
    <>
      <NavLink to="/tra-cuu" className={lop}>
        <Search aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">Tra cứu hồ sơ</span>
        <span className="sr-only sm:hidden">Tra cứu hồ sơ</span>
      </NavLink>
      {nguoiDung && (
        <NavLink to="/ho-so" className={lop}>
          <FolderOpen aria-hidden="true" className="size-5" />
          <span className="hidden sm:inline">Hồ sơ của tôi</span>
          <span className="sr-only sm:hidden">Hồ sơ của tôi</span>
        </NavLink>
      )}
    </>
  );
}

function DaiThuNghiem() {
  const { nguoiDung } = useXacThuc();
  return (
    <div className="border-b bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-base sm:px-6">
        <Badge variant="secondary">Thử nghiệm</Badge>
        <span className="text-muted-foreground">Dữ liệu trên cổng là dữ liệu mẫu, không phải hồ sơ thật.</span>
        {nguoiDung && (
          <span className="basis-full md:hidden">
            Đã đăng nhập: <strong>{tenHienThi(nguoiDung)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export function BoCuc() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-3 focus:text-background"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <header className="border-b-4 border-primary bg-background">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3 rounded-md text-foreground no-underline">
            <img src="/mark-64.png" alt="" width={44} height={44} className="size-11 shrink-0" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-base font-bold sm:text-lg">Cổng dịch vụ công xã</span>
              <span className="hidden text-sm text-muted-foreground sm:block">Commune DX-OS · Chính quyền số Cấp xã</span>
            </span>
          </Link>
          <nav aria-label="Tài khoản" className="flex shrink-0 items-center gap-1 sm:gap-2">
            <LienKetHoSo />
            <NutTaiKhoan />
          </nav>
        </div>
      </header>
      <DaiThuNghiem />
      <main id="noi-dung" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <footer className="border-t bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[auto_1fr] md:gap-16">
          <img src="/logo-ngang.png" alt="Commune DX-OS – Chính quyền số Cấp xã" width={240} height={73} className="h-auto w-60" />
          <div className="flex flex-col gap-3 text-base text-muted-foreground">
            <p>
              Bản thử nghiệm của dự án mã nguồn mở Commune DX-OS, giấy phép GPL-3.0-or-later. Dữ liệu trên cổng là dữ liệu
              mẫu, không phải hồ sơ thật.
            </p>
            <p className="flex flex-wrap gap-x-6 gap-y-2">
              <a className="text-link underline" href="https://github.com/commune-dxos/commune-dxos">
                Mã nguồn
              </a>
              <a className="text-link underline" href="https://commune-dxos.github.io/commune-dxos/">
                Tài liệu
              </a>
              <span>DTU_DZ_2 · OLP PMNM 2026</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
