// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Một thủ tục trong lưới danh mục (#141): lĩnh vực, mã hồ sơ kỹ thuật, tên đậm (liên kết tới trang chi tiết),
// bảng thông số thời hạn / lệ phí, danh sách giấy tờ bắt buộc và nút "Nộp hồ sơ" ở chân thẻ.
import { ArrowRight, Banknote, Building2, Clock, FileText } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { ThuTuc } from "@/lib/api";
import { lePhi, thoiHan } from "@/lib/dinh-dang";
import { docThanhPhan } from "@/lib/thanh-phan";
import { cn } from "@/lib/utils";

export function TheThuTuc({ thuTuc }: { thuTuc: ThuTuc }) {
  const idTieuDe = `thu-tuc-${thuTuc.ma}`;
  const giayTo = docThanhPhan(thuTuc.json_schema).filter((t) => t.batBuoc);
  const trucTuyen = !!thuTuc.quy_trinh;
  return (
    <article
      aria-labelledby={idTieuDe}
      className={cn(
        "group relative flex w-full flex-col gap-4 rounded-2xl border border-slate-200/90 bg-card p-5 shadow-the transition-all duration-200",
        "hover:border-primary/50 hover:shadow-md focus-within:border-primary",
        !trucTuyen && "bg-slate-50/70 shadow-none",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        {thuTuc.linh_vuc && <Badge variant="secondary">{thuTuc.linh_vuc.ten}</Badge>}
        <span className="rounded-md border border-slate-200 bg-slate-100/90 px-2.5 py-0.5 font-mono text-sm font-bold tracking-wider text-slate-800 tabular-nums">
          {thuTuc.ma}
        </span>
      </div>
      <h3 id={idTieuDe} className="text-xl leading-snug font-black tracking-tight text-slate-950">
        <Link
          to={`/thu-tuc/${encodeURIComponent(thuTuc.ma)}`}
          className="rounded-sm text-foreground no-underline group-hover:text-primary hover:underline"
        >
          {thuTuc.ten}
        </Link>
      </h3>
      <dl className="grid grid-cols-2 divide-x divide-slate-200/80 rounded-xl border border-slate-200/70 bg-slate-50/70">
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Clock aria-hidden="true" className="size-3.5 text-primary" />
            <span>Thời hạn</span>
          </dt>
          <dd className="text-sm font-bold text-slate-900">{thoiHan(thuTuc.so_ngay_xu_ly)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2">
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Banknote aria-hidden="true" className="size-3.5 text-primary" />
            <span>Lệ phí</span>
          </dt>
          <dd className="text-sm font-bold text-slate-900">{lePhi(thuTuc.le_phi)}</dd>
        </div>
      </dl>
      {giayTo.length > 0 && (
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="flex items-center gap-1.5 font-bold text-slate-800">
            <FileText aria-hidden="true" className="size-4 text-primary" />
            Giấy tờ cần có ({giayTo.length})
          </p>
          <ul className="ml-5 list-disc space-y-0.5 pl-1 text-slate-600 marker:text-primary">
            {giayTo.map((t) => (
              <li key={t.ma}>{t.ten}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-2">
        {trucTuyen ? (
          <Link
            to={`/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`}
            className={buttonVariants({ className: "w-full justify-between" })}
            aria-label={`Nộp hồ sơ: ${thuTuc.ten}`}
          >
            <span>Nộp hồ sơ</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <p className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-600">
            <Building2 aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-primary" />
            <span>Chưa nhận hồ sơ trực tuyến, nộp tại bộ phận một cửa.</span>
          </p>
        )}
      </div>
    </article>
  );
}
