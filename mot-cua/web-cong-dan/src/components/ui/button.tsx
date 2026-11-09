// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Lấy bằng shadcn CLI 4.22.1 từ shadcn/ui, kiểu new-york-v4 (Copyright (c) 2023 shadcn, MIT,
// https://ui.shadcn.com/docs/components/button). Đội chỉnh cho cổng công dân: chữ ≥ 16px, vùng bấm ≥ 44px,
// vòng focus đủ đậm (theme ở src/index.css); nút bo tròn hẳn, chữ đậm (#141).
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-base font-bold whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:translate-y-px",
        sang: "bg-white text-primary-soft-foreground shadow-xs hover:bg-primary-soft",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-slate-300 bg-white text-slate-800 shadow-2xs hover:border-primary/50 hover:bg-primary-soft/60 hover:text-primary-soft-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-accent/50",
        link: "h-auto px-0 text-link underline underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4",
        xs: "h-10 gap-1 rounded-lg px-3 text-sm has-[>svg]:px-2.5",
        sm: "h-10 gap-1.5 rounded-lg px-3.5 text-sm has-[>svg]:px-3",
        lg: "h-13 rounded-xl px-6 text-lg has-[>svg]:px-5",
        icon: "size-11 rounded-xl",
        "icon-xs": "size-10 rounded-lg",
        "icon-sm": "size-10 rounded-lg",
        "icon-lg": "size-13 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
