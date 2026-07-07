import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-[15px] font-bold tracking-[-0.01em] whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 active:not-aria-[haspopup]:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--shadow-glow)] [a]:hover:bg-[#3552e5] hover:bg-[#3552e5]",
        outline:
          "bg-card text-foreground shadow-[var(--shadow-card)] hover:bg-[#f7f7f4] aria-expanded:bg-[#f7f7f4] aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-[#f1f1ee] text-secondary-foreground hover:bg-[var(--neutral-150)] aria-expanded:bg-[#f1f1ee] aria-expanded:text-secondary-foreground",
        tinted:
          "bg-[var(--brand-50)] text-[var(--brand-600)] hover:bg-[#dde4ff] aria-expanded:bg-[#dde4ff]",
        dark: "bg-dock text-white hover:bg-[var(--neutral-800)]",
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        "ghost-danger":
          "text-destructive hover:bg-[var(--danger-50)] aria-expanded:bg-[var(--danger-50)]",
        destructive:
          "bg-destructive text-white shadow-[var(--shadow-card)] hover:bg-[var(--danger-600)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/90 dark:hover:bg-destructive dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-11 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 px-3.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
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
