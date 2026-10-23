// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CongCanBo from "./cong-can-bo";
import { vaiTroCanBo } from "./lib/quyen";
import { jwtGia } from "./test/gia";

function quanLyGia(nguoiDung: Partial<User>) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(nguoiDung), events: suKien, signinRedirect: vi.fn(), signoutRedirect: vi.fn() } as unknown as UserManager;
}
const nguoiDung = (roles: string[]): Partial<User> => ({
  profile: { sub: "sub-x", preferred_username: "x", name: "Người Thử" } as User["profile"],
  access_token: jwtGia({ sub: "sub-x", resource_access: { dxos_api: { roles } } }),
  expired: false,
});
function ve(duong: string, roles: string[]) {
  return render(
    <MemoryRouter initialEntries={[duong]}>
      <Routes>
        <Route path="can-bo/*" element={<CongCanBo quanLy={quanLyGia(nguoiDung(roles))} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const DEN = { id: "11111111-1111-4111-8111-111111111111", chieu: "den", trang_thai: "da_vao_so", nam: 2026, so: 3,
  ky_hieu: "15/UBND-VP", loai: "Công văn", ngay_van_ban: "2026-10-20", trich_yeu: "Về rà soát hộ nghèo",
  noi_gui: "UBND huyện Mẫu", noi_nhan: null, nguoi_ky: null, ten_tep: "cv.pdf", kich_thuoc: 10, sha256: "a",
  xac_minh_chu_ky: { coChuKy: true, hopLe: true }, ky_luc: null, created_at: "2026-10-23T01:00:00Z" };
const DU_THAO = { ...DEN, id: "22222222-2222-4222-8222-222222222222", chieu: "di", trang_thai: "du_thao", nam: null,
  so: null, ky_hieu: null, loai: "Thông báo", ngay_van_ban: null, trich_yeu: "Về lịch tiếp công dân",
  noi_gui: null, noi_nhan: "Các thôn", ten_tep: null, xac_minh_chu_ky: null };

let goi: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  goi = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.includes("/api/van_ban?chieu=eq.den")) return json([DEN]);
    if (u.includes("/api/van_ban?chieu=eq.di")) return json([DU_THAO]);
    if (u.includes("/files/van-ban/den") && init?.method === "POST") return json({ ...DEN, so: 4 }, 201);
    if (u.endsWith("/files/van-ban/di") && init?.method === "POST") return json(DU_THAO, 201);
    if (u.includes("/ky") && init?.method === "POST") return json({ ...DU_THAO, trang_thai: "da_ky", so: 7, ky_hieu: "7/TB-UBND", link: "/files/s3/x" });
    if (u.endsWith("/files/xac-minh")) return json({ hopLe: true, coChuKy: true, nguoiKy: "UBND xã Mẫu", sha256: "a", phatHanh: { loai: "van_ban_di", kyHieu: "7/TB-UBND", kyLuc: "x" } });
    if (u.includes("/workflow/tasks")) return json([]);
    if (u.includes("/api/can_bo")) return json([]);
    return json({ loi: "không có" }, 404);
  });
  vi.stubGlobal("fetch", goi);
});
afterEach(() => vi.unstubAllGlobals());
const goiTheo = (doan: string) => goi.mock.calls.filter(([u]) => String(u).includes(doan));

describe("sổ văn bản (#78)", () => {
  it("vai văn thư vào được cổng cán bộ, trang đầu là sổ văn bản, không có hộp việc", async () => {
    expect(vaiTroCanBo(["van_thu"])).toBe("van_thu");
    expect(vaiTroCanBo(["van_thu", "lanh_dao"])).toBe("lanh_dao");
    ve("/can-bo", ["van_thu"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Sổ văn bản" })).toBeInTheDocument();
    expect(screen.queryByText("Xử lý hồ sơ")).toBeNull();
    expect(goiTheo("/workflow/tasks")).toHaveLength(0);
    expect(goiTheo("/api/can_bo")).toHaveLength(0);
  });

  it("văn thư vào sổ văn bản đến: gửi tệp kèm thông tin trên query, báo số đến", async () => {
    const u = userEvent.setup();
    ve("/can-bo/van-ban", ["van_thu"]);
    const bang = await screen.findByRole("table");
    expect(within(bang).getByText("3/2026")).toBeInTheDocument();
    expect(within(bang).getByText("Chữ ký số hợp lệ")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Số, ký hiệu"), "20/UBND-TP");
    await u.type(screen.getByLabelText("Ngày văn bản"), "2026-10-22");
    await u.type(screen.getByLabelText("Nơi gửi"), "UBND huyện Mẫu");
    await u.type(screen.getByLabelText("Trích yếu"), "Về việc kiểm tra");
    await u.upload(screen.getByLabelText("Tệp văn bản"), new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" }));
    await u.click(screen.getByRole("button", { name: "Vào sổ" }));
    expect(await screen.findByText("Đã vào sổ văn bản đến, số đến 4/2026.")).toBeInTheDocument();
    const [url, init] = goiTheo("/files/van-ban/den")[0];
    const q = new URL(String(url)).searchParams;
    expect([q.get("ten"), q.get("ky_hieu"), q.get("noi_gui"), q.get("loai")]).toEqual(["cv.pdf", "20/UBND-TP", "UBND huyện Mẫu", "Công văn"]);
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/pdf");
  });

  it("lãnh đạo ký ban hành dự thảo; văn thư và cán bộ không có nút ký", async () => {
    const u = userEvent.setup();
    ve("/can-bo/van-ban?chieu=di", ["lanh_dao"]);
    await u.click(await screen.findByRole("button", { name: /Ký ban hành Về lịch tiếp công dân/ }));
    expect(await screen.findByText("Đã ký ban hành văn bản 7/TB-UBND.")).toBeInTheDocument();
    expect(goiTheo(`/files/van-ban/${DU_THAO.id}/ky`)[0][1]?.method).toBe("POST");
  });

  it("cán bộ chỉ xem sổ: không form vào sổ, không nút ký", async () => {
    ve("/can-bo/van-ban?chieu=di", ["can_bo"]);
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /Ký ban hành/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Soạn văn bản đi" })).toBeNull();
  });

  it("xác minh chữ ký một PDF: hiện hợp lệ và văn bản đã phát hành", async () => {
    const u = userEvent.setup();
    ve("/can-bo/van-ban", ["can_bo"]);
    await u.upload(await screen.findByLabelText("Tệp PDF cần xác minh"), new File(["%PDF"], "tb.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Chữ ký số hợp lệ", { selector: "[data-slot=alert-title]" })).toBeInTheDocument();
    expect(await screen.findByText(/Đúng văn bản đã phát hành: 7\/TB-UBND/)).toBeInTheDocument();
  });
});
