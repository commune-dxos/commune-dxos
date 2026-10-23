// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { Route, Routes } from "react-router";
import { DUONG_DAN_XONG } from "@/auth/oidc";
import { BoCuc } from "@/components/bo-cuc";
import { ChiTietThuTuc } from "@/pages/chi-tiet-thu-tuc";
import { DangNhapXong } from "@/pages/dang-nhap-xong";
import { KhongThay } from "@/pages/khong-thay";
import { NopHoSo } from "@/pages/nop-ho-so";
import { TrangChu } from "@/pages/trang-chu";

export function App() {
  return (
    <Routes>
      <Route element={<BoCuc />}>
        <Route index element={<TrangChu />} />
        <Route path="thu-tuc/:ma" element={<ChiTietThuTuc />} />
        <Route path="nop-ho-so/:ma/:buoc?" element={<NopHoSo />} />
        <Route path={DUONG_DAN_XONG.slice(1)} element={<DangNhapXong />} />
        <Route path="*" element={<KhongThay />} />
      </Route>
    </Routes>
  );
}
