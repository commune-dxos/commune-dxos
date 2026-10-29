// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CongCanBo from "./cong-can-bo";
import { congNgay, duocSuaLich, isoVN, phanVN, thuHai } from "./pages/lich-cong-tac";
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

// Tuần thử: thứ Hai 02/03/2026.
const TUAN = "2026-03-02";
const L_DUYET = {
  id: "11111111-1111-4111-8111-111111111111", tieu_de: "Giao ban đầu tuần", loai: "hop",
  bat_dau: "2026-03-02T00:30:00Z", ket_thuc: "2026-03-02T01:30:00Z", dia_diem: "Phòng họp Ủy ban",
  chu_tri: "Chủ tịch UBND xã", thanh_phan: "Các công chức", ghi_chu: null, trang_thai: "da_duyet", ly_do_huy: null,
  duyet_luc: "2026-02-28T01:00:00Z",
};
const L_DU_KIEN = {
  ...L_DUYET, id: "22222222-2222-4222-8222-222222222222", tieu_de: "Tiếp công dân định kỳ", loai: "tiep_dan",
  bat_dau: "2026-03-03T01:00:00Z", ket_thuc: "2026-03-03T04:00:00Z", dia_diem: "Phòng tiếp công dân",
  trang_thai: "du_kien", duyet_luc: null,
};
const L_HUY = {
  ...L_DUYET, id: "33333333-3333-4333-8333-333333333333", tieu_de: "Họp chuyển đổi số",
  bat_dau: "2026-03-04T07:00:00Z", ket_thuc: "2026-03-04T09:30:00Z", trang_thai: "da_huy",
  ly_do_huy: "Chủ tịch đi họp huyện",
};

let ghiLoi: { status: number; body: unknown } | null = null;
let goi: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  ghiLoi = null;
  goi = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.includes("/api/lich_cong_tac") && (init?.method === "POST" || init?.method === "PATCH")) {
      if (ghiLoi) return json(ghiLoi.body, ghiLoi.status);
      return json({ ...L_DU_KIEN, ...(JSON.parse(String(init.body)) as object) }, init.method === "POST" ? 201 : 200);
    }
    if (u.includes("/api/lich_cong_tac")) return json([L_DUYET, L_DU_KIEN, L_HUY]);
    if (u.includes("/workflow/tasks")) return json([]);
    if (u.includes("/api/can_bo")) return json([]);
    if (u.includes("/api/thong_bao")) return json([]);
    return json({ loi: "không có" }, 404);
  });
  vi.stubGlobal("fetch", goi);
});
afterEach(() => vi.unstubAllGlobals());
const ghiTheo = () =>
  goi.mock.calls.filter(([u, i]) => String(u).includes("/api/lich_cong_tac") && (i?.method === "POST" || i?.method === "PATCH"));

describe("lịch công tác (#117)", () => {
  it("ngày giờ theo giờ Việt Nam: thứ Hai của tuần, cộng ngày, ISO có múi giờ", () => {
    expect(thuHai("2026-03-08")).toBe("2026-03-02"); // Chủ nhật → thứ Hai trước đó
    expect(thuHai("2026-03-02")).toBe("2026-03-02");
    expect(congNgay("2026-02-27", 3)).toBe("2026-03-02");
    expect(isoVN("2026-03-02", "07:30")).toBe("2026-03-02T07:30:00+07:00");
    expect(phanVN("2026-03-01T17:30:00Z")).toEqual({ ngay: "2026-03-02", gio: "00:30" });
  });

  it("quyền sửa: lãnh đạo mọi lịch chưa hủy, văn thư chỉ lịch dự kiến, cán bộ không", () => {
    expect(duocSuaLich("lanh_dao", { trang_thai: "da_duyet" })).toBe(true);
    expect(duocSuaLich("lanh_dao", { trang_thai: "da_huy" })).toBe(false);
    expect(duocSuaLich("van_thu", { trang_thai: "du_kien" })).toBe(true);
    expect(duocSuaLich("van_thu", { trang_thai: "da_duyet" })).toBe(false);
    expect(duocSuaLich("can_bo", { trang_thai: "du_kien" })).toBe(false);
  });

  it("cán bộ thấy lịch theo tuần trên URL, theo ngày, giờ Việt Nam; lịch hủy có lý do; không có nút ghi", async () => {
    ve(`/can-bo/lich?tuan=2026-03-04`, ["can_bo"]);
    expect(await screen.findByRole("heading", { level: 1, name: "Lịch công tác" })).toBeInTheDocument();
    expect(screen.getByText("Tuần từ 02/03/2026 đến 08/03/2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lịch công tác" })).toHaveAttribute("aria-current", "page");
    const thuHaiMuc = await screen.findByRole("region", { name: "Thứ Hai, 02/03" });
    expect(within(thuHaiMuc).getByText("07:30 – 08:30")).toBeInTheDocument();
    expect(within(thuHaiMuc).getByText("Giao ban đầu tuần")).toBeInTheDocument();
    expect(screen.getByText("Lý do hủy: Chủ tịch đi họp huyện")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Chủ nhật, 08/03" })).getByText("Không có lịch.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thêm lịch|Duyệt|Sửa|Hủy lịch/ })).toBeNull();
    const [url] = goi.mock.calls.find(([u]) => String(u).includes("/api/lich_cong_tac"))!;
    const q = new URL(String(url)).searchParams;
    expect(q.get("bat_dau")).toBe(`lt.${isoVN("2026-03-09", "00:00")}`);
    expect(q.get("ket_thuc")).toBe(`gt.${isoVN(TUAN, "00:00")}`);
  });

  it("lãnh đạo duyệt lịch dự kiến: PATCH đúng id, chỉ gửi trạng thái", async () => {
    const u = userEvent.setup();
    ve(`/can-bo/lich?tuan=${TUAN}`, ["lanh_dao"]);
    expect(await screen.findByText(/1 lịch chờ duyệt/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Duyệt" }));
    const [url, init] = ghiTheo()[0];
    expect(init?.method).toBe("PATCH");
    expect(String(url)).toContain(`id=eq.${L_DU_KIEN.id}`);
    expect(JSON.parse(String(init?.body))).toEqual({ trang_thai: "da_duyet" });
    expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer /);
  });

  it("văn thư thêm lịch: giờ Việt Nam gửi kèm múi giờ, không tự duyệt; giờ ngược bị chặn ở web", async () => {
    const u = userEvent.setup();
    ve(`/can-bo/lich?tuan=${TUAN}`, ["van_thu"]);
    await u.click(await screen.findByRole("button", { name: "Thêm lịch" }));
    expect(screen.queryByLabelText(/Duyệt luôn/)).toBeNull();
    await u.type(screen.getByLabelText("Nội dung công việc"), "Họp dân thôn 3");
    await u.type(screen.getByLabelText("Địa điểm (không bắt buộc)"), "Nhà văn hóa thôn 3");
    const gioKt = screen.getByLabelText("Giờ kết thúc");
    await u.clear(gioKt);
    await u.type(gioKt, "07:00");
    await u.click(screen.getByRole("button", { name: "Thêm lịch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Giờ kết thúc phải sau giờ bắt đầu.");
    expect(ghiTheo()).toHaveLength(0);
    await u.clear(gioKt);
    await u.type(gioKt, "10:30");
    await u.click(screen.getByRole("button", { name: "Thêm lịch" }));
    const [, init] = ghiTheo()[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      tieu_de: "Họp dân thôn 3", loai: "hop", bat_dau: isoVN(TUAN, "08:00"), ket_thuc: isoVN(TUAN, "10:30"),
      dia_diem: "Nhà văn hóa thôn 3", chu_tri: null, thanh_phan: null, ghi_chu: null,
    });
  });

  it("trùng địa điểm: hiện câu tiếng Việt của CSDL (400, mã 23P01)", async () => {
    const u = userEvent.setup();
    ghiLoi = { status: 400, body: { code: "23P01", message: "Trùng địa điểm: \"Phòng họp Ủy ban\" đã có lịch từ 07:30 02/03/2026 đến 08:30 02/03/2026" } };
    ve(`/can-bo/lich?tuan=${TUAN}`, ["lanh_dao"]);
    await u.click(await screen.findByRole("button", { name: "Thêm lịch" }));
    expect(screen.getByLabelText(/Duyệt luôn/)).toBeChecked();
    await u.type(screen.getByLabelText("Nội dung công việc"), "Họp trùng phòng");
    await u.click(screen.getByRole("button", { name: "Thêm lịch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^Trùng địa điểm: "Phòng họp Ủy ban"/);
    expect(JSON.parse(String(ghiTheo()[0][1]?.body))).toMatchObject({ trang_thai: "da_duyet" });
  });

  it("hủy lịch phải ghi lý do; văn thư không có nút với lịch đã duyệt", async () => {
    const u = userEvent.setup();
    ve(`/can-bo/lich?tuan=${TUAN}`, ["van_thu"]);
    const muc = (await screen.findByText("Tiếp công dân định kỳ")).closest("li")!;
    expect(within(screen.getByText("Giao ban đầu tuần").closest("li")!).queryByRole("button")).toBeNull();
    await u.click(within(muc).getByRole("button", { name: "Hủy lịch" }));
    await u.type(within(muc).getByLabelText("Lý do hủy"), "Đổi sang tuần sau");
    await u.click(within(muc).getByRole("button", { name: "Xác nhận hủy lịch" }));
    const [url, init] = ghiTheo()[0];
    expect(String(url)).toContain(`id=eq.${L_DU_KIEN.id}`);
    expect(JSON.parse(String(init?.body))).toEqual({ trang_thai: "da_huy", ly_do_huy: "Đổi sang tuần sau" });
  });
});
