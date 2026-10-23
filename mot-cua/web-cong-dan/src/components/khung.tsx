// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Khung nội dung dùng chung của các màn: rộng tối đa 6xl, lề 16/24px, khoảng cách trên/dưới.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Khung({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6 md:pt-10 md:pb-20", className)}>{children}</div>;
}
