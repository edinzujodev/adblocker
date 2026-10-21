import type { ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
}

export function ListSkeleton() {
  return (
    <div className="grid gap-3 py-1">
      <Skeleton className="h-9" />
      <Skeleton className="h-9" />
      <Skeleton className="h-9" />
    </div>
  )
}
