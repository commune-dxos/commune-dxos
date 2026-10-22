// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Theo mẫu Input của shadcn/ui (MIT, https://ui.shadcn.com); viền đậm để người lớn tuổi dễ thấy ô nhập.
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-md border-2 border-input bg-background px-4 py-2 text-lg placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
