// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Form xử lý bước hiện tại, sinh từ biến được phép của bước (formProperty trong BPMN của gói, lib/
// form-buoc.ts): có/không → hai lựa chọn, số → ô số, chữ → ô nhiều dòng. Kiểm trước khi gửi (thiếu thì
// không gọi API); POST /workflow/tasks/{id}/complete; lỗi quyền (403), sai biến (400), người khác
// vừa nhận (409) hiện nguyên câu của mot-cua-api.
import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ApiCanBo, KetQuaHoanThanh, Task } from "../lib/api";
import { giaTriBanDau, kiemForm, taoBien, tomTat, type TruongForm } from "../lib/form-buoc";

export function FormXuLy({
  task,
  truong,
  api,
  khiXong,
}: {
  task: Task;
  truong: TruongForm[];
  api: ApiCanBo;
  khiXong: (kq: KetQuaHoanThanh, tomTatKetQua: string) => void;
}) {
  const id = useId();
  const [gt, datGt] = useState(() => giaTriBanDau(truong));
  const [loi, datLoi] = useState<Record<string, string>>({});
  const [loiGui, datLoiGui] = useState<string | null>(null);
  const [dangGui, datDangGui] = useState(false);

  const dat = (ma: string, v: string) => {
    datGt((cu) => ({ ...cu, [ma]: v }));
    if (loi[ma]) datLoi(({ [ma]: _bo, ...con }) => con);
  };

  async function gui(e: FormEvent) {
    e.preventDefault();
    const loiMoi = kiemForm(truong, gt);
    datLoi(loiMoi);
    datLoiGui(null);
    if (Object.keys(loiMoi).length > 0) {
      const dau = `${id}-${Object.keys(loiMoi)[0]}`;
      (document.getElementById(`${dau}-co`) ?? document.getElementById(dau))?.focus();
      return;
    }
    const bien = taoBien(truong, gt);
    datDangGui(true);
    try {
      const kq = await api.hoanThanh(task.id, bien);
      khiXong(kq, tomTat(truong, bien));
    } catch (err) {
      datLoiGui(err instanceof Error ? err.message : "Không hoàn thành được bước.");
    } finally {
      datDangGui(false);
    }
  }

  return (
    <form onSubmit={gui} noValidate aria-describedby={loiGui ? `${id}-loi-gui` : undefined} className="flex flex-col gap-6">
      {loiGui && (
        <Alert variant="destructive" role="alert" id={`${id}-loi-gui`} className="border-warning">
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="font-semibold">Chưa hoàn thành được bước</AlertTitle>
          <AlertDescription>{loiGui}</AlertDescription>
        </Alert>
      )}
      <FieldGroup className="gap-6 [&_[data-invalid=true]]:border-l-4 [&_[data-invalid=true]]:border-warning [&_[data-invalid=true]]:pl-3">
        {truong.length === 0 && <p className="text-muted-foreground">Bước này không cần nhập thông tin.</p>}
        {truong.map((t) => {
          const ma = `${id}-${t.ma}`;
          const loiT = loi[t.ma];
          if (t.kieu === "boolean") {
            return (
              <FieldSet key={t.ma} data-invalid={!!loiT}>
                <FieldLegend className="text-base font-semibold">
                  {t.nhan}
                  {!t.batBuoc && <span className="font-normal text-muted-foreground"> (không bắt buộc)</span>}
                </FieldLegend>
                {loiT && <FieldError role={undefined}>{loiT}</FieldError>}
                <RadioGroup
                  id={ma}
                  value={gt[t.ma]}
                  onValueChange={(v) => dat(t.ma, v)}
                  aria-invalid={!!loiT}
                  className="grid-cols-2"
                >
                  {(["co", "khong"] as const).map((v) => (
                    <Label
                      key={v}
                      htmlFor={`${ma}-${v}`}
                      className="flex h-12 cursor-pointer items-center gap-3 rounded-md border-2 border-input px-4 text-base font-semibold has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft"
                    >
                      <RadioGroupItem value={v} id={`${ma}-${v}`} />
                      {v === "co" ? "Có" : "Không"}
                    </Label>
                  ))}
                </RadioGroup>
              </FieldSet>
            );
          }
          return (
            <Field key={t.ma} data-invalid={!!loiT}>
              <FieldLabel htmlFor={ma} className="text-base font-semibold">
                {t.nhan}
                {!t.batBuoc && <span className="font-normal text-muted-foreground"> (không bắt buộc)</span>}
              </FieldLabel>
              {t.kieu === "long" && <FieldDescription>Số nguyên, ví dụ 2.</FieldDescription>}
              {loiT && <FieldError role={undefined} id={`${ma}-loi`}>{loiT}</FieldError>}
              {t.kieu === "long" ? (
                <Input
                  id={ma}
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-12 w-32 text-base"
                  value={gt[t.ma]}
                  onChange={(e) => dat(t.ma, e.target.value)}
                  aria-invalid={!!loiT}
                  aria-describedby={loiT ? `${ma}-loi` : undefined}
                />
              ) : (
                <Textarea
                  id={ma}
                  rows={3}
                  className="text-base"
                  value={gt[t.ma]}
                  onChange={(e) => dat(t.ma, e.target.value)}
                  aria-invalid={!!loiT}
                  aria-describedby={loiT ? `${ma}-loi` : undefined}
                />
              )}
            </Field>
          );
        })}
      </FieldGroup>
      <Button type="submit" disabled={dangGui} className="w-full sm:w-auto">
        {dangGui ? <CircleCheck aria-hidden="true" className="animate-pulse" /> : <Send aria-hidden="true" />}
        {dangGui ? "Đang gửi…" : "Hoàn thành bước"}
      </Button>
    </form>
  );
}
