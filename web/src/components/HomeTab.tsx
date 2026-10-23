import { useEffect, useState, type FormEvent } from "react"
import {
  ChevronRightIcon,
  GlobeIcon,
  Loader2Icon,
  MonitorIcon,
  PercentIcon,
  SearchIcon,
  ShieldBanIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import type { CheckResult, Status } from "@easioprotect/api"
import type { Tab } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useApi, usePolled } from "@/lib/api-hooks"
import { formatNumber, percent } from "@/lib/format"

interface HomeTabProps {
  status?: Status
  onStatusChange: () => void
  go: (tab: Tab) => void
}

export function HomeTab({ status, onStatusChange, go }: HomeTabProps) {
  return (
    <>
      <ProtectionCard status={status} onChange={onStatusChange} />
      <Stats status={status} />
      <GroupsSummary go={go} />
      <CheckSiteCard blockingOn={status?.enabled} />
      <ThisComputerCard />
    </>
  )
}

/** The one thing most people come here for: is protection on, and a big button to change it. */
function ProtectionCard({ status, onChange }: { status?: Status; onChange: () => void }) {
  const { api, onError } = useApi()
  const [busy, setBusy] = useState(false)

  if (!status) return <Skeleton className="h-72 rounded-2xl" />
  const on = status.enabled
  const Icon = on ? ShieldCheckIcon : ShieldOffIcon

  async function toggle() {
    setBusy(true)
    try {
      await api.setEnabled(!on)
      toast.success(on ? "Protection paused" : "Protection is back on")
      onChange()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="items-center gap-5 py-8 text-center">
      <div
        className={cn(
          "grid size-28 place-items-center rounded-full ring-8 transition-colors duration-300",
          on ? "bg-success/12 text-success ring-success/6" : "bg-destructive/12 text-destructive ring-destructive/6",
        )}
      >
        <Icon className="size-14" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="grid gap-1.5 px-6">
        <h1 className="text-2xl font-bold tracking-tight" aria-live="polite">
          {on ? "You're protected" : "Protection is paused"}
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          {on
            ? "Ads, trackers and the groups you switched on are blocked on every device that uses EasioProtect."
            : "Everything is let through until you turn protection back on."}
        </p>
      </div>
      <Button
        size="lg"
        variant={on ? "outline" : "default"}
        onClick={toggle}
        disabled={busy}
        className="w-full max-w-xs"
      >
        {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        {on ? "Pause protection" : "Turn protection on"}
      </Button>
    </Card>
  )
}

function Stats({ status }: { status?: Status }) {
  const items = status && [
    { label: "Blocked", value: formatNumber(status.blockedQueries), icon: ShieldBanIcon },
    { label: "Requests checked", value: formatNumber(status.totalQueries), icon: GlobeIcon },
    { label: "Share blocked", value: percent(status.blockedQueries, status.totalQueries), icon: PercentIcon },
  ]
  return (
    <section aria-label="Since EasioProtect started" className="grid grid-cols-3 gap-3">
      {(items || [null, null, null]).map((item, i) =>
        item ? (
          <Card key={item.label} size="sm" className="gap-2">
            <CardContent className="grid gap-1">
              <item.icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-xl font-bold tabular-nums sm:text-2xl">{item.value}</p>
              <p className="text-xs leading-tight text-muted-foreground sm:text-sm">{item.label}</p>
            </CardContent>
          </Card>
        ) : (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ),
      )}
    </section>
  )
}

/** What is being blocked beyond ads, with a way to change it. */
function GroupsSummary({ go }: { go: (tab: Tab) => void }) {
  const { data: groups } = usePolled((api) => api.groups(), 0)
  // Blocking through its own switch or a bundle.
  const on = groups?.filter((g) => g.enabled || g.blockedBy) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>What's blocked</CardTitle>
        <CardDescription>
          {!groups
            ? "Loading…"
            : on.length === 0
              ? "Only ads and trackers. Block social media, games and more with one switch."
              : `Ads and trackers, plus ${on.length} ${on.length === 1 ? "group" : "groups"}:`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {on.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {on.map((g) => (
              <li key={g.id}>
                <Badge variant="secondary" className="h-8 px-3 text-sm">
                  {g.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={() => go("groups")} className="justify-between">
          {on.length ? "Change groups" : "Choose what to block"}
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  )
}

const reasonText: Record<CheckResult["reason"], string> = {
  custom: "It's on your own blocked list.",
  group: "It's in a group you switched on.",
  blocklist: "It's a known ad or tracker.",
  allowlist: "It's on your always-allowed list.",
  disabled: "It would be blocked, but protection is paused.",
  "not-listed": "It isn't on any list.",
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

  // Re-check when protection is switched on or off, so the answer stays true.
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

  const reason =
    result &&
    (result.reason === "group" && result.group
      ? `It's in the ${result.group} group${result.bundle ? `, switched on by the ${result.bundle} bundle` : ""}.`
      : reasonText[result.reason])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Is a site blocked?</CardTitle>
        <CardDescription>Check any site, and allow or block it from here.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor="check-site">Site address</Label>
          <div className="flex gap-2">
            <Input
              id="check-site"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="instagram.com"
              required
            />
            <Button type="submit">
              <SearchIcon aria-hidden="true" />
              Check
            </Button>
          </div>
        </form>

        {result && (
          <div
            aria-live="polite"
            className={cn(
              "flex gap-3 rounded-xl border p-4",
              result.blocked ? "border-destructive/25 bg-destructive/8" : "border-success/25 bg-success/8",
            )}
          >
            {result.blocked ? (
              <ShieldBanIcon className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden="true" />
            ) : (
              <ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
            )}
            <div className="grid min-w-0 gap-3">
              <div>
                <p className="font-semibold break-all">
                  {result.domain} is {result.blocked ? "blocked" : "allowed"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {reason}
                  {result.rule && result.rule !== result.domain && ` Matches “${result.rule}”.`}
                </p>
              </div>
              <div>
                {result.reason === "custom" && (
                  <Button
                    variant="outline"
                    onClick={() => act(() => api.removeFrom("custom", result.rule!), `Unblocked ${result.rule}`)}
                  >
                    Unblock {result.rule}
                  </Button>
                )}
                {(result.reason === "blocklist" || result.reason === "group" || result.reason === "disabled") && (
                  <Button
                    variant="outline"
                    onClick={() => act(() => api.addTo("allowlist", result.domain), `${result.domain} is always allowed`)}
                  >
                    Always allow it
                  </Button>
                )}
                {result.reason === "allowlist" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      act(() => api.removeFrom("allowlist", result.rule!), `${result.rule} removed from allowed`)
                    }
                  >
                    Stop always allowing it
                  </Button>
                )}
                {result.reason === "not-listed" && (
                  <Button
                    variant="destructive"
                    onClick={() => act(() => api.addTo("custom", result.domain), `Blocked ${result.domain}`)}
                  >
                    Block it
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
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
        <div className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <MonitorIcon className="size-5" aria-hidden="true" />
          </span>
          <label htmlFor="this-computer" className="grid min-w-0 flex-1 gap-0.5">
            <span className="font-semibold">Protect this computer ({pc.computer})</span>
            <span className="text-sm text-muted-foreground">
              {pc.enabled
                ? `On.${backup ? ` If EasioProtect stops, it falls back to ${backup}.` : ""}`
                : `Off. This computer uses ${servers[0] ?? "automatic DNS"}.`}
            </span>
          </label>
          <Switch
            id="this-computer"
            size="lg"
            checked={pc.enabled}
            onCheckedChange={toggle}
            disabled={busy || !pc.admin || adapters.length === 0}
          />
        </div>
        {pc.message && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{pc.message}</p>}
      </CardContent>
    </Card>
  )
}
