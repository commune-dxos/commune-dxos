// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import type { ThuTuc } from "@/lib/api";
import { ChiTietThuTuc } from "./chi-tiet-thu-tuc";

const DS = duLieuGia as ThuTuc[];

function ve(duongDan: string, taiDanhMuc: () => Promise<ThuTuc[]>) {
  return render(
    <MemoryRouter initialEntries={[duongDan]}>
      <Routes>
        <Route path="/thu-tuc/:ma" element={<ChiTietThuTuc taiDanhMuc={taiDanhMuc} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("chi tiết thủ tục – tiêu đề tab", () => {
  it("tiêu đề có tên thủ tục", async () => {
    ve("/thu-tuc/KS01", () => Promise.resolve(DS));
    await screen.findByRole("heading", { level: 1, name: "Đăng ký khai sinh" });
    await waitFor(() => expect(document.title).toBe("Đăng ký khai sinh – Cổng dịch vụ công xã"));
  });

  it("mã không có trong danh mục thì tiêu đề báo không có", async () => {
    ve("/thu-tuc/XX99", () => Promise.resolve(DS));
    await screen.findByRole("heading", { level: 1, name: "Không có thủ tục mã XX99" });
    await waitFor(() => expect(document.title).toBe("Không có thủ tục mã XX99 – Cổng dịch vụ công xã"));
  });
});
