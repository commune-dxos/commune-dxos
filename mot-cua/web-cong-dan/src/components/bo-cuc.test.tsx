// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Đầu trang (#140): trên điện thoại liên kết và nút đăng nhập nằm trong ngăn kéo "Menu" (mở/đóng bằng bàn phím,
// có tiêu đề cho trình đọc màn hình); bấm một liên kết thì ngăn kéo đóng.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { XacThucProvider } from "@/auth/xac-thuc";
import { BoCuc } from "./bo-cuc";

function quanLyGia(signinRedirect = vi.fn()) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(null), events: suKien, signinRedirect } as unknown as UserManager;
}

function ve(signinRedirect = vi.fn()) {
  return render(
    <XacThucProvider quanLy={quanLyGia(signinRedirect)}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<BoCuc />}>
            <Route index element={<h1>Trang chủ</h1>} />
            <Route path="tra-cuu" element={<h1>Tra cứu</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </XacThucProvider>,
  );
}

describe("đầu trang", () => {
  it("nút Menu mở ngăn kéo có liên kết chính và Đăng nhập; chọn liên kết thì đóng", async () => {
    const u = userEvent.setup();
    ve();
    await u.click(screen.getByRole("button", { name: "Menu" }));
    const ngan = await screen.findByRole("dialog", { name: "Cổng dịch vụ công xã" });
    const nav = within(ngan).getByRole("navigation", { name: "Liên kết chính" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Danh mục thủ tục",
      "Hỏi đáp",
      "Tra cứu hồ sơ",
    ]);
    expect(within(ngan).getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
    await u.click(within(nav).getByRole("link", { name: "Tra cứu hồ sơ" }));
    expect(await screen.findByRole("heading", { name: "Tra cứu" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Esc đóng ngăn kéo", async () => {
    const u = userEvent.setup();
    ve();
    await u.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
