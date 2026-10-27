// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung cổng cán bộ theo bố cục shadcn-admin (satnaing/shadcn-admin, MIT; tham khảo bố cục, không
// chép mã): thanh bên (Sidebar của shadcn/ui; dưới 768px thành ngăn kéo), đầu trang có nút thu thanh
// bên, đường dẫn trang, chuông hồ sơ sắp trễ hạn và menu người dùng; nội dung bên phải. Lãnh đạo có
// thêm liên kết dashboard báo cáo (Superset ở /bao-cao, đăng nhập SSO cùng Keycloak, #82).
import { AlarmClockOff, Bell, BookOpen, ChartColumn, ExternalLink, Hourglass, Inbox, LibraryBig, UserCheck } from "lucide-react";
import { Link, Outlet, useLocation, useMatch } from "react-router";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { GOC_CAN_BO } from "@/auth/oidc";
import { useDuLieuCanBo } from "../du-lieu";
import { demTheoHan } from "../lib/hop-viec";
import { TEN_VAI_TRO } from "../lib/quyen";
import { ChuongThongBao } from "./chuong-thong-bao";
import { MenuNguoiDung } from "./menu-nguoi-dung";

const LOP_MUC = "h-11 gap-3 px-3 text-base [&>svg]:size-5";

function MucMenu({
  den,
  nhan,
  bieuTuong: BieuTuong,
  dem,
  dangMo,
  donVi = "hồ sơ",
}: {
  den: string;
  nhan: string;
  bieuTuong: typeof Inbox;
  dem?: number;
  dangMo: boolean;
  /** Đơn vị của số đếm cho trình đọc màn hình. */
  donVi?: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={dangMo} className={LOP_MUC}>
        <Link to={den} aria-current={dangMo ? "page" : undefined} onClick={() => setOpenMobile(false)}>
          <BieuTuong aria-hidden="true" />
          <span>{nhan}</span>
        </Link>
      </SidebarMenuButton>
      {dem !== undefined && dem > 0 && (
        <SidebarMenuBadge className="top-2.5 right-2 text-sm">
          {dem}
          <span className="sr-only"> {donVi}</span>
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

function ThanhBen() {
  const { viec, vaiTro, canBo, chuaDoc } = useDuLieuCanBo();
  const { pathname, search } = useLocation();
  const dem = demTheoHan(viec);
  const oHopViec = pathname.replace(/\/$/, "") === GOC_CAN_BO;
  const oSoVanBan = pathname.replace(/\/$/, "") === `${GOC_CAN_BO}/van-ban`;
  const oThongBao = pathname.replace(/\/$/, "") === `${GOC_CAN_BO}/thong-bao`;
  const oWiki = pathname.startsWith(`${GOC_CAN_BO}/wiki`);
  const q = new URLSearchParams(search);
  const loc = q.get("han") ?? q.get("trang_thai") ?? "";
  const linhVuc = canBo?.linh_vuc.map((l) => l.ten).join(", ");
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to={GOC_CAN_BO} className="flex items-center gap-3 rounded-md p-2 text-sidebar-foreground no-underline">
          <img src="/mark-64.png" alt="" width={40} height={40} className="size-10 shrink-0" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-base font-bold">Cổng cán bộ</span>
            <span className="truncate text-sm text-muted-foreground">Commune DX-OS</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {vaiTro !== "van_thu" && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">Xử lý hồ sơ</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <MucMenu den={GOC_CAN_BO} nhan="Hộp việc" bieuTuong={Inbox} dem={viec.length} dangMo={oHopViec && loc === ""} />
              <MucMenu
                den={`${GOC_CAN_BO}?han=qua_han`}
                nhan="Quá hạn"
                bieuTuong={AlarmClockOff}
                dem={dem.qua_han}
                dangMo={oHopViec && loc === "qua_han"}
              />
              <MucMenu
                den={`${GOC_CAN_BO}?han=sap_tre`}
                nhan="Sắp trễ hạn"
                bieuTuong={Hourglass}
                dem={dem.sap_tre}
                dangMo={oHopViec && loc === "sap_tre"}
              />
              <MucMenu
                den={`${GOC_CAN_BO}?trang_thai=cua_toi`}
                nhan="Tôi đang xử lý"
                bieuTuong={UserCheck}
                dem={viec.filter((v) => v.cuaToi).length}
                dangMo={oHopViec && loc === "cua_toi"}
              />
              <MucMenu
                den={`${GOC_CAN_BO}/thong-bao`}
                nhan="Thông báo"
                bieuTuong={Bell}
                dem={chuaDoc}
                donVi="thông báo chưa đọc"
                dangMo={oThongBao}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">Văn bản</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <MucMenu den={`${GOC_CAN_BO}/van-ban`} nhan="Sổ văn bản" bieuTuong={BookOpen} dangMo={oSoVanBan} />
              <MucMenu den={`${GOC_CAN_BO}/wiki`} nhan="Wiki văn bản" bieuTuong={LibraryBig} dangMo={oWiki} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">Khác</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {vaiTro === "lanh_dao" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={LOP_MUC}>
                    <a href={DUONG_BAO_CAO}>
                      <ChartColumn aria-hidden="true" />
                      <span>Báo cáo hiệu suất</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild className={LOP_MUC}>
                  <a href="/">
                    <ExternalLink aria-hidden="true" />
                    <span>Cổng công dân</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4 text-sm">
        <p className="font-semibold">{TEN_VAI_TRO[vaiTro]}</p>
        <p className="text-muted-foreground">
          {vaiTro === "lanh_dao"
            ? "Phê duyệt, ký các bước của lãnh đạo"
            : vaiTro === "van_thu"
              ? "Vào sổ văn bản đến, soạn văn bản đi"
              : linhVuc
                ? `Lĩnh vực: ${linhVuc}`
                : "Chưa được giao lĩnh vực"}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}

function TieuDeTrang() {
  const hoSo = useMatch(`${GOC_CAN_BO}/ho-so/:id`);
  const soVanBan = useMatch(`${GOC_CAN_BO}/van-ban`);
  const thongBao = useMatch(`${GOC_CAN_BO}/thong-bao`);
  const wiki = useMatch(`${GOC_CAN_BO}/wiki/*`);
  const { viec, hoSoDangXem } = useDuLieuCanBo();
  if (soVanBan) return <span className="truncate font-semibold">Sổ văn bản</span>;
  if (wiki) return <span className="truncate font-semibold">Wiki văn bản</span>;
  if (thongBao) return <span className="truncate font-semibold">Thông báo</span>;
  if (!hoSo) return <span className="truncate font-semibold">Hộp việc</span>;
  const ma =
    (hoSoDangXem && hoSoDangXem.id === hoSo.params.id ? hoSoDangXem.ma : null) ??
    viec.find((v) => v.task.hoSoId === hoSo.params.id)?.task.maHoSo;
  return (
    <nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-2">
      <Link to={GOC_CAN_BO} className="text-link">
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

/** Dashboard "Hiệu suất một cửa" của Superset (mot-cua/bao-cao/superset_dung.py), qua APISIX /bao-cao. */
export const DUONG_BAO_CAO = "/bao-cao/superset/dashboard/hieu-suat-mot-cua/";

export function BoCucCanBo() {
  return (
    <SidebarProvider>
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-3 focus:text-background"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <ThanhBen />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-4">
          <SidebarTrigger className="size-11" />
          <Separator orientation="vertical" className="h-6!" />
          <div className="min-w-0 flex-1">
            <TieuDeTrang />
          </div>
          <ChuongThongBao />
          <MenuNguoiDung />
        </header>
        <div id="noi-dung" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-6 p-4 outline-none md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
