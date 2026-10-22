// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "@/App";
import { layQuanLy } from "@/auth/oidc";
import { XacThucProvider } from "@/auth/xac-thuc";
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
