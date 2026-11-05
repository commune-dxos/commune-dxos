// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Một thủ tục trong lưới danh mục (#141): lĩnh vực, mã, tên đậm (liên kết tới trang chi tiết), thời hạn, lệ phí,
// giấy tờ bắt buộc (từ JSON Schema của gói), nút "Nộp hồ sơ" ở chân thẻ; thủ tục chưa nhận hồ sơ trực tuyến ghi
// rõ nơi nộp. Cả thẻ bấm được qua tên thủ tục (liên kết duy nhất, không lồng nút vào liên kết).
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
        "group relative flex w-full flex-col gap-4 rounded-xl border bg-card p-5 shadow-the transition-colors",
        "hover:border-primary focus-within:border-primary",
        !trucTuyen && "bg-surface shadow-none",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {thuTuc.linh_vuc && <Badge variant="secondary">{thuTuc.linh_vuc.ten}</Badge>}
        <span className="font-semibold text-muted-foreground tabular-nums">{thuTuc.ma}</span>
      </div>
      <h3 id={idTieuDe} className="text-xl font-bold">
        <Link
          to={`/thu-tuc/${encodeURIComponent(thuTuc.ma)}`}
          className="rounded-sm text-foreground no-underline group-hover:text-primary hover:underline"
        >
          {thuTuc.ten}
        </Link>
      </h3>
      <dl className="flex flex-wrap gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <dt>
            <Clock aria-hidden="true" className="size-5 text-primary" />
            <span className="sr-only">Thời hạn</span>
          </dt>
          <dd className="font-semibold">{thoiHan(thuTuc.so_ngay_xu_ly)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt>
            <Banknote aria-hidden="true" className="size-5 text-primary" />
            <span className="sr-only">Lệ phí</span>
          </dt>
          <dd className="font-semibold">{lePhi(thuTuc.le_phi)}</dd>
        </div>
      </dl>
      {giayTo.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-semibold">
            <FileText aria-hidden="true" className="size-5 text-primary" />
            Giấy tờ cần có ({giayTo.length})
          </p>
          <ul className="ml-7 list-disc pl-1 marker:text-primary">
            {giayTo.map((t) => (
              <li key={t.ma}>{t.ten}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-1">
        {trucTuyen ? (
          <Link
            to={`/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`}
            className={buttonVariants({ className: "w-full" })}
            aria-label={`Nộp hồ sơ: ${thuTuc.ten}`}
          >
            Nộp hồ sơ
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <p className="flex items-start gap-2 rounded-md border border-dashed bg-background px-3 py-2">
            <Building2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            <span>Chưa nhận hồ sơ trực tuyến, nộp tại bộ phận một cửa.</span>
          </p>
        )}
      </div>
    </article>
  );
}
