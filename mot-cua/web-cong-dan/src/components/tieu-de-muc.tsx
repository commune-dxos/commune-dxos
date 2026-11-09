// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đầu mục và dải đầu trang dùng chung của cổng công dân (#141).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NhanMuc({ children, toi = false }: { children: ReactNode; toi?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-2.5 py-0.5 text-sm font-semibold",
        toi
          ? "border border-teal-400/20 bg-teal-950/60 text-teal-200"
          : "border border-teal-700/20 bg-teal-50/80 text-teal-900",
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", toi ? "bg-teal-300" : "bg-primary")} />
      {children}
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
    <div className={cn("flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 md:flex-row md:items-end", className)}>
      <div className="flex flex-col gap-1.5 border-l-4 border-primary pl-4">
        <TieuDe id={id} className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          {children}
        </TieuDe>
        <p className="text-base font-medium text-slate-600">
          {phu ?? `Chuyên mục: ${nhan}`}
        </p>
      </div>
      {hanhDong}
    </div>
  );
}

/** Hoa văn lưới hành chính tinh tế. */
export function HoaVanCham() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_40%,transparent_100%)] opacity-45"
    />
  );
}

export function DaiTieuDe({
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
    <section className="relative isolate overflow-hidden border-b border-slate-200/90 bg-gradient-to-b from-teal-50/45 via-slate-50/50 to-white text-foreground">
      <HoaVanCham />
      <div className={cn("relative mx-auto flex w-full flex-col gap-3 px-4 py-8 sm:px-6 md:py-10", hep ? "max-w-5xl" : "max-w-6xl")}>
        {truoc}
        <div className="flex flex-col gap-2 border-l-4 border-primary pl-4">
          <h1 className="max-w-4xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{tieuDe}</h1>
          {moTa && <p className="max-w-2xl text-lg text-slate-600">{moTa}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-sm font-semibold text-teal-800">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-700/20 bg-teal-50/90 px-2.5 py-0.5">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {nhan}
            </span>
          </div>
        </div>
        {sau}
      </div>
    </section>
  );
}
