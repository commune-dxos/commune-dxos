// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bước 1: người nộp hồ sơ (họ tên, số điện thoại: các cột công dân được nhập vào mot_cua.ho_so).
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Loi, NguoiNop } from "./kieu";

export function BuocNguoiNop({
  giaTri,
  doi,
  loi,
}: {
  giaTri: NguoiNop;
  doi: (g: NguoiNop) => void;
  loi: Loi;
}) {
  const loiCua = (id: string) => loi.find((l) => l.id === id)?.thongDiep;
  const o = (id: string) => ({
    id,
    "aria-required": true,
    "aria-invalid": loiCua(id) ? true : undefined,
    "aria-describedby": [`${id}-goi-y`, loiCua(id) && `${id}-loi`].filter(Boolean).join(" "),
  });
  return (
    <FieldGroup className="max-w-xl gap-8 [&_[data-invalid=true]]:border-l-4 [&_[data-invalid=true]]:border-warning [&_[data-invalid=true]]:pl-4">
      <Field data-invalid={!!loiCua("ho-ten")}>
        <FieldLabel htmlFor="ho-ten">Họ và tên</FieldLabel>
        <FieldDescription id="ho-ten-goi-y">Ghi đúng như trên giấy tờ tùy thân.</FieldDescription>
        {loiCua("ho-ten") && <FieldError role={undefined} id="ho-ten-loi">{loiCua("ho-ten")}</FieldError>}
        <Input
          {...o("ho-ten")}
          autoComplete="name"
          value={giaTri.hoTen}
          onChange={(e) => doi({ ...giaTri, hoTen: e.target.value })}
        />
      </Field>
      <Field data-invalid={!!loiCua("so-dien-thoai")}>
        <FieldLabel htmlFor="so-dien-thoai">Số điện thoại</FieldLabel>
        <FieldDescription id="so-dien-thoai-goi-y">Cán bộ gọi số này khi cần bổ sung hồ sơ.</FieldDescription>
        {loiCua("so-dien-thoai") && <FieldError role={undefined} id="so-dien-thoai-loi">{loiCua("so-dien-thoai")}</FieldError>}
        <Input
          {...o("so-dien-thoai")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="max-w-64"
          value={giaTri.soDienThoai}
          onChange={(e) => doi({ ...giaTri, soDienThoai: e.target.value })}
        />
      </Field>
    </FieldGroup>
  );
}
