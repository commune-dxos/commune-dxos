// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Một thủ tục trong danh mục: mã, tên, lĩnh vực, thời hạn, lệ phí, nút nộp hồ sơ.
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { nutVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { ThuTuc } from "@/lib/api";
import { lePhi, thoiHan } from "@/lib/dinh-dang";

export function TheThuTuc({ thuTuc }: { thuTuc: ThuTuc }) {
  const idTieuDe = `thu-tuc-${thuTuc.ma}`;
  return (
    <Card role="article" aria-labelledby={idTieuDe} className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{thuTuc.ma}</Badge>
          {thuTuc.linh_vuc && <Badge variant="secondary">{thuTuc.linh_vuc.ten}</Badge>}
        </div>
        <h3 id={idTieuDe} className="text-xl font-bold leading-snug">
          {thuTuc.ten}
        </h3>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
          <dt className="text-muted-foreground">Thời hạn</dt>
          <dd className="font-semibold">{thoiHan(thuTuc.so_ngay_xu_ly)}</dd>
          <dt className="text-muted-foreground">Lệ phí</dt>
          <dd>
            <span className="font-semibold">{lePhi(thuTuc.le_phi)}</span>
            {thuTuc.ghi_chu_le_phi && <span className="block text-muted-foreground">{thuTuc.ghi_chu_le_phi}</span>}
          </dd>
        </dl>
      </CardContent>
      <CardFooter>
        {thuTuc.quy_trinh ? (
          <Link
            to={`/nop-ho-so/${encodeURIComponent(thuTuc.ma)}`}
            className={nutVariants({ size: "lg", className: "w-full sm:w-auto" })}
            aria-label={`Nộp hồ sơ: ${thuTuc.ten}`}
          >
            Nộp hồ sơ
          </Link>
        ) : (
          <p className="text-base text-muted-foreground">Thủ tục này chưa nhận hồ sơ trực tuyến, vui lòng nộp tại bộ phận một cửa.</p>
        )}
      </CardFooter>
    </Card>
  );
}
