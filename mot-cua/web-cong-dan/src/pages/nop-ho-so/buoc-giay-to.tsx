// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Bước 2: chọn giấy tờ theo thành phần hồ sơ trong JSON Schema của gói thủ tục. Tệp giữ trong
// trình duyệt tới khi bấm nộp ở bước Kiểm tra lại, rồi mới tải qua /files (lib/ho-so.ts).
import { FileText, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import type { ThanhPhan } from "@/lib/thanh-phan";
import { cn } from "@/lib/utils";
import { dungLuong, NHAN_TEP, type Loi } from "./kieu";

export function BuocGiayTo({
  thanhPhan,
  tep,
  doi,
  loi,
}: {
  thanhPhan: ThanhPhan[];
  tep: Record<string, File[]>;
  doi: (ma: string, ds: File[]) => void;
  loi: Loi;
}) {
  return (
    <FieldGroup className="max-w-2xl gap-6">
      <p className="text-muted-foreground">
        Tải ảnh chụp hoặc bản quét rõ nét, định dạng JPG, PNG hoặc PDF, mỗi tệp tối đa 10 MB. Một giấy tờ nhiều trang thì
        chọn nhiều tệp cùng lúc.
      </p>
      {thanhPhan.map((tp) => {
        const thongDiep = loi.find((l) => l.id === tp.ma)?.thongDiep;
        const ds = tep[tp.ma] ?? [];
        return (
          // Khung thẻ nằm ở div ngoài: legend của fieldset luôn bị trình duyệt vẽ đè lên viền.
          <div
            key={tp.ma}
            className={cn("rounded-md border bg-card p-5 shadow-the", thongDiep && "border-2 border-warning")}
          >
          <FieldSet data-invalid={!!thongDiep} className="gap-3">
            <FieldLegend className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-semibold">
              {tp.ten}
              <Badge variant={tp.batBuoc ? "secondary" : "outline"}>{tp.batBuoc ? "Bắt buộc" : "Nếu có"}</Badge>
            </FieldLegend>
            {tp.moTa && <FieldDescription id={`${tp.ma}-goi-y`}>{tp.moTa}</FieldDescription>}
            {thongDiep && (
              <FieldError role={undefined} id={`${tp.ma}-loi`}>
                {thongDiep}
              </FieldError>
            )}
            {ds.length > 0 && (
              <ul className="flex flex-col divide-y rounded-md border" aria-label={`Tệp đã chọn cho ${tp.ten}`}>
                {ds.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 py-1 pr-1 pl-3">
                    <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground">{dungLuong(f.size)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Bỏ tệp ${f.name}`}
                      onClick={() => doi(tp.ma, ds.filter((_, j) => j !== i))}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Field>
              <label
                className={cn(
                  "flex min-h-12 w-fit cursor-pointer items-center gap-2 rounded-md border-2 border-primary px-4 font-semibold text-primary",
                  "hover:bg-primary-soft has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring",
                )}
              >
                <Upload aria-hidden="true" className="size-5" />
                {ds.length ? "Thêm tệp" : "Chọn tệp"}
                <span className="sr-only">{` cho ${tp.ten}`}</span>
                <input
                  id={tp.ma}
                  name={tp.ma}
                  type="file"
                  multiple
                  accept={NHAN_TEP}
                  className="sr-only"
                  aria-required={tp.batBuoc}
                  aria-invalid={thongDiep ? true : undefined}
                  aria-describedby={[tp.moTa && `${tp.ma}-goi-y`, thongDiep && `${tp.ma}-loi`].filter(Boolean).join(" ") || undefined}
                  onChange={(e) => {
                    const moi = Array.from(e.target.files ?? []);
                    if (moi.length) doi(tp.ma, [...ds, ...moi]);
                    e.target.value = "";
                  }}
                />
              </label>
            </Field>
          </FieldSet>
          </div>
        );
      })}
    </FieldGroup>
  );
}
