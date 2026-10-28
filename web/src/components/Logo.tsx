import { cn } from "cn"

/** JoK logo: a shield with a "no entry" bar. "Jok" means "no". */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-7", className)}>
      <path d="M32 4 8 13v17c0 15 10.2 26.6 24 30 13.8-3.4 24-15 24-30V13L32 4Z" className="fill-primary" />
      <rect x="17" y="27.5" width="30" height="9" rx="4.5" className="fill-primary-foreground" />
    </svg>
  )
}
