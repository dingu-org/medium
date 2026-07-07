import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-[6px] bg-[linear-gradient(90deg,#ebebe6_0%,#f5f5f1_50%,#ebebe6_100%)] bg-[length:360px_100%]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
