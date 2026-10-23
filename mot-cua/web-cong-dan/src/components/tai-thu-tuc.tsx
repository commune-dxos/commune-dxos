// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung chung cho màn cần một thủ tục (chi tiết, nộp hồ sơ): đang tải, lỗi tải, không có mã này.
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Khung } from "@/components/khung";
import { ThongBao } from "@/components/thong-bao";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ThuTuc } from "@/lib/api";
import { useThuTuc } from "@/lib/dung-thu-tuc";

export function TaiThuTuc({
  ma,
  taiDanhMuc,
  children,
}: {
  ma: string;
  taiDanhMuc?: () => Promise<ThuTuc[]>;
  children: (thuTuc: ThuTuc) => ReactNode;
}) {
  const { trangThai, taiLai } = useThuTuc(ma, taiDanhMuc);
  if (trangThai.loai === "xong") return children(trangThai.thuTuc);
  return (
    <Khung>
      {trangThai.loai === "dang-tai" && (
        <div role="status" className="flex max-w-2xl flex-col gap-4">
          <span className="sr-only">Đang tải thông tin thủ tục…</span>
          <Skeleton aria-hidden="true" className="h-6 w-40" />
          <Skeleton aria-hidden="true" className="h-11 w-3/4" />
          <Skeleton aria-hidden="true" className="h-24 w-full" />
        </div>
      )}
      {trangThai.loai === "loi" && (
        <ThongBao
          role="alert"
          loai="loi"
          capTieuDe="h1"
          tieuDe="Chưa tải được thông tin thủ tục"
          hanhDong={
            <Button onClick={taiLai}>
              <RotateCw aria-hidden="true" />
              Thử lại
            </Button>
          }
        >
          {trangThai.thongDiep}
        </ThongBao>
      )}
      {trangThai.loai === "khong-co" && (
        <ThongBao
          loai="trong"
          capTieuDe="h1"
          tieuDe={`Không có thủ tục mã ${ma}`}
          hanhDong={
            <Link to="/" className={buttonVariants()}>
              Về danh mục thủ tục
            </Link>
          }
        >
          Thủ tục này không có trong danh mục công khai của xã, hoặc đường dẫn đã cũ.
        </ThongBao>
      )}
    </Khung>
  );
}
