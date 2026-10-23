// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang "Đã nộp" (mẫu confirmation page của GOV.UK): khung xanh có mã hồ sơ do CSDL cấp, rồi việc
// tiếp theo. Chỉ hiện sau khi hồ sơ đã tạo, tệp đã tải và quy trình đã khởi tạo. Biên nhận PDF có ký
// số của xã (#77) tải ngay tại đây.
import { Check } from "lucide-react";
import { Link } from "react-router";
import { NutGiayTo } from "@/components/nut-giay-to";
import { buttonVariants } from "@/components/ui/button";
import type { ThuTuc } from "@/lib/api";
import { ngay } from "@/lib/dinh-dang";
import type { GiayToKy } from "@/lib/giay-to";
import type { HoSoMoi } from "@/lib/ho-so";
import type { NguoiNop } from "./kieu";

export function DaNop({
  thuTuc,
  hoSo,
  nguoiNop,
  layBienNhan,
}: {
  thuTuc: ThuTuc;
  hoSo: HoSoMoi;
  nguoiNop: NguoiNop;
  layBienNhan: () => Promise<GiayToKy>;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="nen-dam flex flex-col items-center gap-4 rounded-lg bg-primary px-6 py-10 text-center text-primary-foreground">
        <span className="flex size-16 items-center justify-center rounded-full bg-white" aria-hidden="true">
          <Check className="size-10 text-warning" strokeWidth={3} />
        </span>
        <h1 className="text-3xl font-bold sm:text-4xl">Đã nộp hồ sơ</h1>
        <p className="text-lg">{thuTuc.ten}</p>
        <div className="flex flex-col gap-1">
          <span className="text-lg">Mã hồ sơ của bạn</span>
          <strong className="text-2xl font-bold tracking-wide whitespace-nowrap tabular-nums sm:text-3xl">
            {hoSo.ma_ho_so}
          </strong>
        </div>
      </div>
      <section aria-labelledby="bien-nhan" className="flex flex-col gap-3">
        <h2 id="bien-nhan" className="text-2xl font-bold">
          Biên nhận
        </h2>
        <p className="text-lg">
          Giấy tiếp nhận hồ sơ và hẹn trả kết quả, có chữ ký số của xã. Lưu lại để đối chiếu khi cần; ghi mã hồ sơ
          để hỏi bộ phận một cửa.
        </p>
        <NutGiayTo loai="bien_nhan" layGiayTo={layBienNhan} />
      </section>
      <section aria-labelledby="tiep-theo" className="flex flex-col gap-3">
        <h2 id="tiep-theo" className="text-2xl font-bold">
          Việc tiếp theo
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-6 marker:font-semibold">
          <li>Bộ phận một cửa kiểm tra hồ sơ trong giờ hành chính.</li>
          <li>
            Nếu thiếu giấy tờ, cán bộ gọi số <strong>{nguoiNop.soDienThoai}</strong> để hướng dẫn bổ sung.
          </li>
          <li>
            Hạn giải quyết: <strong>{ngay(hoSo.han_xu_ly)}</strong> ({thoiHanChu(thuTuc)}).
          </li>
        </ol>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}

function thoiHanChu(t: ThuTuc) {
  return t.so_ngay_xu_ly === 0 ? "trong ngày" : `${t.so_ngay_xu_ly} ngày làm việc`;
}
