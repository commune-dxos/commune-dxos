// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Layout cổng công dân (#141): đầu trang, nội dung (Outlet), chân trang – mỗi phần là một component riêng trong
// src/components/khung-trang/. Liên kết "bỏ qua" tới nội dung chính cho người dùng bàn phím.
import { Outlet } from "react-router";
import { ChanTrang } from "@/components/khung-trang/chan-trang";
import { DauTrang } from "@/components/khung-trang/dau-trang";

export function BoCuc() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-3 focus:text-background"
      >
        Bỏ qua, tới nội dung chính
      </a>
      <DauTrang />
      <main id="noi-dung" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <ChanTrang />
    </div>
  );
}
