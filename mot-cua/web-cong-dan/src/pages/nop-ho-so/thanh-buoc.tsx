// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Thanh bước của form nộp hồ sơ: bước xong có dấu tích, bước đang làm tô chàm (aria-current).
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAC_BUOC } from "./kieu";

export function ThanhBuoc({ hienTai }: { hienTai: number }) {
  return (
    <nav aria-label="Các bước nộp hồ sơ">
      <ol className="grid grid-cols-3 gap-2">
        {CAC_BUOC.map((b, i) => {
          const xong = i < hienTai;
          const dangLam = i === hienTai;
          return (
            <li
              key={b.duong}
              aria-current={dangLam ? "step" : undefined}
              className={cn(
                "flex flex-col gap-2 border-t-4 pt-3 sm:flex-row sm:items-center",
                xong ? "border-primary" : dangLam ? "border-link" : "border-border",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-base font-bold",
                  xong && "bg-primary text-primary-foreground",
                  dangLam && "bg-link text-white",
                  !xong && !dangLam && "border-2 border-input text-muted-foreground",
                )}
              >
                {xong ? <Check className="size-5" /> : i + 1}
              </span>
              <span className={cn("text-base", dangLam ? "font-bold" : "text-muted-foreground")}>
                <span className="sr-only">{`Bước ${i + 1}: `}</span>
                {b.ten}
                {xong && <span className="sr-only"> (đã xong)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
