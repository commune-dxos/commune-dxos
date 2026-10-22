// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Theo mẫu Button của shadcn/ui (MIT, https://ui.shadcn.com), chỉnh cho cổng công dân: nút cao
// ≥ 44px, chữ đậm. `nutVariants` dùng chung cho thẻ <a>/<Link> để link trông như nút.
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const nutVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2 text-base font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border-2 border-primary bg-background text-primary hover:bg-tang2",
        ghost: "text-primary underline-offset-4 hover:bg-tang2 hover:underline",
      },
      size: {
        default: "",
        lg: "min-h-12 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof nutVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(nutVariants({ variant, size }), className)} {...props} />;
}
