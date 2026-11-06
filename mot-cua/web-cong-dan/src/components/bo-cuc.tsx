// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung trang: đầu trang trắng một hàng (biểu tượng, tên cổng, đăng nhập/đăng xuất), dải "bản thử
// nghiệm", nội dung, chân trang. Bố cục tham khảo shadcn-admin (satnaing, MIT); không chép mã.
// Điện thoại, máy tính bảng (< 1024 px, #140): chỉ biểu tượng, tên ngắn và nút "Menu"; liên kết và tài khoản nằm trong ngăn kéo
// (Sheet của shadcn/ui) để tên cổng không bị ép thành cột hẹp.
import { FolderOpen, LogIn, LogOut, Menu, MessageCircleQuestionMark, Search, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { tenHienThi, useXacThuc } from "@/auth/xac-thuc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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

const LIEN_KET = [
  { den: "/hoi-dap", ten: "Hỏi đáp", bieuTuong: MessageCircleQuestionMark, canDangNhap: false },
  { den: "/tra-cuu", ten: "Tra cứu hồ sơ", bieuTuong: Search, canDangNhap: false },
  { den: "/ho-so", ten: "Hồ sơ của tôi", bieuTuong: FolderOpen, canDangNhap: true },
];

/** Liên kết đầu trang: hỏi đáp (#91) và tra cứu không cần đăng nhập; "Hồ sơ của tôi" khi đã đăng nhập (#54). */
function LienKetHoSo({ doc = false, onChon }: { doc?: boolean; onChon?: () => void }) {
  const { nguoiDung } = useXacThuc();
  const lop = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-2 rounded-md px-3 font-semibold no-underline ${doc ? "min-h-12 text-lg" : ""} ${isActive ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"}`;
  return (
    <>
      {LIEN_KET.filter((l) => !l.canDangNhap || nguoiDung).map(({ den, ten, bieuTuong: BieuTuong }) => (
        <NavLink key={den} to={den} className={lop} onClick={onChon}>
          <BieuTuong aria-hidden="true" className="size-5" />
          {ten}
        </NavLink>
      ))}
    </>
  );
}

/** Ngăn kéo điều hướng trên điện thoại. */
function MenuDienThoai() {
  const [mo, datMo] = useState(false);
  const { nguoiDung, dangTai, dangNhap, dangXuat } = useXacThuc();
  const { pathname } = useLocation();
  return (
    <Sheet open={mo} onOpenChange={datMo}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="lg:hidden">
          <Menu aria-hidden="true" />
          Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="w-[85%] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <SheetTitle className="text-lg font-bold">Cổng dịch vụ công xã</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="Đóng menu">
              <X aria-hidden="true" className="size-6" />
            </Button>
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Liên kết chính và tài khoản</SheetDescription>
        <nav aria-label="Liên kết chính" className="flex flex-col gap-1 p-3">
          <NavLink
            to="/"
            end
            onClick={() => datMo(false)}
            className={({ isActive }) =>
              `flex min-h-12 items-center rounded-md px-3 text-lg font-semibold no-underline ${isActive ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"}`
            }
          >
            Danh mục thủ tục
          </NavLink>
          <LienKetHoSo doc onChon={() => datMo(false)} />
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t p-4">
          {!dangTai && nguoiDung && (
            <p className="flex items-center gap-2">
              <UserRound aria-hidden="true" className="size-5 text-muted-foreground" />
              <strong>{tenHienThi(nguoiDung)}</strong>
            </p>
          )}
          {!dangTai &&
            (nguoiDung ? (
              <Button variant="outline" onClick={() => dangXuat()}>
                <LogOut aria-hidden="true" />
                Đăng xuất
              </Button>
            ) : (
              <Button onClick={() => dangNhap(pathname)}>
                <LogIn aria-hidden="true" />
                Đăng nhập
              </Button>
            ))}
        </div>
      </SheetContent>
    </Sheet>
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
          <span className="basis-full lg:hidden">
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
              <span className="text-lg font-bold whitespace-nowrap">
                <span className="hidden sm:inline">Cổng dịch vụ công xã</span>
                <span className="sm:hidden">Dịch vụ công xã</span>
              </span>
              <span className="hidden text-sm text-muted-foreground xl:block">Commune DX-OS · Chính quyền số Cấp xã</span>
            </span>
          </Link>
          <nav aria-label="Tài khoản" className="hidden shrink-0 items-center gap-2 lg:flex">
            <LienKetHoSo />
            <NutTaiKhoan />
          </nav>
          <MenuDienThoai />
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
