// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LoiApi } from "@/lib/api";
import type { KetQuaDocThu, LoaiGiayTo } from "@/lib/doc-giay-to";
import { DocAnh } from "./doc-anh";

const LOAI: LoaiGiayTo = {
  ten: "Giấy tờ tùy thân",
  truong: [
    { ma: "ho_ten", nhan: "Họ và tên", kieu: "ho_ten" },
    { ma: "ngay_sinh", nhan: "Ngày sinh", kieu: "ngay" },
    { ma: "que_quan", nhan: "Quê quán", kieu: "chu" },
  ],
};
const KQ: KetQuaDocThu = {
  loai: "giay_to_tuy_than",
  truong: {
    ho_ten: { gia_tri: "Trần Văn Mẫu", tin_cay: 0.93, can_kiem_tra: false },
    ngay_sinh: { gia_tri: "01/01/1990", tin_cay: 0.71, can_kiem_tra: true },
  },
};

function Vo({ tep, docThu, dungHoTen }: { tep: File[]; docThu: () => Promise<KetQuaDocThu>; dungHoTen?: (h: string) => void }) {
  const [g, datG] = useState<Record<string, string> | undefined>();
  return <DocAnh ma="giay_to_tuy_than" loai={LOAI} tep={tep} giaTri={g} doi={datG} docThu={docThu} dungHoTen={dungHoTen} />;
}

describe("tự điền từ ảnh giấy tờ", () => {
  it("chưa chọn ảnh (chỉ có PDF) thì không đọc được", () => {
    render(<Vo tep={[new File(["%PDF"], "a.pdf")]} docThu={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Đọc thông tin từ ảnh" })).toBeDisabled();
    expect(screen.getByText(/Chọn ảnh JPG hoặc PNG/)).toBeInTheDocument();
  });

  it("đọc ảnh → điền các ô, đánh dấu trường cần kiểm tra lại và trường máy không đọc được; sửa được", async () => {
    const docThu = vi.fn().mockResolvedValue(KQ);
    const dungHoTen = vi.fn();
    const anh = new File(["\x89PNG"], "cccd.png", { type: "image/png" });
    render(<Vo tep={[anh]} docThu={docThu} dungHoTen={dungHoTen} />);
    await userEvent.click(screen.getByRole("button", { name: "Đọc thông tin từ ảnh" }));
    expect(docThu).toHaveBeenCalledWith("giay_to_tuy_than", anh);
    expect(await screen.findByLabelText("Họ và tên")).toHaveValue("Trần Văn Mẫu");
    expect(screen.getByLabelText(/Ngày sinh/)).toHaveValue("01/01/1990");
    expect(screen.getByLabelText(/Quê quán/)).toHaveValue("");
    expect(screen.getAllByText("Kiểm tra lại")).toHaveLength(2);
    await userEvent.clear(screen.getByLabelText(/Quê quán/));
    await userEvent.type(screen.getByLabelText(/Quê quán/), "Xã Mẫu");
    expect(screen.getByLabelText(/Quê quán/)).toHaveValue("Xã Mẫu");
    await userEvent.click(screen.getByRole("button", { name: "Dùng họ tên này cho người nộp" }));
    expect(dungHoTen).toHaveBeenCalledWith("Trần Văn Mẫu");
    await userEvent.click(screen.getByRole("button", { name: "Không dùng thông tin đọc được" }));
    expect(screen.queryByLabelText("Họ và tên")).not.toBeInTheDocument();
  });

  it("OCR chưa bật trên máy chủ → báo, vẫn nộp được", async () => {
    const docThu = vi.fn().mockRejectedValue(new LoiApi("Chức năng đọc giấy tờ chưa bật trên máy chủ này", 503));
    render(<Vo tep={[new File(["x"], "a.jpg")]} docThu={docThu} />);
    await userEvent.click(screen.getByRole("button", { name: "Đọc thông tin từ ảnh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chưa bật");
  });
});
