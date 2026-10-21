import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { cn } from "cn"

import type { CheckResult, Status } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useApi, usePolled } from "@/lib/api-hooks"
import { formatNumber, percent } from "@/lib/format"

export function HomeTab() {
  const { data: status, reload } = usePolled((api) => api.status())
  return (
    <>
      <BlockingCard status={status} onChange={reload} />
      <ThisComputerCard />
      <Stats status={status} />
      <CheckSiteCard blockingOn={status?.enabled} />
    </>
  )
}

function BlockingCard({ status, onChange }: { status?: Status; onChange: () => void }) {
  const { api, onError } = useApi()
  const [busy, setBusy] = useState(false)
  const on = status?.enabled ?? true

  async function toggle(enabled: boolean) {
    setBusy(true)
    try {
      await api.setEnabled(enabled)
      toast.success(enabled ? "Blocking turned on" : "Blocking turned off")
      onChange()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      className={cn(
        "transition-colors",
        status && (on ? "border-primary/40 bg-primary/10" : "border-destructive/40 bg-destructive/10"),
      )}
    >
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xl font-semibold">{on ? "Blocking is on" : "Blocking is off"}</p>
          <p className="text-sm text-muted-foreground">
            {on ? "Ads and trackers are being blocked." : "Everything is allowed through."}
          </p>
        </div>
        <Switch
          checked={on}
          onCheckedChange={toggle}
          disabled={!status || busy}
          aria-label="Blocking on or off"
          className="scale-150"
        />
      </CardContent>
    </Card>
  )
}

/** Points the DNS of the computer running EasioProtect at it (Windows only). */
function ThisComputerCard() {
  const { api, onError } = useApi()
  // Reading the network settings starts PowerShell on the server: no polling.
  const { data: pc, reload } = usePolled((api) => api.thisComputer(), 0)
  const [busy, setBusy] = useState(false)

  if (!pc?.supported) return null

  const adapters = pc.adapters ?? []
  const servers = adapters.flatMap((a) => a.servers ?? [])
  const backup = servers.find((ip) => ip !== servers[0])

  async function toggle(enabled: boolean) {
    setBusy(true)
    try {
      await api.setThisComputer(enabled)
      toast.success(enabled ? "This computer is now protected" : "This computer is back to normal DNS")
    } catch (err) {
      onError(err)
    } finally {
      await reload()
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Protect this computer ({pc.computer})</p>
            <p className="text-sm text-muted-foreground">
              {pc.enabled
                ? `This computer is protected by EasioProtect.${backup ? ` If EasioProtect stops, it uses ${backup} so the internet keeps working.` : ""}`
                : `This computer uses ${servers[0] ?? "automatic DNS"}, not EasioProtect.`}
            </p>
          </div>
          <Switch
            checked={pc.enabled}
            onCheckedChange={toggle}
            disabled={busy || !pc.admin || adapters.length === 0}
            aria-label="Protect this computer"
            className="scale-125"
          />
        </div>
        {pc.message && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{pc.message}</p>}
      </CardContent>
    </Card>
  )
}

function Stats({ status }: { status?: Status }) {
  const items = status
    ? [
        { label: "Queries", value: formatNumber(status.totalQueries) },
        { label: "Blocked", value: formatNumber(status.blockedQueries) },
        { label: "Blocked %", value: percent(status.blockedQueries, status.totalQueries) },
        { label: "On blocklist", value: formatNumber(status.blocklistSize + status.customCount) },
      ]
    : null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(items ?? Array.from({ length: 4 }, () => null)).map((item, i) => (
        <Card key={i} size="sm" className="gap-1">
          <CardContent>
            {item ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </>
            ) : (
              <Skeleton className="h-12" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const reasonText: Record<CheckResult["reason"], string> = {
  custom: "Blocked by your own list",
  blocklist: "Blocked by the ad/tracker blocklist",
  allowlist: "Allowed — it is on your always-allowed list",
  disabled: "Would be blocked, but blocking is switched off",
  "not-listed": "Allowed — not on any blocklist",
}

function CheckSiteCard({ blockingOn }: { blockingOn?: boolean }) {
  const { api, onError } = useApi()
  const [input, setInput] = useState("")
  const [result, setResult] = useState<CheckResult>()

  async function check(domain = result?.domain ?? input) {
    if (!domain.trim()) return
    try {
      setResult(await api.check(domain.trim()))
    } catch (err) {
      onError(err)
    }
  }

  // Re-check when blocking is switched on or off, so the answer stays true.
  const shownDomain = result?.domain
  useEffect(() => {
    if (shownDomain) api.check(shownDomain).then(setResult, onError)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on switch changes
  }, [blockingOn])

  async function act(fn: () => Promise<void>, message: string) {
    try {
      await fn()
      toast.success(message)
      await check(result!.domain)
    } catch (err) {
      onError(err)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    check(input)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test a site</CardTitle>
        <CardDescription>Type a site to see whether it would be blocked.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. instagram.com"
            className="h-10"
            required
          />
          <Button type="submit" size="lg" className="h-10 px-4">
            Test
          </Button>
        </form>

        {result && (
          <div
            className={cn(
              "grid gap-3 rounded-lg p-3",
              result.blocked ? "bg-destructive/10" : "bg-primary/10",
            )}
          >
            <div>
              <p className="font-semibold break-all">
                {result.domain} is {result.blocked ? "blocked" : "allowed"}
              </p>
              <p className="text-sm text-muted-foreground">
                {reasonText[result.reason]}
                {result.rule && result.rule !== result.domain && ` (matches ${result.rule})`}
              </p>
            </div>
            <div>
              {result.reason === "custom" && (
                <Button variant="outline" onClick={() => act(() => api.removeFrom("custom", result.rule!), `Unblocked ${result.rule}`)}>
                  Unblock {result.rule}
                </Button>
              )}
              {(result.reason === "blocklist" || result.reason === "disabled") && (
                <Button variant="outline" onClick={() => act(() => api.addTo("allowlist", result.domain), `${result.domain} is always allowed`)}>
                  Always allow {result.domain}
                </Button>
              )}
              {result.reason === "allowlist" && (
                <Button variant="outline" onClick={() => act(() => api.removeFrom("allowlist", result.rule!), `${result.rule} removed from allowed`)}>
                  Stop allowing {result.rule}
                </Button>
              )}
              {result.reason === "not-listed" && (
                <Button variant="destructive" onClick={() => act(() => api.addTo("custom", result.domain), `Blocked ${result.domain}`)}>
                  Block {result.domain}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
