// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cổng cán bộ (#55) ở /can-bo, cùng ứng dụng và theme với cổng công dân nhưng tách gói JS (App.tsx
// nạp lười) và tách phiên đăng nhập: client public mot_cua_can_bo, PKCE, Keycloak tự đòi mật khẩu +
// OTP với vai can_bo, lanh_dao. Người đăng nhập không có hai vai này thấy trang "không có quyền".
import type { UserManager } from "oidc-client-ts";
import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { DUONG_DAN_XONG, layQuanLyCanBo } from "@/auth/oidc";
import { useXacThuc, XacThucProvider } from "@/auth/xac-thuc";
import { BoCucCanBo } from "./components/bo-cuc";
import { DuLieuCanBoProvider } from "./du-lieu";
import { docVaiTro, vaiTroCanBo } from "./lib/quyen";
import { ChiTietHoSo } from "./pages/chi-tiet-ho-so";
import { ChuaDangNhap, DangNhapXongCanBo, KhongCoQuyen, KhongThayTrang } from "./pages/cong-vao";
import { HopViec } from "./pages/hop-viec";

function CongVao() {
  const { nguoiDung, dangTai } = useXacThuc();
  useEffect(() => {
    if (!nguoiDung) document.title = "Đăng nhập – Cổng cán bộ – Commune DX-OS";
  }, [nguoiDung]);
  if (dangTai) {
    return (
      <p role="status" className="p-6 text-lg">
        Đang kiểm tra đăng nhập…
      </p>
    );
  }
  if (!nguoiDung) return <ChuaDangNhap />;
  const vaiTro = vaiTroCanBo(docVaiTro(nguoiDung.access_token));
  if (!vaiTro) return <KhongCoQuyen />;
  return (
    <DuLieuCanBoProvider nguoiDung={nguoiDung} vaiTro={vaiTro}>
      <Routes>
        <Route element={<BoCucCanBo />}>
          <Route index element={<HopViec />} />
          <Route path="ho-so/:id" element={<ChiTietHoSo />} />
          <Route path="*" element={<KhongThayTrang />} />
        </Route>
      </Routes>
    </DuLieuCanBoProvider>
  );
}

export default function CongCanBo({ quanLy }: { quanLy?: UserManager }) {
  return (
    <XacThucProvider quanLy={quanLy ?? layQuanLyCanBo()}>
      <Routes>
        <Route path={DUONG_DAN_XONG.slice(1)} element={<DangNhapXongCanBo />} />
        <Route path="*" element={<CongVao />} />
      </Routes>
    </XacThucProvider>
  );
}
