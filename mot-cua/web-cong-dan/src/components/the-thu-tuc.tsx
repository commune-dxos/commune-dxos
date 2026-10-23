// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Một thủ tục trong danh mục (dòng danh sách dựng trên Item của shadcn/ui): tên, lĩnh vực, mã,
// thời hạn, lệ phí, nút nộp hồ sơ. Giấy tờ cần có (từ JSON Schema) và liên kết tới trang chi tiết
// thêm ở #64.
import { ArrowRight, Banknote, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
import type { ThuTuc } from "@/lib/api";
import { lePhi, thoiHan } from "@/lib/dinh-dang";

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
          {thuTuc.ten}
        </h3>
        <dl className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)]">
          <Dong bieuTuong={<Clock />} nhan="Thời hạn">
            {thoiHan(thuTuc.so_ngay_xu_ly)}
          </Dong>
          <Dong bieuTuong={<Banknote />} nhan="Lệ phí">
            {lePhi(thuTuc.le_phi)}
          </Dong>
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
