// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DocGiayTo, LoaiGiayTo } from "@/lib/doc-giay-to";
import { XacNhanGiayTo } from "./components/xac-nhan-giay-to";

const LOAI: Record<string, LoaiGiayTo> = {
  giay_to_tuy_than: {
    ten: "Giấy tờ tùy thân",
    truong: [
      { ma: "ho_ten", nhan: "Họ và tên", kieu: "ho_ten" },
      { ma: "ngay_sinh", nhan: "Ngày sinh", kieu: "ngay" },
    ],
  },
};
const DOC: DocGiayTo = {
  tep_id: "t1",
  ho_so_id: "h1",
  loai: "giay_to_tuy_than",
  trang_thai: "cho_xac_nhan",
  truong_may: {
    ho_ten: { gia_tri: "Trần Văn Mẩu", tin_cay: 0.82, can_kiem_tra: true },
    ngay_sinh: { gia_tri: "01/01/1990", tin_cay: 0.95, can_kiem_tra: false },
  },
  mo_hinh: null,
  doc_luc: "2026-10-26T04:00:00Z",
  loi_doc: null,
  truong_cong_dan: { ho_ten: "Trần Văn Mẫu" },
  truong_xac_nhan: null,
  truong_da_sua: null,
  xac_nhan_boi_sub: null,
  xac_nhan_luc: null,
};

function ve(api = { docLai: vi.fn(), xacNhan: vi.fn() }, doi = vi.fn(), ds = [DOC]) {
  render(
    <XacNhanGiayTo ds={ds} loai={LOAI} tenTep={{ t1: "cccd.png" }} xemAnh={() => Promise.resolve("http://gw/files/s3/x")} api={api} doi={doi} />,
  );
  return { api, doi };
}

describe("cán bộ xác nhận thông tin đọc từ giấy tờ (HITL)", () => {
  it("so máy đọc, công dân khai; giá trị gợi ý là giá trị công dân khai; xác nhận gửi giá trị đã sửa", async () => {
    const xacNhan = vi.fn().mockResolvedValue({ ...DOC, trang_thai: "da_xac_nhan" });
    const { doi } = ve({ docLai: vi.fn(), xacNhan });
    const vung = screen.getByRole("region", { name: "Giấy tờ tùy thân: cccd.png" });
    expect(within(vung).getByText("Chờ xác nhận")).toBeInTheDocument();
    expect(within(vung).getByText("Trần Văn Mẩu")).toBeInTheDocument();
    expect(within(vung).getByText(/tin cậy 82% · cần kiểm tra/)).toBeInTheDocument();
    expect(within(vung).getByText("khác máy đọc")).toBeInTheDocument();
    expect(within(vung).getByLabelText("Giá trị xác nhận: Họ và tên")).toHaveValue("Trần Văn Mẫu");
    expect(within(vung).getByLabelText("Giá trị xác nhận: Ngày sinh")).toHaveValue("01/01/1990");
    await userEvent.clear(within(vung).getByLabelText("Giá trị xác nhận: Ngày sinh"));
    await userEvent.type(within(vung).getByLabelText("Giá trị xác nhận: Ngày sinh"), "02/01/1990");
    await userEvent.click(within(vung).getByRole("button", { name: "Xác nhận đúng với ảnh gốc" }));
    expect(xacNhan).toHaveBeenCalledWith("t1", { ho_ten: "Trần Văn Mẫu", ngay_sinh: "02/01/1990" });
    expect(doi).toHaveBeenCalledWith(expect.objectContaining({ trang_thai: "da_xac_nhan" }));
  });

  it("xem ảnh gốc qua link ngắn hạn", async () => {
    ve();
    await userEvent.click(screen.getByRole("button", { name: "Xem ảnh gốc" }));
    expect(await screen.findByRole("link", { name: /Mở ảnh gốc/ })).toHaveAttribute("href", "http://gw/files/s3/x");
  });

  it("đã xác nhận: chỉ đọc, ghi số trường đã sửa, không còn nút", () => {
    ve(undefined, undefined, [{
      ...DOC, trang_thai: "da_xac_nhan", truong_xac_nhan: { ho_ten: "Trần Văn Mẫu", ngay_sinh: "01/01/1990" },
      truong_da_sua: ["ho_ten"], xac_nhan_boi_sub: "cb", xac_nhan_luc: "2026-10-26T05:00:00Z",
    }]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Xác nhận/ })).not.toBeInTheDocument();
    expect(screen.getByText(/sửa 1 trường so với máy đọc/)).toBeInTheDocument();
  });

  it("lỗi máy chủ (đã có người xác nhận) thì báo câu của máy chủ", async () => {
    const { LoiApi } = await import("@/lib/api");
    ve({ docLai: vi.fn(), xacNhan: vi.fn().mockRejectedValue(new LoiApi("Giấy tờ đã được xác nhận trước đó", 409)) });
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận đúng với ảnh gốc" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("đã được xác nhận trước đó");
  });

  it("không có giấy tờ nào có mẫu đọc thì không hiện thẻ", () => {
    const { container } = render(
      <XacNhanGiayTo ds={[{ ...DOC, loai: "la" }]} loai={LOAI} tenTep={{}} xemAnh={vi.fn()} api={{ docLai: vi.fn(), xacNhan: vi.fn() }} doi={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
