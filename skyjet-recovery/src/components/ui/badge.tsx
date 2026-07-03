import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-700",
        info: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
        success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
        danger: "bg-red-50 text-red-700 ring-1 ring-red-100",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
