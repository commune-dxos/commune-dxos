// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Hai cổng trong một ứng dụng: cổng công dân ở / và cổng cán bộ ở /can-bo (#55). Cổng cán bộ nạp
// lười (gói JS riêng) nên người dân không tải mã của cán bộ; mỗi cổng một client OIDC.
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { DUONG_DAN_XONG } from "@/auth/oidc";
import { BoCuc } from "@/components/bo-cuc";
import { ChiTietThuTuc } from "@/pages/chi-tiet-thu-tuc";
import { ChiTietHoSoCongDan, HoSoCuaToiTrang } from "@/pages/ho-so-cua-toi";
import { DangNhapXong } from "@/pages/dang-nhap-xong";
import { KhongThay } from "@/pages/khong-thay";
import { NopHoSo } from "@/pages/nop-ho-so";
import { TraCuu } from "@/pages/tra-cuu";
import { TroLy } from "@/pages/tro-ly";
import { TrangChu } from "@/pages/trang-chu";

const CongCanBo = lazy(() => import("@/can-bo/cong-can-bo"));

export function App() {
  return (
    <Routes>
      <Route
        path="can-bo/*"
        element={
          <Suspense
            fallback={
              <p role="status" className="p-6 text-lg">
                Đang tải cổng cán bộ…
              </p>
            }
          >
            <CongCanBo />
          </Suspense>
        }
      />
      <Route element={<BoCuc />}>
        <Route index element={<TrangChu />} />
        <Route path="thu-tuc/:ma" element={<ChiTietThuTuc />} />
        <Route path="nop-ho-so/:ma/:buoc?" element={<NopHoSo />} />
        <Route path="tra-cuu" element={<TraCuu />} />
        <Route path="hoi-dap" element={<TroLy />} />
        <Route path="ho-so" element={<HoSoCuaToiTrang />} />
        <Route path="ho-so/:id" element={<ChiTietHoSoCongDan />} />
        <Route path={DUONG_DAN_XONG.slice(1)} element={<DangNhapXong />} />
        <Route path="*" element={<KhongThay />} />
      </Route>
    </Routes>
  );
}
