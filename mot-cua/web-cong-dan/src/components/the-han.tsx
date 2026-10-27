// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Thẻ hạn xử lý: còn bao lâu và mức (quá hạn / sắp trễ / còn hạn). Mức phân biệt bằng biểu tượng và
// chữ, không chỉ bằng màu; đỏ son chỉ dùng cho quá hạn và sắp trễ (nhận diện Team 2).
import { AlarmClockOff, CalendarClock, Clock3, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { ngayGio, TEN_MUC_HAN, type DanhGiaHan, type MucHan } from "@/lib/han";

const KIEU: Record<MucHan, { bieuTuong: typeof Clock3; lop: string }> = {
  qua_han: { bieuTuong: AlarmClockOff, lop: "border-destructive bg-destructive text-destructive-foreground" },
  sap_tre: { bieuTuong: Hourglass, lop: "border-warning bg-destructive-soft text-destructive" },
  con_han: { bieuTuong: Clock3, lop: "border-transparent bg-primary-soft text-primary-soft-foreground" },
  khong_ro: { bieuTuong: CalendarClock, lop: "border-transparent bg-muted text-muted-foreground" },
};

export function TheHan({ han, chiTiet = true, className }: { han: DanhGiaHan; chiTiet?: boolean; className?: string }) {
  const { bieuTuong: BieuTuong, lop } = KIEU[han.muc];
  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)} data-muc-han={han.muc}>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 font-semibold whitespace-nowrap",
          lop,
        )}
        title={TEN_MUC_HAN[han.muc]}
      >
        <BieuTuong aria-hidden="true" className="size-4 shrink-0" />
        <span className="sr-only">{TEN_MUC_HAN[han.muc]}: </span>
        {han.nhan}
      </span>
      {chiTiet && han.han && <span className="text-muted-foreground whitespace-nowrap">Hạn {ngayGio(han.han)}</span>}
    </span>
  );
}
