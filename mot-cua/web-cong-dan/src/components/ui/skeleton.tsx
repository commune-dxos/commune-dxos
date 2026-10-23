// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Lấy bằng shadcn CLI 4.22.1 từ shadcn/ui, kiểu new-york-v4 (Copyright (c) 2023 shadcn, MIT,
// https://ui.shadcn.com/docs/components/skeleton). Đội chỉnh cho cổng công dân: chữ ≥ 16px, vùng bấm ≥ 44px,
// vòng focus đủ đậm (theme ở src/index.css).
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
