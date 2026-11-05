// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đầu mục và dải đầu trang dùng chung của cổng công dân (#141).
//  - TieuDeMuc: nhãn nhỏ in hoa có gạch màu nhấn phía trước, dưới là tiêu đề rất đậm.
//  - DauTrang: dải tối tràn viền (slate-950, hoa văn chấm mờ) cho tiêu đề h1 của các trang trong.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NhanMuc({ children, toi = false }: { children: ReactNode; toi?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className={cn("block h-[3px] w-10 rounded-full", toi ? "bg-teal-300" : "bg-primary")} />
      <span
        className={cn(
          "text-sm font-bold tracking-[0.2em] uppercase",
          toi ? "text-teal-200" : "text-primary-soft-foreground",
        )}
      >
        {children}
      </span>
    </span>
  );
}

export function TieuDeMuc({
  id,
  nhan,
  children,
  phu,
  hanhDong,
  cap = "h2",
  className,
}: {
  id?: string;
  nhan: string;
  children: ReactNode;
  phu?: ReactNode;
  hanhDong?: ReactNode;
  cap?: "h1" | "h2";
  className?: string;
}) {
  const TieuDe = cap;
  return (
    <div className={cn("flex flex-col justify-between gap-4 md:flex-row md:items-end", className)}>
      <div className="flex flex-col gap-3">
        <NhanMuc>{nhan}</NhanMuc>
        <TieuDe id={id} className="text-3xl font-black tracking-tighter text-foreground sm:text-4xl md:text-5xl">
          {children}
        </TieuDe>
        {phu && <p className="max-w-2xl text-lg text-muted-foreground">{phu}</p>}
      </div>
      {hanhDong}
    </div>
  );
}

/** Hoa văn chấm mờ trên nền tối (trang trí). */
export function HoaVanCham() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-50"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-[36rem] rounded-full bg-primary/40 blur-[120px]"
      />
    </>
  );
}

export function DauTrang({
  nhan,
  tieuDe,
  moTa,
  truoc,
  sau,
  hep = false,
}: {
  nhan: string;
  tieuDe: ReactNode;
  moTa?: ReactNode;
  /** Phía trên nhãn (vd đường dẫn). */
  truoc?: ReactNode;
  /** Dưới mô tả (vd huy hiệu, nút). */
  sau?: ReactNode;
  hep?: boolean;
}) {
  return (
    <section className="nen-toi relative isolate overflow-hidden bg-slate-950 text-white">
      <HoaVanCham />
      <div className={cn("relative mx-auto flex w-full flex-col gap-4 px-4 py-10 sm:px-6 md:py-14", hep ? "max-w-5xl" : "max-w-6xl")}>
        {truoc}
        <NhanMuc toi>{nhan}</NhanMuc>
        <h1 className="max-w-4xl text-4xl font-black tracking-tighter text-white sm:text-5xl md:text-6xl">{tieuDe}</h1>
        {moTa && <p className="max-w-2xl text-lg text-slate-300">{moTa}</p>}
        {sau}
      </div>
    </section>
  );
}
