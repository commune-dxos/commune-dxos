// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Dữ liệu giả của chế độ VITE_DU_LIEU_GIA phải khớp các gói thu-tuc/*/thu-tuc.yaml (cái mà bộ
// nạp nap-thu-tuc ghi vào danh mục), để ảnh chụp và test không lệch với lõi thật.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ThuTuc } from "@/lib/api";
import duLieu from "./thu-tuc.json";

const THU_MUC_GOI = join(__dirname, "../../../../thu-tuc");

/** Đọc khóa cấp 1 dạng `khoa: giá trị` (đủ cho các trường cần so). */
function docYaml(van: string) {
  const kq: Record<string, string> = {};
  for (const dong of van.split("\n")) {
    const m = /^([a-z_]+):\s*(.+)$/.exec(dong);
    if (m) kq[m[1]] = m[2].trim();
  }
  return kq;
}

const cacGoi = readdirSync(THU_MUC_GOI, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(THU_MUC_GOI, d.name, "thu-tuc.yaml")))
  .map((d) => ({
    yaml: docYaml(readFileSync(join(THU_MUC_GOI, d.name, "thu-tuc.yaml"), "utf8")),
    schema: JSON.parse(readFileSync(join(THU_MUC_GOI, d.name, "thanh-phan-ho-so.schema.json"), "utf8")),
  }))
  .filter((g) => g.yaml.cong_khai === "true");
const goi = cacGoi.map((g) => g.yaml);

describe("dữ liệu giả", () => {
  it("có đúng các thủ tục công khai của thu-tuc/*/", () => {
    expect((duLieu as ThuTuc[]).map((t) => t.ma).sort()).toEqual(goi.map((y) => y.ma).sort());
  });

  it.each(goi.map((y) => [y.ma, y] as const))("%s khớp thu-tuc.yaml", (ma, y) => {
    const t = (duLieu as ThuTuc[]).find((x) => x.ma === ma)!;
    expect(t).toMatchObject({
      ten: y.ten,
      so_ngay_xu_ly: Number(y.thoi_han_ngay_lam_viec),
      le_phi: Number(y.le_phi),
      ghi_chu_le_phi: y.ghi_chu_le_phi ?? null,
      quy_trinh: y.quy_trinh,
      linh_vuc: { ma: y.linh_vuc, ten: y.ten_linh_vuc },
    });
  });

  it.each(cacGoi.map((g) => [g.yaml.ma, g.schema] as const))("%s có json_schema giống thanh-phan-ho-so.schema.json", (ma, schema) => {
    expect((duLieu as ThuTuc[]).find((x) => x.ma === ma)!.json_schema).toEqual(schema);
  });
});
