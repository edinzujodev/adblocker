import { toast } from "sonner"

import type { Query } from "@easioprotect/api"
import { Badge } from "@/components/ui/badge"
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recently blocked</CardTitle>
          <CardDescription>Updates every few seconds. Tap Allow if something you need was blocked.</CardDescription>
        </CardHeader>
        <CardContent>
          {!recent ? (
            <ListSkeleton />
          ) : recent.length === 0 ? (
            <Empty>Nothing blocked yet. Browse a site with ads and check back.</Empty>
          ) : (
            <ul className="divide-y">
              {groupByDomain(recent).map((q) => (
                <li key={q.domain} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium break-all">{q.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(q.time)} · {q.client}
                      {q.count > 1 && ` · ${q.count}×`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => allow(q.domain)}>
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
          <CardTitle>Most blocked</CardTitle>
          <CardDescription>Since EasioProtect started.</CardDescription>
        </CardHeader>
        <CardContent>
          {!top ? (
            <ListSkeleton />
          ) : top.length === 0 ? (
            <Empty>Nothing blocked yet.</Empty>
          ) : (
            <ul className="divide-y">
              {top.map((d) => (
                <li key={d.domain} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-medium break-all">{d.domain}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {formatNumber(d.count)}
                  </Badge>
                </li>
              ))}
            </ul>
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
