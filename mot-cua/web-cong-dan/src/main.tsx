// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "@/App";
import { layQuanLy } from "@/auth/oidc";
import { XacThucProvider } from "@/auth/xac-thuc";
// Be Vietnam Pro (SIL OFL-1.1) tự host: Vite đóng gói woff2 vào bản build, không gọi Google Fonts.
// Chỉ lấy bộ chữ latin + vietnamese, 6 độ đậm (800, 900 cho tiêu đề đậm, #141).
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/be-vietnam-pro/latin-800.css";
import "@fontsource/be-vietnam-pro/latin-900.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-800.css";
import "@fontsource/be-vietnam-pro/vietnamese-900.css";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <XacThucProvider quanLy={layQuanLy()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </XacThucProvider>
  </StrictMode>,
);
