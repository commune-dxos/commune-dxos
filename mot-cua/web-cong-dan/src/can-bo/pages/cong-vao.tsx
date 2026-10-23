// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Các màn trước khi vào cổng cán bộ: chưa đăng nhập (bố cục block login của shadcn/ui), hoàn tất đăng
// nhập (đổi code lấy token, PKCE), không có quyền (đăng nhập được nhưng không có vai can_bo/lanh_dao),
// không thấy trang.
import { KeyRound, LogIn, LogOut, ShieldX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { GOC_CAN_BO } from "@/auth/oidc";
import { useXacThuc } from "@/auth/xac-thuc";
import { ThongBao } from "@/components/thong-bao";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function NenGiua({ children }: { children: ReactNode }) {
  return (
    <main id="noi-dung" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface p-4">
      <a href="/" className="flex items-center gap-3 text-foreground no-underline">
        <img src="/mark-64.png" alt="" width={48} height={48} className="size-12" />
        <span className="flex flex-col leading-tight">
          <span className="text-lg font-bold">Commune DX-OS</span>
          <span className="text-muted-foreground">Chính quyền số Cấp xã</span>
        </span>
      </a>
      {children}
    </main>
  );
}

export function ChuaDangNhap() {
  const { dangNhap } = useXacThuc();
  return (
    <NenGiua>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-bold">Cổng cán bộ</h1>
          </CardTitle>
          <CardDescription className="text-base">
            Dành cho cán bộ một cửa, cán bộ chuyên môn và lãnh đạo xã: xử lý hồ sơ theo lĩnh vực phụ trách.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button size="lg" onClick={() => void dangNhap()}>
            <LogIn aria-hidden="true" />
            Đăng nhập
          </Button>
          <p className="flex items-start gap-2 text-muted-foreground">
            <KeyRound aria-hidden="true" className="mt-1 size-5 shrink-0" />
            Đăng nhập bằng tài khoản cán bộ qua hệ thống đăng nhập một lần của xã. Cần mật khẩu và mã OTP trên ứng
            dụng xác thực (lần đầu sẽ được hướng dẫn cài).
          </p>
          <a href="/" className="text-link">
            Bạn là người dân? Tới cổng dịch vụ công
          </a>
        </CardContent>
      </Card>
    </NenGiua>
  );
}

export function KhongCoQuyen() {
  const { nguoiDung, dangXuat } = useXacThuc();
  useEffect(() => {
    document.title = "Không có quyền – Cổng cán bộ – Commune DX-OS";
  }, []);
  return (
    <NenGiua>
      <ThongBao
        role="alert"
        loai="loi"
        capTieuDe="h1"
        bieuTuong={ShieldX}
        tieuDe="Bạn không có quyền vào cổng cán bộ"
        className="max-w-xl"
        hanhDong={
          <>
            <Button onClick={() => void dangXuat()}>
              <LogOut aria-hidden="true" />
              Đăng xuất, dùng tài khoản khác
            </Button>
            <a href="/" className={buttonVariants({ variant: "outline" })}>
              Tới cổng dịch vụ công
            </a>
          </>
        }
      >
        Tài khoản {nguoiDung?.profile.preferred_username ? <strong>{nguoiDung.profile.preferred_username}</strong> : "này"} không
        có vai trò cán bộ hoặc lãnh đạo xã. Nếu bạn là cán bộ, đề nghị quản trị viên cấp quyền.
      </ThongBao>
    </NenGiua>
  );
}

export function DangNhapXongCanBo() {
  const { hoanTatDangNhap, dangNhap } = useXacThuc();
  const dieuHuong = useNavigate();
  const [loi, datLoi] = useState(false);
  const daGoi = useRef(false);

  useEffect(() => {
    if (daGoi.current) return;
    daGoi.current = true;
    hoanTatDangNhap()
      .then((quayVe) => dieuHuong(quayVe.startsWith(GOC_CAN_BO) ? quayVe : GOC_CAN_BO, { replace: true }))
      .catch(() => datLoi(true));
  }, [hoanTatDangNhap, dieuHuong]);

  return (
    <NenGiua>
      {loi ? (
        <ThongBao
          role="alert"
          loai="loi"
          capTieuDe="h1"
          tieuDe="Chưa đăng nhập được"
          className="max-w-xl"
          hanhDong={
            <Button onClick={() => void dangNhap(GOC_CAN_BO)}>
              <LogIn aria-hidden="true" />
              Đăng nhập lại
            </Button>
          }
        >
          Phiên đăng nhập không thành công hoặc đã hết hạn, thường do để trang đăng nhập quá lâu hoặc bấm quay lại.
        </ThongBao>
      ) : (
        <p role="status" className="text-lg">
          Đang hoàn tất đăng nhập…
        </p>
      )}
    </NenGiua>
  );
}

export function KhongThayTrang() {
  return (
    <ThongBao
      loai="trong"
      capTieuDe="h1"
      tieuDe="Không tìm thấy trang"
      hanhDong={
        <Link to={GOC_CAN_BO} className={buttonVariants({ variant: "outline" })}>
          Về hộp việc
        </Link>
      }
    >
      Đường dẫn không đúng hoặc trang đã được chuyển.
    </ThongBao>
  );
}
