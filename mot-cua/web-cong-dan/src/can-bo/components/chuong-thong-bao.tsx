// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Chuông ở đầu trang: hồ sơ quá hạn và sắp trễ hạn (còn ≤ 1 ngày) trong hộp việc, tính từ dữ liệu đã
// có (tải lại mỗi phút). Đẩy cảnh báo realtime qua RabbitMQ là #56.
import { Bell } from "lucide-react";
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
import { useDuLieuCanBo } from "../du-lieu";
import { TheHan } from "./the-han";

const TOI_DA = 6;

export function ChuongThongBao() {
  const { viec } = useDuLieuCanBo();
  const canChuY = viec.filter((v) => v.han.muc === "qua_han" || v.han.muc === "sap_tre");
  const n = canChuY.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={n ? `Thông báo: ${n} hồ sơ cần chú ý về hạn` : "Thông báo: không có hồ sơ sắp trễ hạn"}>
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
        <DropdownMenuLabel className="text-base">Hạn xử lý cần chú ý</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {n === 0 ? (
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
        {n > TOI_DA && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`${GOC_CAN_BO}?han=can_chu_y`} className="text-link">
                Xem cả {n} hồ sơ
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
