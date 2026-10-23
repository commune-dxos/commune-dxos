// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Một thủ tục trong danh mục (dòng danh sách dựng trên Item của shadcn/ui): tên, lĩnh vực, mã,
// thời hạn, lệ phí, giấy tờ cần mang (từ JSON Schema của gói), nút nộp hồ sơ.
import { ArrowRight, Banknote, Clock, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
import type { ThuTuc } from "@/lib/api";
import { lePhi, thoiHan } from "@/lib/dinh-dang";
import { docThanhPhan } from "@/lib/thanh-phan";

function Dong({ bieuTuong, nhan, children }: { bieuTuong: ReactNode; nhan: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-1 text-primary [&_svg]:size-5" aria-hidden="true">
        {bieuTuong}
      </span>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{nhan}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}

export function TheThuTuc({ thuTuc }: { thuTuc: ThuTuc }) {
  const idTieuDe = `thu-tuc-${thuTuc.ma}`;
  const giayTo = docThanhPhan(thuTuc.json_schema).filter((t) => t.batBuoc);
  return (
    <Item
      variant="outline"
      role="article"
      aria-labelledby={idTieuDe}
      className="items-start gap-5 bg-card p-5 shadow-the sm:p-6 md:flex-nowrap"
    >
      <ItemContent className="gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {thuTuc.linh_vuc && <Badge variant="secondary">{thuTuc.linh_vuc.ten}</Badge>}
          <span className="text-sm text-muted-foreground">
            Mã thủ tục <span className="font-semibold text-foreground">{thuTuc.ma}</span>
          </span>
        </div>
        <h3 id={idTieuDe} className="text-xl font-bold">
          <Link to={`/thu-tuc/${encodeURIComponent(thuTuc.ma)}`} className="-my-1.5 inline-block rounded-sm py-1.5 text-link underline decoration-1 hover:decoration-2">
            {thuTuc.ten}
          </Link>
        </h3>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_1fr]">
          <Dong bieuTuong={<Clock />} nhan="Thời hạn">
            {thoiHan(thuTuc.so_ngay_xu_ly)}
          </Dong>
          <Dong bieuTuong={<Banknote />} nhan="Lệ phí">
            {lePhi(thuTuc.le_phi)}
          </Dong>
          {giayTo.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-1">
              <Dong bieuTuong={<FileText />} nhan={`Giấy tờ cần có (${giayTo.length})`}>
                <ul className="flex flex-col gap-0.5 font-normal">
                  {giayTo.map((t) => (
                    <li key={t.ma}>{t.ten}</li>
                  ))}
                </ul>
              </Dong>
            </div>
          )}
        </dl>
      </ItemContent>
      <ItemActions className="w-full md:w-auto md:self-center">
        {thuTuc.quy_trinh ? (
          <Link
            to={`/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`}
            className={buttonVariants({ className: "w-full md:w-auto" })}
            aria-label={`Nộp hồ sơ: ${thuTuc.ten}`}
          >
            Nộp hồ sơ
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <p className="text-base text-muted-foreground md:max-w-56">
            Thủ tục này chưa nhận hồ sơ trực tuyến, vui lòng nộp tại bộ phận một cửa.
          </p>
        )}
      </ItemActions>
    </Item>
  );
}
