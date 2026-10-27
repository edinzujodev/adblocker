import { toast } from "sonner"

import type { Query } from "@jok/api"
import { Button } from "@/components/ui/button"
import { Empty, ListSkeleton } from "@/components/ListStates"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useApi, usePolled } from "@/lib/api-hooks"
import { formatNumber, timeAgo } from "@/lib/format"

export function ActivityTab() {
  const { api, onError } = useApi()
  const { data: recent, reload } = usePolled((api) => api.recentQueries({ blocked: true, limit: 500 }))
  const { data: top } = usePolled((api) => api.topBlocked())

  async function allow(domain: string) {
    try {
      await api.addTo("allowlist", domain)
      toast.success(`${domain} is always allowed`)
      reload()
    } catch (err) {
      onError(err)
    }
  }

  const max = top?.[0]?.count ?? 1

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">Everything JoK stopped in your home. Updates by itself.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Just blocked</CardTitle>
          <CardDescription>Something not working? Find it here and tap Allow.</CardDescription>
        </CardHeader>
        <CardContent>
          {!recent ? (
            <ListSkeleton />
          ) : recent.length === 0 ? (
            <Empty>Nothing blocked yet. Open a site with ads and check back.</Empty>
          ) : (
            <ul className="divide-y">
              {groupByDomain(recent).map((q) => (
                <li key={q.domain} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium break-all">{q.domain}</p>
                    <p className="text-sm text-muted-foreground">
                      {timeAgo(q.time)} · device {q.client}
                      {q.count > 1 && ` · ${q.count} times`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => allow(q.domain)} aria-label={`Allow ${q.domain}`}>
                    Allow
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked most often</CardTitle>
          <CardDescription>Since JoK started.</CardDescription>
        </CardHeader>
        <CardContent>
          {!top ? (
            <ListSkeleton />
          ) : top.length === 0 ? (
            <Empty>Nothing blocked yet.</Empty>
          ) : (
            <ol className="grid gap-3">
              {top.map((d) => (
                <li key={d.domain} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 font-medium break-all">{d.domain}</span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {formatNumber(d.count)}×
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-chart-1" style={{ width: `${(100 * d.count) / max}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/**
 * A page load asks for the same domain several times (A + AAAA, retries), so
 * show each domain once, with its latest time and a count.
 */
function groupByDomain(queries: Query[], max = 50) {
  const seen = new Map<string, Query & { count: number }>()
  for (const q of queries) {
    const item = seen.get(q.domain)
    if (item) item.count++
    else seen.set(q.domain, { ...q, count: 1 })
  }
  return [...seen.values()].slice(0, max)
}
