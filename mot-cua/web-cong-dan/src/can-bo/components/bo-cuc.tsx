// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Layout cổng cán bộ (#55; dựng lại ở #142): thanh bên tối cố định rộng 16 rem bên trái từ 1024 px (ThanhBenCanBo); dưới
// 1024 px cùng thanh bên đó nằm trong ngăn kéo (Sheet) mở bằng nút Menu. Phần phải: đầu trang dính, nền trắng mờ, có
// đường dẫn trang, chuông hồ sơ sắp trễ hạn và menu người dùng; nội dung nền slate nhạt, rộng tối đa 80 rem.
import { Menu } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useMatch } from "react-router";
import { GOC_CAN_BO } from "@/auth/oidc";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDuLieuCanBo } from "../du-lieu";
import { ChuongThongBao } from "./chuong-thong-bao";
import { MenuNguoiDung } from "./menu-nguoi-dung";
import { ThanhBenCanBo } from "./thanh-ben";

export { DUONG_BAO_CAO } from "./thanh-ben";

function TieuDeTrang() {
  const hoSo = useMatch(`${GOC_CAN_BO}/ho-so/:id`);
  const soVanBan = useMatch(`${GOC_CAN_BO}/van-ban`);
  const thongBao = useMatch(`${GOC_CAN_BO}/thong-bao`);
  const wiki = useMatch(`${GOC_CAN_BO}/wiki/*`);
  const lich = useMatch(`${GOC_CAN_BO}/lich`);
  const { viec, hoSoDangXem } = useDuLieuCanBo();
  if (soVanBan) return <span className="truncate font-semibold">Sổ văn bản</span>;
  if (wiki) return <span className="truncate font-semibold">Wiki văn bản</span>;
  if (lich) return <span className="truncate font-semibold">Lịch công tác</span>;
  if (thongBao) return <span className="truncate font-semibold">Thông báo</span>;
  if (!hoSo) return <span className="truncate font-semibold">Hộp việc</span>;
  const ma =
    (hoSoDangXem && hoSoDangXem.id === hoSo.params.id ? hoSoDangXem.ma : null) ??
    viec.find((v) => v.task.hoSoId === hoSo.params.id)?.task.maHoSo;
  return (
    <nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-2">
      <Link to={GOC_CAN_BO} className="font-semibold text-link">
        Hộp việc
      </Link>
      <span aria-hidden="true" className="text-muted-foreground">
        /
      </span>
      <span aria-current="page" className="truncate font-semibold">
        {ma ? `Hồ sơ ${ma}` : "Chi tiết hồ sơ"}
      </span>
    </nav>
  );
}

export function BoCucCanBo() {
  const [mo, datMo] = useState(false);
  return (
    <div className="flex min-h-dvh bg-slate-50/60">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-foreground focus:px-4 focus:py-3 focus:text-background"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <ThanhBenCanBo className="fixed inset-y-0 left-0 z-50 hidden h-dvh lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/60 bg-white/80 px-3 backdrop-blur-md sm:px-6 md:px-8">
          <Sheet open={mo} onOpenChange={datMo}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl hover:bg-slate-100 lg:hidden" aria-label="Mở menu">
                <Menu aria-hidden="true" className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} className="w-64 gap-0 border-none p-0 shadow-2xl">
              <SheetTitle className="sr-only">Menu cổng cán bộ</SheetTitle>
              <SheetDescription className="sr-only">Điều hướng các chức năng của cổng cán bộ</SheetDescription>
              <ThanhBenCanBo className="w-full border-none" onChon={() => datMo(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <TieuDeTrang />
          </div>
          <ChuongThongBao />
          <span aria-hidden="true" className="hidden h-8 w-px bg-slate-200 sm:block" />
          <MenuNguoiDung />
        </header>
        <main id="noi-dung" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
