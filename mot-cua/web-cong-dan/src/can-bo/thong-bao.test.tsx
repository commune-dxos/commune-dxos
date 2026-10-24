// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Thông báo sắp trễ hạn trong cổng cán bộ (#56): tách khung SSE, luồng /workflow/thong-bao/luong (sự kiện
// đổi thì tải lại danh sách, het-han thì đóng, 403/404 không thử lại), chuông có số thông báo mới, hộp
// thông báo đánh dấu đã đọc qua PATCH /api/thong_bao, kênh giả lập ghi rõ. API giả bằng fetch.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User, UserManager } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CauHinh } from "@/lib/cau-hinh";
import CongCanBo from "./cong-can-bo";
import type { ThongBao } from "./lib/api";
import { LoiLuongKhongThuLai, moLuong, tachKhung } from "./lib/luong-thong-bao";
import { jwtGia } from "./test/gia";

const CH = { gatewayUrl: "http://gw" } as CauHinh;

/** Response có body là luồng các đoạn chữ (như fetch thật đọc SSE). */
function luong(...doan: string[]) {
  const ma = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const d of doan) c.enqueue(ma.encode(d));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("tachKhung", () => {
  it("tách sự kiện, bỏ chú thích nhịp, giữ phần dở chờ đoạn sau", () => {
    const { khung, con } = tachKhung('event: thong-bao\ndata: {"chuaDoc":1}\n\n: nhip\n\nevent: thong-bao\r\ndata: {"chua');
    expect(khung).toEqual([{ suKien: "thong-bao", duLieu: '{"chuaDoc":1}' }]);
    expect(con).toBe('event: thong-bao\ndata: {"chua');
  });
});

describe("moLuong", () => {
  it("gửi token ở header, báo mỗi sự kiện thong-bao (cả khi khung bị cắt đôi), dừng ở het-han", async () => {
    const goi = vi.fn<typeof fetch>(() =>
      Promise.resolve(luong('event: thong-bao\ndata: {"chuaDoc":0,"moiNhat":null}\n\nevent: thong', '-bao\ndata: {"chuaDoc":1,"moiNhat":"t1"}\n\n',
        ": nhip\n\nevent: het-han\ndata: {}\n\nevent: thong-bao\ndata: {\"chuaDoc\":9}\n\n")),
    );
    const doi = vi.fn();
    await moLuong(CH, "tk", doi, new AbortController().signal, goi);
    expect(goi.mock.calls[0][0]).toBe("http://gw/workflow/thong-bao/luong");
    expect(new Headers(goi.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer tk");
    expect(doi.mock.calls.map((c) => c[0])).toEqual([{ chuaDoc: 0, moiNhat: null }, { chuaDoc: 1, moiNhat: "t1" }]);
  });

  it("403/404 → không thử lại; lỗi khác → thử lại sau", async () => {
    const sig = new AbortController().signal;
    await expect(moLuong(CH, "tk", vi.fn(), sig, () => Promise.resolve(new Response("", { status: 404 })))).rejects.toBeInstanceOf(
      LoiLuongKhongThuLai,
    );
    await expect(moLuong(CH, "tk", vi.fn(), sig, () => Promise.resolve(new Response("", { status: 502 })))).rejects.not.toBeInstanceOf(
      LoiLuongKhongThuLai,
    );
  });
});

// --- Cổng cán bộ ------------------------------------------------------------------------------
function quanLyGia(nguoiDung: Partial<User>) {
  const suKien = { addUserLoaded: vi.fn(), addUserUnloaded: vi.fn(), addUserSignedOut: vi.fn(), removeUserLoaded: vi.fn(), removeUserUnloaded: vi.fn(), removeUserSignedOut: vi.fn() };
  return { getUser: () => Promise.resolve(nguoiDung), events: suKien, signinRedirect: vi.fn(), signoutRedirect: vi.fn() } as unknown as UserManager;
}
const SUB = "00000000-0000-0000-0000-00000000b001";
const CAN_BO: Partial<User> = {
  profile: { sub: SUB, preferred_username: "canbo01", name: "Trần Thị Một Cửa" } as User["profile"],
  access_token: jwtGia({ sub: SUB, resource_access: { dxos_api: { roles: ["can_bo"] } } }),
  expired: false,
};
const HS = "11111111-1111-4111-8111-111111111111";
const TB = (id: string, da_doc_luc: string | null, kenh = true): ThongBao => ({
  id, ho_so_id: HS, loai: "sap_tre_han", moc: "2026-10-27", tieu_de: `Hồ sơ HS20261024-00005${id.at(-1)} sắp trễ hạn`,
  noi_dung: "Đăng ký khai sinh · hạn 17:00 27/10/2026 · còn 1 ngày làm việc", tao_luc: "2026-10-24T01:00:00Z", da_doc_luc,
  thong_bao_kenh: kenh ? [{ kenh: "email", trang_thai: "gia_lap" }, { kenh: "sms", trang_thai: "gia_lap" }] : [],
});

let goi: ReturnType<typeof vi.fn<typeof fetch>>;
let ds: ThongBao[];
let guiLuong: (s: string) => void;

beforeEach(() => {
  ds = [TB("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", null), TB("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "2026-10-24T02:00:00Z", false)];
  goi = vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (u.endsWith("/workflow/tasks")) return json([]);
    if (u.includes("/api/can_bo")) return json([{ ho_ten: "Trần Thị Một Cửa", chuc_vu: "Công chức", linh_vuc: [] }]);
    if (u.includes("/api/thong_bao") && init?.method === "PATCH") {
      ds = ds.map((t) => (u.includes(t.id) ? { ...t, da_doc_luc: "2026-10-24T03:00:00Z" } : t));
      return new Response(null, { status: 204 });
    }
    if (u.includes("/api/thong_bao")) return json(ds);
    if (u.endsWith("/workflow/thong-bao/luong")) {
      const ma = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(c) {
            guiLuong = (s) => c.enqueue(ma.encode(s));
          },
        }),
        { status: 200 },
      );
    }
    return json({ loi: "không có" }, 404);
  });
  vi.stubGlobal("fetch", goi);
});
afterEach(() => vi.unstubAllGlobals());

function ve(duong: string) {
  return render(
    <MemoryRouter initialEntries={[duong]}>
      <Routes>
        <Route path="can-bo/*" element={<CongCanBo quanLy={quanLyGia(CAN_BO)} />} />
      </Routes>
    </MemoryRouter>,
  );
}
const soLanTai = () => goi.mock.calls.filter(([u, i]) => String(u).includes("/api/thong_bao") && !i?.method?.match(/PATCH/)).length;

describe("thông báo trong cổng cán bộ", () => {
  it("chuông có số thông báo mới; luồng báo đổi thì tải lại danh sách ngay", async () => {
    ve("/can-bo");
    expect(await screen.findByRole("button", { name: "Thông báo: 1 thông báo mới" })).toBeInTheDocument();
    await waitFor(() => expect(goi.mock.calls.some(([u]) => String(u).endsWith("/workflow/thong-bao/luong"))).toBe(true));
    const truoc = soLanTai();
    ds = [TB("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", null), ...ds];
    guiLuong('event: thong-bao\ndata: {"chuaDoc":2,"moiNhat":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"}\n\n');
    expect(await screen.findByRole("button", { name: "Thông báo: 2 thông báo mới" })).toBeInTheDocument();
    expect(soLanTai()).toBeGreaterThan(truoc);
  });

  it("hộp thông báo: chưa đọc có nhãn Mới, kênh ghi giả lập; đánh dấu đã đọc gửi PATCH chỉ thông báo chưa đọc", async () => {
    ve("/can-bo/thong-bao");
    const danh = await screen.findByRole("list", { name: "Danh sách thông báo" });
    const muc = within(danh).getAllByRole("listitem");
    expect(muc[0]).toHaveAttribute("data-da-doc", "chua");
    expect(within(muc[0]).getByText("Mới")).toBeInTheDocument();
    expect(within(muc[0]).getByText(/Email \(giả lập, không gửi thật\)/)).toBeInTheDocument();
    expect(muc[1]).toHaveAttribute("data-da-doc", "co");
    await userEvent.click(within(muc[0]).getByRole("button", { name: "Đánh dấu đã đọc" }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Danh sách thông báo" })).getAllByRole("listitem")[0]).toHaveAttribute("data-da-doc", "co"));
    const patch = goi.mock.calls.find(([, i]) => i?.method === "PATCH");
    expect(String(patch?.[0])).toMatch(
      /\/api\/thong_bao\?id=in\.\(aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1\)&da_doc_luc=is\.null$/,
    );
    expect(screen.getByRole("button", { name: /Thông báo: không có/ })).toBeInTheDocument();
  });

  it("thanh bên có mục Thông báo kèm số chưa đọc", async () => {
    ve("/can-bo");
    const muc = await screen.findByRole("link", { name: "Thông báo" });
    expect(muc).toHaveAttribute("href", "/can-bo/thong-bao");
    await waitFor(() => expect(screen.getByText("thông báo chưa đọc")).toBeInTheDocument());
  });
});
