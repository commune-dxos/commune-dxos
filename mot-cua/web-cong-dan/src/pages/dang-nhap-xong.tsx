// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Keycloak chuyển về đây với ?code=…&state=…; đổi code lấy token (PKCE) rồi quay lại trang cũ.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useXacThuc } from "@/auth/xac-thuc";
import { Khung } from "@/components/khung";

export function DangNhapXong() {
  const { hoanTatDangNhap } = useXacThuc();
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

  if (loi) {
    return (
      <Khung>
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-lg font-semibold text-destructive">Đăng nhập không thành công hoặc đã hết hạn.</p>
          <Link to="/" className="text-lg text-primary underline">
            Về trang chủ và thử lại
          </Link>
        </div>
      </Khung>
    );
  }
  return (
    <Khung>
      <p role="status" className="text-lg">
        Đang hoàn tất đăng nhập…
      </p>
    </Khung>
  );
}
