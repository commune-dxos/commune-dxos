// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { Link } from "react-router";
import { Khung } from "@/components/khung";
import { ThongBao } from "@/components/thong-bao";
import { buttonVariants } from "@/components/ui/button";

export function KhongThay() {
  return (
    <Khung className="flex justify-center md:py-16">
      <ThongBao
        loai="trong"
        capTieuDe="h1"
        tieuDe="Không tìm thấy trang"
        className="max-w-xl"
        hanhDong={
          <Link to="/" className={buttonVariants({ size: "lg" })}>
            Về danh mục thủ tục
          </Link>
        }
      >
        Địa chỉ có thể đã gõ sai hoặc trang đã được chuyển. Nếu bạn gõ địa chỉ, hãy kiểm tra lại chính tả.
      </ThongBao>
    </Khung>
  );
}
