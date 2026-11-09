// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Người dùng "vào vai" (sessionStorage dxos_demo_user) chỉ có hiệu lực ở chế độ dữ liệu giả;
// ở chế độ thật khóa bị xóa và trạng thái đăng nhập lấy từ oidc-client-ts.
import { render, screen } from "@testing-library/react";
import type { UserManager } from "oidc-client-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KHOA_NGUOI_DUNG_DEMO, XacThucProvider, useXacThuc } from "./xac-thuc";

function quanLyGia() {
  const suKien = {
    addUserLoaded: vi.fn(),
    addUserUnloaded: vi.fn(),
    addUserSignedOut: vi.fn(),
    removeUserLoaded: vi.fn(),
    removeUserUnloaded: vi.fn(),
    removeUserSignedOut: vi.fn(),
  };
  return { getUser: vi.fn(() => Promise.resolve(null)), events: suKien } as unknown as UserManager & {
    getUser: ReturnType<typeof vi.fn>;
  };
}

function HienNguoiDung() {
  const { nguoiDung, dangTai } = useXacThuc();
  if (dangTai) return <p>Đang tải</p>;
  return <p>{nguoiDung ? `Đã vào: ${nguoiDung.profile.name}` : "Chưa đăng nhập"}</p>;
}

const DEMO = JSON.stringify({ profile: { sub: "b001", name: "Trần Thị Một Cửa" }, access_token: "gia", expired: false });

afterEach(() => sessionStorage.clear());

describe("người dùng vào vai", () => {
  it("chế độ dữ liệu giả: đọc người dùng từ sessionStorage, không hỏi oidc-client-ts", async () => {
    sessionStorage.setItem(KHOA_NGUOI_DUNG_DEMO, DEMO);
    const quanLy = quanLyGia();
    render(
      <XacThucProvider quanLy={quanLy} duLieuGia>
        <HienNguoiDung />
      </XacThucProvider>,
    );
    expect(await screen.findByText("Đã vào: Trần Thị Một Cửa")).toBeInTheDocument();
    expect(quanLy.getUser).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KHOA_NGUOI_DUNG_DEMO)).toBe(DEMO);
  });

  it("chế độ thật: bỏ qua và xóa khóa vào vai, lấy người dùng từ oidc-client-ts", async () => {
    sessionStorage.setItem(KHOA_NGUOI_DUNG_DEMO, DEMO);
    const quanLy = quanLyGia();
    render(
      <XacThucProvider quanLy={quanLy} duLieuGia={false}>
        <HienNguoiDung />
      </XacThucProvider>,
    );
    expect(await screen.findByText("Chưa đăng nhập")).toBeInTheDocument();
    expect(quanLy.getUser).toHaveBeenCalled();
    expect(sessionStorage.getItem(KHOA_NGUOI_DUNG_DEMO)).toBeNull();
  });
});
