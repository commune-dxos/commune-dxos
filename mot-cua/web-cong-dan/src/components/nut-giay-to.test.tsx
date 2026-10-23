// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoiApi } from "@/lib/api";
import type { GiayToKy } from "@/lib/giay-to";
import { NutGiayTo } from "./nut-giay-to";

const GIAY_TO = { id: "g1", loai: "bien_nhan", chung_thu_ten: "UBND xã Mẫu – Bộ phận Một cửa", maHoSo: "HS1",
  link: "/files/s3/x" } as GiayToKy;

describe("NutGiayTo", () => {
  it("bấm → phát hành, tải về, báo đã ký số bởi xã", async () => {
    const lay = vi.fn().mockResolvedValue(GIAY_TO);
    const tai = vi.fn();
    render(<NutGiayTo loai="bien_nhan" layGiayTo={lay} tai={tai} />);
    await userEvent.click(screen.getByRole("button", { name: /Tải biên nhận hồ sơ \(PDF có ký số\)/ }));
    expect(lay).toHaveBeenCalledOnce();
    expect(tai).toHaveBeenCalledWith(GIAY_TO);
    expect(await screen.findByRole("status")).toHaveTextContent("Đã ký số bởi UBND xã Mẫu – Bộ phận Một cửa");
  });

  it("lỗi → hiện câu lỗi, bấm lại được", async () => {
    const lay = vi.fn().mockRejectedValueOnce(new LoiApi("Chưa sinh được giấy tờ có ký số, thử lại sau", 503))
      .mockResolvedValueOnce(GIAY_TO);
    const tai = vi.fn();
    render(<NutGiayTo loai="ket_qua" layGiayTo={lay} tai={tai} />);
    const nut = screen.getByRole("button", { name: /Tải thông báo kết quả/ });
    await userEvent.click(nut);
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa sinh được giấy tờ có ký số, thử lại sau");
    expect(tai).not.toHaveBeenCalled();
    await userEvent.click(nut);
    expect(tai).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
