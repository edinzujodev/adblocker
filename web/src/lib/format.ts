export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function percent(part: number, total: number): string {
  return total ? `${((100 * part) / total).toFixed(1)}%` : "0%"
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleString()
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong"
}
