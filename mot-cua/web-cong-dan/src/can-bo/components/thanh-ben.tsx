// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Thanh bên cổng cán bộ (#55, dựng lại #142): một component dùng cho cả cột cố định bên trái (≥ 1024 px) lẫn ngăn
// kéo trên điện thoại (BoCucCanBo đặt nó trong Sheet, truyền onChon để đóng khi chọn mục). Nền slate-900, mục đang mở
// nền xanh ngọc có bóng. Mục theo vai trò: văn thư không có nhóm "Xử lý hồ sơ"; lãnh đạo có thêm báo cáo hiệu suất.
import {
  AlarmClockOff,
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ExternalLink,
  Hourglass,
  Inbox,
  LibraryBig,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { GOC_CAN_BO } from "@/auth/oidc";
import { cn } from "@/lib/utils";
import { useDuLieuCanBo } from "../du-lieu";
import { demTheoHan } from "../lib/hop-viec";
import { TEN_VAI_TRO } from "../lib/quyen";

/** Dashboard "Hiệu suất một cửa" của Superset (mot-cua/bao-cao/superset_dung.py), qua APISIX /bao-cao. */
export const DUONG_BAO_CAO = "/bao-cao/superset/dashboard/hieu-suat-mot-cua/";

const LOP_MUC =
  "flex min-h-10 items-center gap-3 rounded-xl px-3.5 py-2 text-base font-semibold no-underline transition-all duration-150";
const LOP_MUC_MO = "bg-teal-50/95 text-primary font-bold ring-1 ring-teal-600/20 shadow-2xs";
const LOP_MUC_THUONG = "text-slate-700 hover:bg-slate-100/90 hover:text-slate-950";

function MucMenu({
  den,
  nhan,
  bieuTuong: BieuTuong,
  dem,
  dangMo = false,
  donVi = "hồ sơ",
  ngoai = false,
  onChon,
}: {
  den: string;
  nhan: string;
  bieuTuong: LucideIcon;
  dem?: number;
  dangMo?: boolean;
  /** Đơn vị của số đếm cho trình đọc màn hình. */
  donVi?: string;
  /** Liên kết ra ngoài ứng dụng React (Superset, cổng công dân): thẻ a thường. */
  ngoai?: boolean;
  onChon?: () => void;
}) {
  const noiDung = (
    <>
      <BieuTuong aria-hidden="true" className={cn("size-4.5 shrink-0", dangMo ? "text-primary" : "text-slate-500")} />
      <span className="flex-1">{nhan}</span>
      {dem !== undefined && dem > 0 && (
        <span
          className={cn(
            "rounded-md px-2 py-0.5 font-mono text-xs font-bold tabular-nums",
            dangMo ? "bg-primary text-white" : "border border-slate-200 bg-slate-100 text-slate-700",
          )}
        >
          {dem}
          <span className="sr-only"> {donVi}</span>
        </span>
      )}
    </>
  );
  const lop = cn(LOP_MUC, dangMo ? LOP_MUC_MO : LOP_MUC_THUONG);
  return (
    <li>
      {ngoai ? (
        <a href={den} className={lop}>
          {noiDung}
        </a>
      ) : (
        <Link to={den} aria-current={dangMo ? "page" : undefined} onClick={onChon} className={lop}>
          {noiDung}
        </Link>
      )}
    </li>
  );
}

function Nhom({ nhan, children }: { nhan: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-3.5 pt-3 pb-1 text-xs font-bold tracking-[0.15em] text-slate-400 uppercase">{nhan}</h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

export function ThanhBenCanBo({ className, onChon }: { className?: string; onChon?: () => void }) {
  const { viec, vaiTro, canBo, chuaDoc } = useDuLieuCanBo();
  const { pathname, search } = useLocation();
  const dem = demTheoHan(viec);
  const duong = pathname.replace(/\/$/, "");
  const oHopViec = duong === GOC_CAN_BO;
  const q = new URLSearchParams(search);
  const loc = q.get("han") ?? q.get("trang_thai") ?? "";
  const linhVuc = canBo?.linh_vuc.map((l) => l.ten).join(", ");
  return (
    <aside className={cn("flex h-full w-64 flex-col overflow-y-auto border-r border-slate-200/90 bg-white text-slate-700", className)}>
      <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200/80 px-4">
        <Link to={GOC_CAN_BO} onClick={onChon} className="group flex min-w-0 items-center gap-3 rounded-xl text-slate-950 no-underline">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-teal-600/20 bg-teal-50/60 p-1 shadow-2xs transition-transform group-hover:scale-105">
            <img src="/mark-64.png" alt="" width={34} height={34} className="size-8" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-base font-black tracking-tight text-slate-950 whitespace-nowrap">Cổng cán bộ</span>
            <span className="truncate text-xs font-bold tracking-wider text-primary uppercase">Commune DX-OS</span>
          </span>
        </Link>
        {onChon && (
          <button
            type="button"
            onClick={onChon}
            aria-label="Đóng menu"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <nav aria-label="Cổng cán bộ" className="flex flex-1 flex-col gap-1 p-3">
        {vaiTro !== "van_thu" && (
          <Nhom nhan="Xử lý hồ sơ">
            <MucMenu den={GOC_CAN_BO} nhan="Hộp việc" bieuTuong={Inbox} dem={viec.length} dangMo={oHopViec && loc === ""} onChon={onChon} />
            <MucMenu den={`${GOC_CAN_BO}?han=qua_han`} nhan="Quá hạn" bieuTuong={AlarmClockOff} dem={dem.qua_han} dangMo={oHopViec && loc === "qua_han"} onChon={onChon} />
            <MucMenu den={`${GOC_CAN_BO}?han=sap_tre`} nhan="Sắp trễ hạn" bieuTuong={Hourglass} dem={dem.sap_tre} dangMo={oHopViec && loc === "sap_tre"} onChon={onChon} />
            <MucMenu
              den={`${GOC_CAN_BO}?trang_thai=cua_toi`}
              nhan="Tôi đang xử lý"
              bieuTuong={UserCheck}
              dem={viec.filter((v) => v.cuaToi).length}
              dangMo={oHopViec && loc === "cua_toi"}
              onChon={onChon}
            />
            <MucMenu
              den={`${GOC_CAN_BO}/thong-bao`}
              nhan="Thông báo"
              bieuTuong={Bell}
              dem={chuaDoc}
              donVi="thông báo chưa đọc"
              dangMo={duong === `${GOC_CAN_BO}/thong-bao`}
              onChon={onChon}
            />
          </Nhom>
        )}
        <Nhom nhan="Công tác">
          <MucMenu den={`${GOC_CAN_BO}/lich`} nhan="Lịch công tác" bieuTuong={CalendarDays} dangMo={duong === `${GOC_CAN_BO}/lich`} onChon={onChon} />
        </Nhom>
        <Nhom nhan="Văn bản">
          <MucMenu den={`${GOC_CAN_BO}/van-ban`} nhan="Sổ văn bản" bieuTuong={BookOpen} dangMo={duong === `${GOC_CAN_BO}/van-ban`} onChon={onChon} />
          <MucMenu den={`${GOC_CAN_BO}/wiki`} nhan="Wiki văn bản" bieuTuong={LibraryBig} dangMo={pathname.startsWith(`${GOC_CAN_BO}/wiki`)} onChon={onChon} />
        </Nhom>
        <Nhom nhan="Khác">
          {vaiTro === "lanh_dao" && <MucMenu den={DUONG_BAO_CAO} nhan="Báo cáo hiệu suất" bieuTuong={ChartColumn} ngoai />}
          <MucMenu den="/" nhan="Cổng công dân" bieuTuong={ExternalLink} ngoai />
        </Nhom>
      </nav>
      <div className="mx-3 mb-3 flex flex-col gap-1 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-900">{TEN_VAI_TRO[vaiTro]}</p>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          {vaiTro === "lanh_dao"
            ? "Phê duyệt, ký số các bước của lãnh đạo"
            : vaiTro === "van_thu"
              ? "Vào sổ văn bản đến, soạn văn bản đi"
              : linhVuc
                ? `Lĩnh vực: ${linhVuc}`
                : "Chưa được giao lĩnh vực"}
        </p>
      </div>
    </aside>
  );
}
