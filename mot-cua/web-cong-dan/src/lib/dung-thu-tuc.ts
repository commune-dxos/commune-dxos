// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Lấy một thủ tục theo mã từ danh mục công khai (màn chi tiết và form nộp hồ sơ).
import { useCallback, useEffect, useState } from "react";
import { layDanhMucThuTuc, LoiApi, type ThuTuc } from "./api";

export type TrangThaiThuTuc =
  | { loai: "dang-tai" }
  | { loai: "loi"; thongDiep: string }
  | { loai: "khong-co" }
  | { loai: "xong"; thuTuc: ThuTuc };

export function useThuTuc(ma: string, taiDanhMuc: () => Promise<ThuTuc[]> = layDanhMucThuTuc) {
  const [trangThai, datTrangThai] = useState<TrangThaiThuTuc>({ loai: "dang-tai" });
  const tai = useCallback(() => {
    datTrangThai({ loai: "dang-tai" });
    taiDanhMuc()
      .then((ds) => {
        const t = ds.find((x) => x.ma === ma);
        datTrangThai(t ? { loai: "xong", thuTuc: t } : { loai: "khong-co" });
      })
      .catch((e: unknown) =>
        datTrangThai({
          loai: "loi",
          thongDiep: e instanceof LoiApi ? e.message : "Không tải được thông tin thủ tục. Vui lòng thử lại.",
        }),
      );
  }, [ma, taiDanhMuc]);
  useEffect(tai, [tai]);
  return { trangThai, taiLai: tai };
}
