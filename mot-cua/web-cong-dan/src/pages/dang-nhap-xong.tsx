// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Keycloak chuyển về đây với ?code=…&state=…; đổi code lấy token (PKCE) rồi quay lại trang cũ.
// Lỗi thì hiện khối thông báo chung giữa trang (bố cục block login-03 của shadcn/ui).
import { LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useXacThuc } from "@/auth/xac-thuc";
import { Khung } from "@/components/khung";
import { ThongBao } from "@/components/thong-bao";
import { Button, buttonVariants } from "@/components/ui/button";

export function DangNhapXong() {
  const { hoanTatDangNhap, dangNhap } = useXacThuc();
  const dieuHuong = useNavigate();
  const [loi, datLoi] = useState(false);
  // StrictMode chạy effect hai lần ở dev; code chỉ đổi được một lần.
  const daGoi = useRef(false);

  useEffect(() => {
    if (daGoi.current) return;
    daGoi.current = true;
    hoanTatDangNhap()
      .then((quayVe) => dieuHuong(quayVe, { replace: true }))
      .catch(() => datLoi(true));
  }, [hoanTatDangNhap, dieuHuong]);

  return (
    <div className="flex-1 bg-surface">
      <Khung className="flex justify-center md:py-16">
        {loi ? (
          <ThongBao
            role="alert"
            loai="loi"
            capTieuDe="h1"
            tieuDe="Chưa đăng nhập được"
            className="max-w-xl"
            hanhDong={
              <>
                <Button size="lg" onClick={() => dangNhap("/")}>
                  <LogIn aria-hidden="true" />
                  Đăng nhập lại
                </Button>
                <Link to="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Về trang chủ
                </Link>
              </>
            }
          >
            Phiên đăng nhập không thành công hoặc đã hết hạn, thường do để trang đăng nhập quá lâu hoặc bấm quay lại.
            Thông tin bạn đã nhập chưa bị gửi đi.
          </ThongBao>
        ) : (
          <p role="status" className="text-lg">
            Đang hoàn tất đăng nhập…
          </p>
        )}
      </Khung>
    </div>
  );
}
