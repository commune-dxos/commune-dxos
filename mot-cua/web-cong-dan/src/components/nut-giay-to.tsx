// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Nút tải giấy tờ có ký số (#77), dùng ở trang "Đã nộp" của cổng công dân và chi tiết hồ sơ của cổng
// cán bộ. Bấm → mot-cua-api phát hành (nếu chưa có) → tải PDF về. Lỗi tạm thời (Gotenberg, CA chưa
// sẵn sàng) hiện câu tiếng Việt và cho bấm lại.
import { BadgeCheck, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type GiayToKy, type LoaiGiayTo, TEN_GIAY_TO, taiVe } from "@/lib/giay-to";

export function NutGiayTo({
  loai,
  layGiayTo,
  tai = taiVe,
}: {
  loai: LoaiGiayTo;
  layGiayTo: () => Promise<GiayToKy>;
  tai?: (g: GiayToKy) => void;
}) {
  const [dangLay, datDangLay] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);
  const [daTai, datDaTai] = useState<GiayToKy | null>(null);
  const bam = async () => {
    datDangLay(true);
    datLoi(null);
    try {
      const g = await layGiayTo();
      tai(g);
      datDaTai(g);
    } catch (e) {
      datLoi(e instanceof Error ? e.message : "Chưa tải được giấy tờ. Vui lòng thử lại.");
    } finally {
      datDangLay(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={() => void bam()} disabled={dangLay} className="self-start">
        <Download aria-hidden="true" />
        {dangLay ? "Đang chuẩn bị PDF…" : `Tải ${TEN_GIAY_TO[loai].toLowerCase()} (PDF có ký số)`}
      </Button>
      {daTai && (
        <p role="status" className="flex items-start gap-2 text-muted-foreground">
          <BadgeCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>
            Đã ký số bởi {daTai.chung_thu_ten}. Phần mềm đọc PDF có hỗ trợ chữ ký số hiện chữ ký trong tệp.
          </span>
        </p>
      )}
      {loi && (
        <p role="alert" className="text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}
