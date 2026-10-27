// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Thanh tiến độ dọc của một hồ sơ (#54): các bước nộp → tiếp nhận → thẩm định → phê duyệt → trả kết
// quả, bước nào xong, bước nào đang làm, bước cần người dân bổ sung. Trạng thái phân biệt bằng biểu
// tượng và chữ (đọc được bằng trình đọc màn hình), không chỉ bằng màu.
import { Ban, Check, CircleAlert, CircleDashed, LoaderCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ngayGio } from "@/lib/han";
import type { BuocHienThi, TrangBuoc } from "@/lib/tien-do";
import { tenTrangThai } from "@/lib/trang-thai";
import { cn } from "@/lib/utils";

const KIEU: Record<TrangBuoc, { bieuTuong: LucideIcon; chu: string; lop: string }> = {
  xong: { bieuTuong: Check, chu: "Đã xong", lop: "border-primary bg-primary text-primary-foreground" },
  dang: { bieuTuong: LoaderCircle, chu: "Đang làm", lop: "border-link bg-background text-link" },
  can_bo_sung: { bieuTuong: CircleAlert, chu: "Cần bổ sung", lop: "border-warning bg-destructive-soft text-destructive" },
  tu_choi: { bieuTuong: Ban, chu: "Dừng ở bước này", lop: "border-destructive bg-destructive text-destructive-foreground" },
  cho: { bieuTuong: CircleDashed, chu: "Chưa tới", lop: "border-border bg-background text-muted-foreground" },
  bo_qua: { bieuTuong: CircleDashed, chu: "Không thực hiện", lop: "border-border bg-muted text-muted-foreground" },
};

export function CacBuocHoSo({ buoc, tieuDe = "Các bước giải quyết" }: { buoc: BuocHienThi[]; tieuDe?: string }) {
  return (
    <ol aria-label={tieuDe} className="flex flex-col">
      {buoc.map((b, i) => {
        const { bieuTuong: BieuTuong, chu, lop } = KIEU[b.trang];
        const cuoi = i === buoc.length - 1;
        return (
          <li key={b.ma} data-trang={b.trang} aria-current={b.trang === "dang" || b.trang === "can_bo_sung" ? "step" : undefined}
            className="relative flex gap-4 pb-6 last:pb-0">
            {!cuoi && (
              <span
                aria-hidden="true"
                className={cn("absolute top-10 bottom-0 left-[19px] w-0.5", b.trang === "xong" ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              aria-hidden="true"
              className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full border-2", lop)}
            >
              <BieuTuong className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 pt-1.5">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <strong className="text-lg">{b.ten}</strong>
                <Badge variant={b.trang === "xong" || b.trang === "cho" || b.trang === "bo_qua" ? "outline" : "secondary"}>
                  {chu}
                </Badge>
              </span>
              {b.luc && <span className="text-muted-foreground">{ngayGio(new Date(b.luc))}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Nhãn trạng thái ngắn cho danh sách hồ sơ. */
export function NhanTrangThai({ trangThai }: { trangThai: string }) {
  const can = trangThai === "cho_bo_sung" || trangThai === "tu_choi";
  return (
    <Badge variant={trangThai === "hoan_tat" ? "default" : can ? "destructive" : "secondary"} data-trang-thai={trangThai}>
      {tenTrangThai(trangThai)}
    </Badge>
  );
}
