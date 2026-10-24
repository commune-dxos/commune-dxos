// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Cổng cán bộ (#55) ở /can-bo, cùng ứng dụng và theme với cổng công dân nhưng tách gói JS (App.tsx
// nạp lười) và tách phiên đăng nhập: client public mot_cua_can_bo, PKCE, Keycloak tự đòi mật khẩu +
// OTP với vai can_bo, lanh_dao, van_thu. Người đăng nhập không có các vai này thấy trang "không có quyền".
// Văn thư (#78) chỉ làm việc với sổ văn bản: trang đầu của họ là /can-bo/van-ban.
import type { UserManager } from "oidc-client-ts";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { DUONG_DAN_XONG, layQuanLyCanBo } from "@/auth/oidc";
import { useXacThuc, XacThucProvider } from "@/auth/xac-thuc";
import { BoCucCanBo } from "./components/bo-cuc";
import { DuLieuCanBoProvider } from "./du-lieu";
import { docVaiTro, vaiTroCanBo } from "./lib/quyen";
import { ChiTietHoSo } from "./pages/chi-tiet-ho-so";
import { ChuaDangNhap, DangNhapXongCanBo, KhongCoQuyen, KhongThayTrang } from "./pages/cong-vao";
import { HopViec } from "./pages/hop-viec";
import { SoVanBan } from "./pages/so-van-ban";

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
          <Route index element={vaiTro === "van_thu" ? <Navigate to="van-ban" replace /> : <HopViec />} />
          <Route path="ho-so/:id" element={vaiTro === "van_thu" ? <Navigate to="../van-ban" replace /> : <ChiTietHoSo />} />
          <Route path="van-ban" element={<SoVanBan />} />
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
