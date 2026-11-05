// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung trang: dải "bản thử nghiệm" tối, đầu trang trắng dính trên cùng (biểu tượng, tên cổng, ô tìm thủ tục bo tròn,
// liên kết, đăng nhập), nội dung, chân trang tối 4 cột (#141).
// Điện thoại, máy tính bảng (< 1024 px, #140): chỉ biểu tượng, tên ngắn và nút "Menu"; liên kết và tài khoản nằm trong ngăn kéo
// (Sheet của shadcn/ui) để tên cổng không bị ép thành cột hẹp.
import { FolderOpen, LogIn, LogOut, Menu, MessageCircleQuestionMark, Search, UserRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
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
    `flex min-h-11 items-center gap-2 rounded-full px-4 font-bold no-underline ${doc ? "min-h-12 rounded-xl text-lg" : ""} ${isActive ? "bg-primary-soft text-primary-soft-foreground" : "text-slate-700 hover:bg-slate-100 hover:text-foreground"}`;
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
    <div className="bg-slate-900 text-slate-200">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <span className="rounded-full bg-teal-400/15 px-3 py-0.5 text-sm font-bold tracking-[0.15em] text-teal-200 uppercase">
          Thử nghiệm
        </span>
        <span>
          <span className="hidden sm:inline">Dữ liệu trên cổng là dữ liệu mẫu, không phải hồ sơ thật.</span>
          <span className="sm:hidden">Dữ liệu mẫu, không phải hồ sơ thật.</span>
        </span>
      </div>
    </div>
  );
}

/** Ô tìm thủ tục bo tròn ở đầu trang (trừ trang chủ, nơi đã có ô tìm lớn): chuyển về danh mục với ?tim=. */
function OTimNhanh() {
  const [q, datQ] = useState("");
  const dieuHuong = useNavigate();
  const gui = (e: FormEvent) => {
    e.preventDefault();
    dieuHuong(`/?tim=${encodeURIComponent(q.trim())}#danh-muc`);
  };
  return (
    <form role="search" onSubmit={gui} className="relative hidden w-full max-w-64 min-w-40 xl:block">
      <label htmlFor="tim-nhanh" className="sr-only">
        Tìm nhanh thủ tục
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-500" />
      <input
        id="tim-nhanh"
        type="search"
        value={q}
        onChange={(e) => datQ(e.target.value)}
        placeholder="Tìm thủ tục…"
        autoComplete="off"
        className="h-11 w-full rounded-full border-2 border-slate-200 bg-slate-50 pr-4 pl-11 text-base outline-none placeholder:text-slate-500 focus-visible:border-ring focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
    </form>
  );
}

function CotChanTrang({ tieuDe, children }: { tieuDe: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold tracking-[0.2em] text-white uppercase">{tieuDe}</h2>
      <ul className="flex flex-col gap-3">{children}</ul>
    </div>
  );
}

const LOP_LIEN_KET_CHAN = "text-slate-300 no-underline underline-offset-4 hover:text-white hover:underline";

export function BoCuc() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-3 focus:text-background"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <DaiThuNghiem />
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex min-w-0 shrink-0 items-center gap-3 rounded-xl text-foreground no-underline">
            <img src="/mark-64.png" alt="" width={44} height={44} className="size-11 shrink-0 transition-transform group-hover:scale-105" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-lg font-black tracking-tight whitespace-nowrap">
                <span className="hidden sm:inline">Cổng dịch vụ công xã</span>
                <span className="sm:hidden">Dịch vụ công xã</span>
              </span>
              <span className="mt-1 hidden text-sm font-bold tracking-[0.2em] text-primary uppercase xl:block">Commune DX-OS</span>
            </span>
          </Link>
          {pathname !== "/" && <OTimNhanh />}
          <nav aria-label="Tài khoản" className="hidden shrink-0 items-center gap-1 lg:flex">
            <LienKetHoSo />
            <span aria-hidden="true" className="mx-2 h-8 w-px bg-slate-200" />
            <NutTaiKhoan />
          </nav>
          <MenuDienThoai />
        </div>
      </header>
      <main id="noi-dung" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <footer className="nen-toi border-t border-slate-800 bg-slate-900 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <span className="flex items-center gap-3">
              {/* Quy tắc nhận diện: biểu tượng trong suốt đặt trong ô nền trắng khi nằm trên nền tối. */}
              <span className="flex size-12 items-center justify-center rounded-xl bg-white p-1">
                <img src="/mark-64.png" alt="" width={40} height={40} className="size-10" />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-lg font-black tracking-tight text-white">COMMUNE DX-OS</span>
                <span className="text-slate-400">Chính quyền số Cấp xã</span>
              </span>
            </span>
            <p>Làm thủ tục hành chính của xã trực tuyến: xem giấy tờ cần có, nộp hồ sơ, theo dõi kết quả.</p>
          </div>
          <CotChanTrang tieuDe="Dịch vụ">
            <li>
              <Link to="/#danh-muc" className={LOP_LIEN_KET_CHAN}>
                Danh mục thủ tục
              </Link>
            </li>
            <li>
              <Link to="/tra-cuu" className={LOP_LIEN_KET_CHAN}>
                Tra cứu hồ sơ
              </Link>
            </li>
            <li>
              <Link to="/hoi-dap" className={LOP_LIEN_KET_CHAN}>
                Hỏi đáp thủ tục
              </Link>
            </li>
            <li>
              <Link to="/ho-so" className={LOP_LIEN_KET_CHAN}>
                Hồ sơ của tôi
              </Link>
            </li>
          </CotChanTrang>
          <CotChanTrang tieuDe="Tài liệu">
            <li>
              <a className={LOP_LIEN_KET_CHAN} href="https://commune-dxos.github.io/commune-dxos/">
                Tài liệu dự án
              </a>
            </li>
            <li>
              <a className={LOP_LIEN_KET_CHAN} href="https://commune-dxos.github.io/commune-dxos/thu-nghiem/">
                Hướng dẫn dùng thử
              </a>
            </li>
            <li>
              <a className={LOP_LIEN_KET_CHAN} href="https://github.com/commune-dxos/commune-dxos">
                Mã nguồn
              </a>
            </li>
          </CotChanTrang>
          <CotChanTrang tieuDe="Dự án">
            <li>Đội DTU_DZ_2 · OLP PMNM 2026</li>
            <li>Giấy phép GPL-3.0-or-later</li>
            <li>Bản thử nghiệm, dữ liệu mẫu</li>
          </CotChanTrang>
        </div>
        <div className="border-t border-slate-800">
          <p className="mx-auto max-w-6xl px-4 py-5 text-slate-400 sm:px-6">© 2026 DTU_DZ_2 · Phần mềm mã nguồn mở</p>
        </div>
      </footer>
    </div>
  );
}
