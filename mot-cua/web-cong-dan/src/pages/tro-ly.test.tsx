// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LoiApi } from "@/lib/api";
import { hoiTroLy, tachTrichDan, type ThongTinTroLy, type TraLoiTroLy } from "@/lib/tro-ly";
import { TroLy } from "./tro-ly";

const TT: ThongTinTroLy = { che_do: "ollama", co_mo_hinh_ngon_ngu: true, mo_hinh: "qwen2.5:7b" };

function traLoi(p: Partial<TraLoiTroLy> = {}): TraLoiTroLy {
  return {
    ...TT,
    cau_tra_loi: "Cần tờ khai và giấy tờ tùy thân [1]. Miễn lệ phí [2].",
    thong_bao: null,
    trich_tu_dong: false,
    nguon: [
      { so: 1, id: "HT02-2", ma_thu_tuc: "HT02", tieu_de: "Đăng ký kết hôn – Giấy tờ", trich: "Tờ khai…", lien_ket: null, duoc_trich: true },
      { so: 2, id: "goi-KS01-0", ma_thu_tuc: "KS01", tieu_de: "Đăng ký khai sinh – Tóm tắt", trich: "Không thu lệ phí", lien_ket: "/thu-tuc/KS01", duoc_trich: true },
    ],
    ...p,
  };
}

function ve(hoi: (q: string, ma: string | null) => Promise<TraLoiTroLy>, url = "/hoi-dap", tt = TT) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TroLy hoi={hoi} layThongTin={() => Promise.resolve(tt)} />
    </MemoryRouter>,
  );
}

describe("tách trích dẫn", () => {
  it("chỉ nhận [n] có trong danh sách nguồn", () => {
    expect(tachTrichDan("A [1] B [3] C [2]", 2)).toEqual([
      { loai: "chu", noiDung: "A " },
      { loai: "trich", so: 1 },
      { loai: "chu", noiDung: " B [3] C " },
      { loai: "trich", so: 2 },
    ]);
    expect(tachTrichDan("Không nguồn", 0)).toEqual([{ loai: "chu", noiDung: "Không nguồn" }]);
  });
});

describe("gọi trợ lý qua APISIX", () => {
  it("POST /tro-ly/hoi kèm mã thủ tục, không gửi token", async () => {
    const goi = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(traLoi()), { status: 200 }));
    const cauHinh = { gatewayUrl: "", keycloakUrl: "", realm: "dxos", clientId: "w", clientIdCanBo: "c", duLieuGia: false };
    await hoiTroLy("  hỏi gì  ", "KS01", cauHinh, goi);
    const [url, init] = goi.mock.calls[0];
    expect(url).toBe("/tro-ly/hoi");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ cau_hoi: "hỏi gì", ma_thu_tuc: "KS01" });
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
  });
});

describe("trang hỏi đáp", () => {
  it("hỏi bằng câu gợi ý, hiện câu trả lời với trích dẫn nối tới nguồn", async () => {
    const hoi = vi.fn().mockResolvedValue(traLoi());
    ve(hoi);
    expect(await screen.findByText(/qwen2.5:7b/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký kết hôn cần những giấy tờ gì?" }));
    expect(hoi).toHaveBeenCalledWith("Đăng ký kết hôn cần những giấy tờ gì?", null);
    const luot = await screen.findByRole("article", { name: "Câu hỏi: Đăng ký kết hôn cần những giấy tờ gì?" });
    const trich = within(luot).getByRole("link", { name: "Nguồn 1: Đăng ký kết hôn – Giấy tờ" });
    expect(trich).toHaveAttribute("href", expect.stringMatching(/^#nguon-\d+-1$/));
    const nguon = within(luot).getByRole("region", { name: "Nguồn tham khảo" });
    expect(within(nguon).getAllByRole("listitem")).toHaveLength(2);
    expect(within(nguon).getByRole("link", { name: "Xem thủ tục và nộp hồ sơ" })).toHaveAttribute("href", "/thu-tuc/KS01");
    expect(screen.queryByRole("button", { name: /Đăng ký kết hôn cần/ })).not.toBeInTheDocument();
  });

  it("gõ câu hỏi, Enter để gửi; hỏi riêng một thủ tục theo ?ma=", async () => {
    const hoi = vi.fn().mockResolvedValue(traLoi());
    ve(hoi, "/hoi-dap?ma=KS01");
    expect(screen.getByText("KS01")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Câu hỏi của bạn"), "Lệ phí bao nhiêu?{Enter}");
    expect(hoi).toHaveBeenCalledWith("Lệ phí bao nhiêu?", "KS01");
    expect(await screen.findByRole("article", { name: "Câu hỏi: Lệ phí bao nhiêu?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi của bạn")).toHaveValue("");
  });

  it("câu hỏi rỗng thì báo lỗi, không gọi trợ lý", async () => {
    const hoi = vi.fn();
    ve(hoi);
    await userEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    expect(screen.getByText(/Nhập câu hỏi về thủ tục/)).toBeInTheDocument();
    expect(screen.getByLabelText("Câu hỏi của bạn")).toHaveAttribute("aria-invalid", "true");
    expect(hoi).not.toHaveBeenCalled();
  });

  it("chế độ chỉ tìm kiếm: nói rõ, hiện tài liệu liên quan thay cho câu trả lời", async () => {
    const tt: ThongTinTroLy = { che_do: "tat", co_mo_hinh_ngon_ngu: false, mo_hinh: null };
    const hoi = vi.fn().mockResolvedValue(
      traLoi({ ...tt, cau_tra_loi: null, thong_bao: "Trợ lý đang ở chế độ chỉ tìm kiếm." }),
    );
    ve(hoi, "/hoi-dap", tt);
    expect(await screen.findByText(/Chế độ tìm kiếm/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Câu hỏi của bạn"), "kết hôn{Enter}");
    const luot = await screen.findByRole("article", { name: "Câu hỏi: kết hôn" });
    expect(within(luot).getByRole("note")).toHaveTextContent("chế độ chỉ tìm kiếm");
    expect(within(luot).getByRole("heading", { name: "Tài liệu liên quan" })).toBeInTheDocument();
    expect(within(luot).queryByRole("link", { name: /^Nguồn 1/ })).not.toBeInTheDocument();
  });

  it("lỗi gọi trợ lý thì báo, vẫn hỏi tiếp được", async () => {
    const hoi = vi
      .fn()
      .mockRejectedValueOnce(new LoiApi("Có quá nhiều lượt truy cập. Vui lòng đợi một phút rồi thử lại.", 429))
      .mockResolvedValueOnce(traLoi());
    ve(hoi);
    await userEvent.type(screen.getByLabelText("Câu hỏi của bạn"), "câu một{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("quá nhiều lượt truy cập");
    await userEvent.type(screen.getByLabelText("Câu hỏi của bạn"), "câu hai{Enter}");
    expect(await screen.findByRole("article", { name: "Câu hỏi: câu hai" })).toBeInTheDocument();
    expect(hoi).toHaveBeenCalledTimes(2);
  });
});
