// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Trang tra cứu tiến độ hồ sơ không cần đăng nhập /tra-cuu (#54, #124): nhập sai thì báo ở ô và không gọi
// API; thấy hồ sơ thì hiện trạng thái và các bước; không thấy thì một câu chung cho sai mã hay sai số
// (không lộ mã nào tồn tại); lỗi mạng, 5xx thì báo lỗi, trang vẫn dùng được. API giả bằng fetch, đi qua
// traCuuCongKhai thật. Dữ liệu giả.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XacThucProvider } from "@/auth/xac-thuc";
import type { KetQuaTraCuu } from "@/lib/tra-cuu";
import { TraCuu } from "./tra-cuu";

function quanLyGia() {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(null), events: suKien, signinRedirect: vi.fn() } as unknown as UserManager;
}

function ve(duong = "/tra-cuu") {
  return render(
    <XacThucProvider quanLy={quanLyGia()}>
      <MemoryRouter initialEntries={[duong]}>
        <Routes>
          <Route path="/tra-cuu" element={<TraCuu />} />
        </Routes>
      </MemoryRouter>
    </XacThucProvider>,
  );
}

const HO_SO: KetQuaTraCuu = {
  ma_ho_so: "HS20261024-000123", thu_tuc: { ma: "KS01", ten: "Đăng ký khai sinh" }, trang_thai: "dang_xu_ly",
  ngay_nhan: "2026-10-24T01:00:00Z", han_xu_ly: "2099-10-27", ngay_hoan_tat: null,
  lich_su: [{ trang_thai: "moi", luc: "2026-10-24T01:00:00Z" }, { trang_thai: "dang_xu_ly", luc: "2026-10-24T03:00:00Z" }],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const KHONG_THAY = "Không tìm thấy hồ sơ khớp mã và số điện thoại";

let goi: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  goi = vi.fn<typeof fetch>(() => Promise.resolve(json(null)));
  vi.stubGlobal("fetch", goi);
});
afterEach(() => vi.unstubAllGlobals());

async function nhap(ma: string, soCuoi: string) {
  const oMa = screen.getByLabelText("Mã hồ sơ");
  const oSo = screen.getByLabelText("4 số cuối số điện thoại");
  await userEvent.clear(oMa);
  await userEvent.clear(oSo);
  if (ma) await userEvent.type(oMa, ma);
  if (soCuoi) await userEvent.type(oSo, soCuoi);
  await userEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
}

describe("trang tra cứu hồ sơ", () => {
  it("bỏ trống hoặc sai định dạng → báo lỗi ở từng ô, không gọi API", async () => {
    ve();
    await nhap("", "");
    const oMa = screen.getByLabelText("Mã hồ sơ");
    const oSo = screen.getByLabelText("4 số cuối số điện thoại");
    expect(oMa).toHaveAttribute("aria-invalid", "true");
    expect(oSo).toHaveAttribute("aria-invalid", "true");
    expect(oMa).toHaveAccessibleDescription(/Nhập mã hồ sơ in trên biên nhận/);
    expect(oSo).toHaveAccessibleDescription(/Nhập đúng 4 chữ số cuối/);

    // Sai định dạng: mã thiếu phần số thứ tự, số điện thoại chỉ có 3 chữ số.
    await nhap("HS20261024", "123");
    expect(oMa).toHaveAttribute("aria-invalid", "true");
    expect(oSo).toHaveAttribute("aria-invalid", "true");

    // Chỉ một ô sai thì chỉ ô đó báo lỗi, vẫn không gọi API.
    await nhap("HS20261024-000123", "12");
    expect(oMa).not.toHaveAttribute("aria-invalid");
    expect(oSo).toHaveAttribute("aria-invalid", "true");
    expect(goi).not.toHaveBeenCalled();
  });

  it("nhập đúng, API trả hồ sơ → hiện trạng thái và các bước", async () => {
    goi.mockResolvedValueOnce(json(HO_SO));
    ve();
    await nhap("hs20261024-000123", "1234");

    expect(await screen.findByRole("heading", { level: 2, name: "HS20261024-000123" })).toBeInTheDocument();
    expect(goi).toHaveBeenCalledTimes(1);
    const url = new URL(String(goi.mock.calls[0][0]), "http://x");
    expect(url.pathname).toMatch(/\/public\/rpc\/tra_cuu_ho_so$/);
    expect(url.searchParams.get("p_ma")).toBe("HS20261024-000123");
    expect(url.searchParams.get("p_so_cuoi")).toBe("1234");

    expect(screen.getByText("Đăng ký khai sinh")).toBeInTheDocument();
    expect(screen.getByText("Đang xử lý", { selector: "[data-trang-thai]" })).toBeInTheDocument();
    expect(screen.getByText("Cán bộ chuyên môn đang thẩm định hồ sơ.")).toBeInTheDocument();
    const buoc = screen.getByRole("list", { name: "Các bước giải quyết" });
    const trang = (ten: string) => within(buoc).getByText(ten).closest("li");
    expect(trang("Nộp hồ sơ")).toHaveAttribute("data-trang", "xong");
    expect(trang("Tiếp nhận, kiểm tra giấy tờ")).toHaveAttribute("data-trang", "xong");
    expect(trang("Thẩm định")).toHaveAttribute("data-trang", "dang");
    expect(trang("Lãnh đạo xã phê duyệt")).toHaveAttribute("data-trang", "cho");
    expect(trang("Trả kết quả")).toHaveAttribute("data-trang", "cho");
  });

  it("không thấy → cùng một câu cho sai mã hay sai số điện thoại", async () => {
    ve();
    await nhap("HS20261024-000999", "1234");
    const saiMa = (await screen.findByText(KHONG_THAY)).closest("[role=status]")?.textContent;

    await nhap("HS20261024-000123", "9999");
    await screen.findByText(KHONG_THAY);
    const saiSo = screen.getByText(KHONG_THAY).closest("[role=status]")?.textContent;

    expect(goi).toHaveBeenCalledTimes(2);
    expect(saiMa).toBeTruthy();
    expect(saiSo).toBe(saiMa);
    // Câu thông báo không nhắc lại mã đã nhập, không gợi ý mã có tồn tại hay không.
    expect(saiMa).not.toMatch(/HS2026/);
    expect(screen.queryByRole("list", { name: "Các bước giải quyết" })).not.toBeInTheDocument();
  });

  it("lỗi mạng hoặc 5xx → báo lỗi, trang vẫn tra cứu lại được", async () => {
    goi.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    ve();
    await nhap("HS20261024-000123", "1234");
    const loiMang = await screen.findByRole("alert");
    expect(loiMang).toHaveTextContent("Chưa tra cứu được");
    expect(loiMang).toHaveTextContent("Không kết nối được tới máy chủ");

    goi.mockResolvedValueOnce(json({ message: "internal error" }, 503));
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hệ thống đang bận hoặc bảo trì");
    // Không đưa câu lỗi tiếng Anh của máy chủ ra cho người dân.
    expect(screen.getByRole("alert")).not.toHaveTextContent("internal error");

    // Form vẫn còn, lần sau API trả được thì hiện kết quả.
    goi.mockResolvedValueOnce(json(HO_SO));
    await userEvent.click(screen.getByRole("button", { name: "Tra cứu" }));
    expect(await screen.findByRole("heading", { level: 2, name: "HS20261024-000123" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
