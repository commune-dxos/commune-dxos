// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import duLieuGia from "@/du-lieu-gia/thu-tuc.json";
import { LoiApi, type ThuTuc } from "@/lib/api";
import { TrangChu } from "./trang-chu";

const DS = duLieuGia as ThuTuc[];

function ve(taiDanhMuc: () => Promise<ThuTuc[]>) {
  return render(
    <MemoryRouter>
      <TrangChu taiDanhMuc={taiDanhMuc} />
    </MemoryRouter>,
  );
}

describe("trang chủ – danh mục thủ tục", () => {
  it("hiện mã, tên, lĩnh vực, thời hạn, lệ phí và nút nộp hồ sơ", async () => {
    ve(() => Promise.resolve(DS));
    const ks = await screen.findByRole("article", { name: "Đăng ký khai sinh" });
    expect(within(ks).getByText("KS01")).toBeInTheDocument();
    expect(within(ks).getByText("Hộ tịch")).toBeInTheDocument();
    expect(within(ks).getByText("1 ngày làm việc")).toBeInTheDocument();
    expect(within(ks).getByText("Miễn phí")).toBeInTheDocument();
    expect(within(ks).getByRole("link", { name: "Nộp hồ sơ: Đăng ký khai sinh" })).toHaveAttribute(
      "href",
      "/nop-ho-so/KS01",
    );

    const ct = screen.getByRole("article", { name: "Chứng thực bản sao từ bản chính" });
    expect(within(ct).getByText("Trong ngày")).toBeInTheDocument();
    expect(within(ct).getByText("2.000 đồng")).toBeInTheDocument();
    expect(screen.getByText(`${DS.length} thủ tục nhận hồ sơ`)).toBeInTheDocument();
  });

  it("thủ tục chưa có quy trình thì không có nút nộp", async () => {
    ve(() => Promise.resolve([{ ...DS[1], quy_trinh: null }]));
    await screen.findByRole("article", { name: "Đăng ký khai sinh" });
    expect(screen.queryByRole("link", { name: /Nộp hồ sơ/ })).not.toBeInTheDocument();
    expect(screen.getByText(/chưa nhận hồ sơ trực tuyến/)).toBeInTheDocument();
  });

  it("tìm không dấu lọc danh mục", async () => {
    ve(() => Promise.resolve(DS));
    await screen.findByRole("article", { name: "Đăng ký khai sinh" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Tìm thủ tục" }), "chung thuc");
    expect(screen.queryByRole("article", { name: "Đăng ký khai sinh" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Chứng thực bản sao từ bản chính" })).toBeInTheDocument();
    expect(screen.getByText(`Tìm thấy 1 / ${DS.length} thủ tục`)).toBeInTheDocument();
  });

  it("lỗi tải thì báo rõ và thử lại được", async () => {
    const tai = vi
      .fn<() => Promise<ThuTuc[]>>()
      .mockRejectedValueOnce(new LoiApi("Có quá nhiều lượt truy cập. Vui lòng đợi một phút rồi thử lại.", 429))
      .mockResolvedValueOnce(DS);
    ve(tai);
    expect(await screen.findByRole("alert")).toHaveTextContent("đợi một phút");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("article", { name: "Đăng ký khai sinh" })).toBeInTheDocument();
    expect(tai).toHaveBeenCalledTimes(2);
  });

  it("không thấy thủ tục thì có nút xóa từ khóa", async () => {
    ve(() => Promise.resolve(DS));
    await screen.findByRole("article", { name: "Đăng ký khai sinh" });
    const o = screen.getByRole("searchbox", { name: "Tìm thủ tục" });
    await userEvent.type(o, "ho khau");
    await userEvent.click(screen.getByRole("button", { name: "Xóa từ khóa, xem tất cả" }));
    expect(o).toHaveValue("");
    expect(screen.getByText(`${DS.length} thủ tục nhận hồ sơ`)).toBeInTheDocument();
  });

  it("thẻ thủ tục hiện giấy tờ bắt buộc lấy từ JSON Schema", async () => {
    ve(() => Promise.resolve(DS));
    const ks = await screen.findByRole("article", { name: "Đăng ký khai sinh" });
    expect(within(ks).getByText("Giấy tờ cần có (3)")).toBeInTheDocument();
    expect(within(ks).getByText("Giấy chứng sinh")).toBeInTheDocument();
  });
});
