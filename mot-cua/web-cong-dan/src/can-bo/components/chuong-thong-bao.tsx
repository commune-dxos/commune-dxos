// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chuông ở đầu trang: thông báo sắp trễ hạn chưa đọc (#56, consumer RabbitMQ ghi, tới ngay qua luồng SSE
// của du-lieu.tsx) và hồ sơ quá hạn, sắp trễ hạn trong hộp việc (tính từ dữ liệu đã có). Bấm một thông
// báo thì mở hồ sơ và đánh dấu đã đọc.
import { Bell, CheckCheck } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GOC_CAN_BO } from "@/auth/oidc";
import { TheHan } from "@/components/the-han";
import { ngayGio } from "@/lib/han";
import { useDuLieuCanBo } from "../du-lieu";

const TOI_DA = 6;

export function nhanChuong(chuaDoc: number, canChuY: number) {
  const phan = [chuaDoc && `${chuaDoc} thông báo mới`, canChuY && `${canChuY} hồ sơ cần chú ý về hạn`].filter(Boolean);
  return phan.length ? `Thông báo: ${phan.join(", ")}` : "Thông báo: không có hồ sơ sắp trễ hạn";
}

export function ChuongThongBao() {
  const { viec, thongBao, chuaDoc, danhDauDaDoc } = useDuLieuCanBo();
  const canChuY = viec.filter((v) => v.han.muc === "qua_han" || v.han.muc === "sap_tre");
  const moi = thongBao.filter((t) => !t.da_doc_luc);
  const n = chuaDoc + canChuY.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={nhanChuong(chuaDoc, canChuY.length)}>
          <Bell aria-hidden="true" />
          {n > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-sm leading-5 font-bold text-destructive-foreground"
            >
              {n}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        {moi.length > 0 && (
          <>
            <DropdownMenuLabel className="flex items-center justify-between gap-2 text-base">
              Thông báo mới
              <Button variant="ghost" size="sm" onClick={() => void danhDauDaDoc(moi.map((t) => t.id))}>
                <CheckCheck aria-hidden="true" />
                Đã đọc hết
              </Button>
            </DropdownMenuLabel>
            {moi.slice(0, TOI_DA).map((t) => (
              <DropdownMenuItem key={t.id} asChild className="cursor-pointer">
                <Link
                  to={`${GOC_CAN_BO}/ho-so/${t.ho_so_id}`}
                  onClick={() => void danhDauDaDoc([t.id])}
                  className="flex flex-col items-start gap-1 py-2 no-underline"
                >
                  <span className="font-semibold text-foreground">{t.tieu_de}</span>
                  <span className="text-muted-foreground">{t.noi_dung}</span>
                  <span className="text-sm text-muted-foreground">{ngayGio(new Date(t.tao_luc))}</span>
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem asChild>
              <Link to={`${GOC_CAN_BO}/thong-bao`} className="text-link">
                Xem tất cả thông báo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-base">Hạn xử lý cần chú ý</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canChuY.length === 0 ? (
          <p className="px-2 py-3 text-base text-muted-foreground">Không có hồ sơ quá hạn hay sắp trễ hạn.</p>
        ) : (
          canChuY.slice(0, TOI_DA).map((v) => (
            <DropdownMenuItem key={v.task.id} asChild className="cursor-pointer">
              <Link to={`${GOC_CAN_BO}/ho-so/${v.task.hoSoId}`} className="flex flex-col items-start gap-1 py-2 no-underline">
                <span className="font-semibold text-foreground">
                  {v.task.maHoSo} · {v.hoSo?.thu_tuc?.ten ?? v.task.ten}
                </span>
                <span className="text-muted-foreground">{v.task.ten}</span>
                <TheHan han={v.han} chiTiet={false} />
              </Link>
            </DropdownMenuItem>
          ))
        )}
        {canChuY.length > TOI_DA && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`${GOC_CAN_BO}?han=can_chu_y`} className="text-link">
                Xem cả {canChuY.length} hồ sơ
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
