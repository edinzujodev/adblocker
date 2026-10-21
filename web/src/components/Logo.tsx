import { cn } from "cn"

/** EasioProtect shield. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-7", className)}>
      <path d="M32 4 8 13v17c0 15 10.2 26.6 24 30 13.8-3.4 24-15 24-30V13L32 4Z" className="fill-primary" />
      <path
        d="m21 21 22 22M43 21 21 43"
        className="stroke-primary-foreground"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
