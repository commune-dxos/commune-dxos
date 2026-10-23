// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Tóm tắt lỗi đầu form (mẫu "error summary" của GOV.UK, dựng bằng Alert của shadcn/ui): nhận
// focus khi xuất hiện để trình đọc màn hình đọc ngay; mỗi lỗi là liên kết tới ô cần sửa.
import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Loi } from "./kieu";

export function TomTatLoi({ loi, lanKiem }: { loi: Loi; lanKiem: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loi.length) ref.current?.focus();
  }, [loi.length, lanKiem]);
  if (!loi.length) return null;
  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      aria-labelledby="tom-tat-loi"
      className="border-2 border-warning bg-destructive-soft focus-visible:outline-offset-4 [&>svg]:text-warning"
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle id="tom-tat-loi" className="text-foreground">
        Có lỗi, vui lòng kiểm tra lại
      </AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {loi.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                className="font-semibold text-destructive underline underline-offset-4 hover:decoration-2"
                onClick={(e) => {
                  e.preventDefault();
                  const o = document.getElementById(l.id);
                  o?.focus();
                  o?.scrollIntoView({ block: "center" });
                }}
              >
                {l.thongDiep}
              </a>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
