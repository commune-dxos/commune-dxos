// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đầu trang cổng công dân (#141): dải "bản thử nghiệm" tối, thanh trắng dính trên cùng (biểu tượng, tên cổng, ô tìm thủ
// tục bo tròn, liên kết, đăng nhập). Dưới 1024 px (#140) chỉ còn biểu tượng, tên ngắn và nút "Menu" mở ngăn kéo (Sheet).
import { FolderOpen, LogIn, LogOut, Menu, MessageCircleQuestionMark, Search, UserRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { tenHienThi, useXacThuc } from "@/auth/xac-thuc";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function NutTaiKhoan() {
  const { nguoiDung, dangTai, dangNhap, dangXuat } = useXacThuc();
  if (dangTai) return <span className="h-11 w-32" aria-hidden="true" />;
  if (!nguoiDung) {
    return (
      <Button size="sm" onClick={() => dangNhap()}>
        <LogIn aria-hidden="true" />
        Đăng nhập
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-base">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 font-black text-white shadow-md shadow-primary/20"
        >
          {tenHienThi(nguoiDung).trim().split(/\s+/).pop()?.charAt(0) ?? "?"}
        </span>
        <span className="sr-only font-bold 2xl:not-sr-only">Đã đăng nhập: {tenHienThi(nguoiDung)}</span>
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
    `flex min-h-11 items-center gap-2 rounded-xl px-3.5 font-bold no-underline transition-colors ${doc ? "min-h-12 text-lg" : "text-base"} ${isActive ? "bg-teal-50 text-primary ring-1 ring-teal-600/20" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"}`;
  return (
    <>
      {LIEN_KET.filter((l) => !l.canDangNhap || nguoiDung).map(({ den, ten, bieuTuong: BieuTuong }) => (
        <NavLink key={den} to={den} className={lop} onClick={onChon}>
          <BieuTuong aria-hidden="true" className="size-4.5 text-primary" />
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
              `flex min-h-12 items-center rounded-xl px-4 text-lg font-bold no-underline ${isActive ? "bg-primary-soft text-primary-soft-foreground" : "text-foreground hover:bg-muted"}`
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
  return (
    <div className="border-b border-teal-900/15 bg-teal-950 text-teal-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-sm sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-400/30 bg-teal-900/80 px-2 py-0.5 text-xs font-bold tracking-wider text-teal-200 uppercase">
            <span className="size-1.5 rounded-full bg-teal-400" aria-hidden="true" />
            Thử nghiệm
          </span>
          <span className="text-teal-100/90">
            <span className="hidden sm:inline">Hệ thống dịch vụ công cấp xã · Dữ liệu trên cổng là dữ liệu mẫu phục vụ kiểm thử.</span>
            <span className="sm:hidden">Dữ liệu mẫu, không phải hồ sơ thật.</span>
          </span>
        </div>
        <Link to="/can-bo" className="hidden font-semibold text-teal-200 no-underline hover:text-white hover:underline md:inline">
          Cổng cán bộ →
        </Link>
      </div>
    </div>
  );
}

/** Ô tìm thủ tục ở đầu trang (trừ trang chủ, nơi đã có ô tìm lớn): chuyển về danh mục với ?tim=. */
function OTimNhanh() {
  const [q, datQ] = useState("");
  const dieuHuong = useNavigate();
  const gui = (e: FormEvent) => {
    e.preventDefault();
    dieuHuong(`/?tim=${encodeURIComponent(q.trim())}#danh-muc`);
  };
  return (
    <form role="search" onSubmit={gui} className="relative hidden w-full max-w-64 min-w-44 xl:block">
      <label htmlFor="tim-nhanh" className="sr-only">
        Tìm nhanh thủ tục
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400" />
      <input
        id="tim-nhanh"
        type="search"
        value={q}
        onChange={(e) => datQ(e.target.value)}
        placeholder="Tìm nhanh thủ tục…"
        autoComplete="off"
        className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50/80 pr-3.5 pl-10 text-base outline-none transition-colors placeholder:text-slate-500 focus-visible:border-primary focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-primary/20"
      />
    </form>
  );
}

export function DauTrang() {
  const { pathname } = useLocation();
  return (
    <>
    <DaiThuNghiem />
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="group flex min-w-0 shrink-0 items-center gap-3 rounded-xl text-foreground no-underline">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-teal-600/20 bg-teal-50/50 p-1 shadow-2xs transition-transform group-hover:scale-105">
            <img src="/mark-64.png" alt="" width={38} height={38} className="size-9 shrink-0" />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-lg font-black tracking-tight text-slate-950 whitespace-nowrap">
              <span className="hidden sm:inline">Cổng dịch vụ công xã</span>
              <span className="sm:hidden">Dịch vụ công xã</span>
            </span>
            <span className="mt-1 hidden text-xs font-bold tracking-[0.14em] text-primary uppercase sm:block">
              Commune DX-OS · Một cửa điện tử
            </span>
          </span>
        </Link>
        {pathname !== "/" && <OTimNhanh />}
        <nav aria-label="Tài khoản" className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <LienKetHoSo />
          <span aria-hidden="true" className="mx-2 h-7 w-px bg-slate-200" />
          <NutTaiKhoan />
        </nav>
        <MenuDienThoai />
      </div>
    </header>
    </>
  );
}
