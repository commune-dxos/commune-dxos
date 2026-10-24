// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bảng các bước người dân thấy khi tra cứu (#54): dựng từ trạng thái + mốc chuyển trạng thái.
import { describe, expect, it } from "vitest";
import { cacBuoc, dongLichSu, LOI_NHAN } from "./tien-do";
import { TEN_TRANG_THAI } from "./trang-thai";

const NOP = "2026-10-20T02:00:00Z";
const moc = (...ds: [string, string][]) => ds.map(([trang_thai, luc]) => ({ trang_thai, luc }));
const trang = (b: ReturnType<typeof cacBuoc>) => b.map((x) => x.trang).join(",");

describe("cacBuoc", () => {
  it("mới nộp: nộp xong, tiếp nhận đang làm, còn lại chưa tới", () => {
    const b = cacBuoc("moi", moc(["moi", NOP]), NOP);
    expect(trang(b)).toBe("xong,dang,cho,cho,cho");
    expect(b[0].luc).toBe(NOP);
  });

  it("chờ bổ sung: dừng ở bước tiếp nhận, đánh dấu cần bổ sung", () => {
    const b = cacBuoc("cho_bo_sung", moc(["moi", NOP], ["cho_bo_sung", "2026-10-20T03:00:00Z"]), NOP);
    expect(trang(b)).toBe("xong,can_bo_sung,cho,cho,cho");
  });

  it("đang thẩm định: tiếp nhận xong lúc chuyển sang đang xử lý", () => {
    const b = cacBuoc("dang_xu_ly", moc(["moi", NOP], ["dang_xu_ly", "2026-10-20T04:00:00Z"]), NOP);
    expect(trang(b)).toBe("xong,xong,dang,cho,cho");
    expect(b[1].luc).toBe("2026-10-20T04:00:00Z");
  });

  it("bổ sung rồi nộp lại vẫn tính đúng mốc tiếp nhận xong (lần qua đầu tiên)", () => {
    const b = cacBuoc(
      "cho_phe_duyet",
      moc(["moi", NOP], ["cho_bo_sung", "2026-10-20T03:00:00Z"], ["dang_xu_ly", "2026-10-20T05:00:00Z"], ["cho_phe_duyet", "2026-10-20T06:00:00Z"]),
      NOP,
    );
    expect(trang(b)).toBe("xong,xong,xong,dang,cho");
    expect(b[1].luc).toBe("2026-10-20T05:00:00Z");
    expect(b[2].luc).toBe("2026-10-20T06:00:00Z");
  });

  it("hoàn tất: mọi bước xong; thủ tục không có bước phê duyệt riêng (CT01) cũng xong cùng lúc", () => {
    const b = cacBuoc("hoan_tat", moc(["moi", NOP], ["dang_xu_ly", "2026-10-20T04:00:00Z"], ["hoan_tat", "2026-10-20T08:00:00Z"]), NOP);
    expect(trang(b)).toBe("xong,xong,xong,xong,xong");
    expect(b[3].luc).toBe("2026-10-20T08:00:00Z");
    expect(b[4].luc).toBe("2026-10-20T08:00:00Z");
  });

  it("từ chối khi thẩm định: dừng ở thẩm định, các bước sau không thực hiện", () => {
    const b = cacBuoc("tu_choi", moc(["moi", NOP], ["dang_xu_ly", "2026-10-20T04:00:00Z"], ["tu_choi", "2026-10-20T07:00:00Z"]), NOP);
    expect(trang(b)).toBe("xong,xong,tu_choi,bo_qua,bo_qua");
  });

  it("chưa có mốc nào (dữ liệu cũ): lấy ngày nộp", () => {
    expect(cacBuoc("moi", [], NOP)[0].luc).toBe(NOP);
  });
});

describe("bảng trạng thái", () => {
  it("mọi trạng thái của CSDL có tên tiếng Việt và lời nhắn việc tiếp theo", () => {
    for (const t of ["moi", "dang_xu_ly", "cho_bo_sung", "cho_phe_duyet", "hoan_tat", "tu_choi"]) {
      expect(TEN_TRANG_THAI[t]).toBeTruthy();
      expect(LOI_NHAN[t]).toBeTruthy();
    }
  });

  it("dòng lịch sử kèm lý do khi có", () => {
    expect(dongLichSu({ trang_thai: "cho_bo_sung", ly_do: "Thiếu giấy chứng sinh" })).toBe(
      "Chờ công dân bổ sung: Thiếu giấy chứng sinh",
    );
    expect(dongLichSu({ trang_thai: "hoan_tat" })).toBe("Hoàn tất");
  });
});
