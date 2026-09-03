"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      offset={{
        top: 'calc(4.5rem + env(safe-area-inset-top))',
      }}
      mobileOffset={{
        top: 'calc(4.5rem + env(safe-area-inset-top))',
      }}
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-[var(--success-500)]" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-[var(--warning-500)]" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-[var(--danger-500)]" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--dock)",
          "--normal-text": "#ffffff",
          "--normal-border": "transparent",
          "--border-radius": "18px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
