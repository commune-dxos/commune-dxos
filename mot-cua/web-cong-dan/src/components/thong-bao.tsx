// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khối thông báo dùng chung cho màn lỗi, màn trống, đăng nhập lỗi, "chưa đăng nhập": biểu tượng +
// tiêu đề + lời giải thích + việc làm tiếp. Dựng trên Empty của shadcn/ui. Loại phân biệt bằng
// biểu tượng và tiêu đề, không chỉ bằng màu.
import { CircleAlert, Info, SearchX, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

const LOAI: Record<"loi" | "thong_tin" | "trong", { bieuTuong: LucideIcon; mau: string }> = {
  loi: { bieuTuong: CircleAlert, mau: "bg-destructive-soft text-warning" },
  thong_tin: { bieuTuong: Info, mau: "bg-secondary text-secondary-foreground" },
  trong: { bieuTuong: SearchX, mau: "bg-muted text-muted-foreground" },
};

export function ThongBao({
  loai = "thong_tin",
  tieuDe,
  capTieuDe = "h2",
  children,
  hanhDong,
  bieuTuong,
  role,
  className,
}: {
  loai?: keyof typeof LOAI;
  tieuDe: string;
  /** Màn chỉ có khối này (404, đăng nhập lỗi) thì tiêu đề là h1. */
  capTieuDe?: "h1" | "h2";
  children?: ReactNode;
  hanhDong?: ReactNode;
  bieuTuong?: LucideIcon;
  role?: "alert" | "status";
  className?: string;
}) {
  const { bieuTuong: BieuTuongMacDinh, mau } = LOAI[loai];
  const BieuTuong = bieuTuong ?? BieuTuongMacDinh;
  const TieuDe = capTieuDe;
  return (
    <Empty
      role={role}
      data-loai={loai}
      className={cn("border border-solid bg-card shadow-the md:p-10", loai === "loi" && "border-warning", className)}
    >
      <EmptyHeader>
        <EmptyMedia className={cn("size-14 rounded-full [&_svg]:size-7", mau)}>
          <BieuTuong aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className={capTieuDe === "h1" ? "text-2xl font-bold" : undefined}>
          <TieuDe className="text-balance">{tieuDe}</TieuDe>
        </EmptyTitle>
        {children && <EmptyDescription className="text-base text-muted-foreground">{children}</EmptyDescription>}
      </EmptyHeader>
      {hanhDong && <EmptyContent className="flex-row flex-wrap justify-center">{hanhDong}</EmptyContent>}
    </Empty>
  );
}
