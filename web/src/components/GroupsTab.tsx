import { useState, type FormEvent } from "react"
import {
  ChevronDownIcon,
  DicesIcon,
  EyeOffIcon,
  FolderIcon,
  Gamepad2Icon,
  HeartIcon,
  Loader2Icon,
  MessageCircleIcon,
  NewspaperIcon,
  PlusIcon,
  ShoppingBagIcon,
  Trash2Icon,
  TvIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import type { BlockGroup } from "@easioprotect/api"
import { Empty, ListSkeleton } from "@/components/ListStates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useApi, usePolled } from "@/lib/api-hooks"
import { formatNumber } from "@/lib/format"

const categoryIcons: Record<string, LucideIcon> = {
  social: UsersIcon,
  video: TvIcon,
  gaming: Gamepad2Icon,
  messaging: MessageCircleIcon,
  shopping: ShoppingBagIcon,
  dating: HeartIcon,
  gambling: DicesIcon,
  adult: EyeOffIcon,
  fakenews: NewspaperIcon,
}

export function GroupsTab() {
  const { data: groups, reload } = usePolled((api) => api.groups(), 0)
  const categories = groups?.filter((g) => g.builtin)
  const mine = groups?.filter((g) => !g.builtin)

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
        <p className="text-muted-foreground">Block a whole kind of site with one switch.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Ready-made lists that we keep up to date.</CardDescription>
        </CardHeader>
        <CardContent>
          {!categories ? (
            <ListSkeleton />
          ) : (
            <ul className="-mx-2 grid gap-1">
              {categories.map((g) => (
                <CategoryRow key={g.id} group={g} onChange={reload} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-1 pt-2">
        <h2 className="text-xl font-bold tracking-tight">My groups</h2>
        <p className="text-muted-foreground">
          Put sites together, like “Homework time”, and switch them all on or off at once.
        </p>
      </div>
      <NewGroupCard onCreated={reload} />
      {mine?.map((g) => <GroupCard key={g.id} group={g} onChange={reload} />)}
    </>
  )
}

/** Switches a group on or off; downloading a category's list can take a few seconds. */
function useToggle(group: BlockGroup, onChange: () => Promise<void>) {
  const { api, onError } = useApi()
  const [busy, setBusy] = useState(false)
  async function toggle(on: boolean) {
    setBusy(true)
    try {
      await api.updateGroup(group.id, { enabled: on })
      toast.success(on ? `${group.name} is now blocked` : `${group.name} is allowed again`)
    } catch (err) {
      onError(err)
    } finally {
      await onChange()
      setBusy(false)
    }
  }
  return { busy, toggle }
}

function OnOff({ on, busy }: { on: boolean; busy: boolean }) {
  if (busy)
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
        Updating
      </span>
    )
  return (
    <span className={cn("text-sm font-semibold", on ? "text-destructive" : "text-muted-foreground")}>
      {on ? "Blocked" : "Allowed"}
    </span>
  )
}

function CategoryRow({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { busy, toggle } = useToggle(g, onChange)
  const [open, setOpen] = useState(false)
  const Icon = categoryIcons[g.id] ?? FolderIcon
  const switchId = `cat-${g.id}`

  return (
    <li className={cn("rounded-xl transition-colors duration-200", g.enabled && "bg-destructive/6")}>
      {/* The whole row is the switch's label, so it is one large tap target. */}
      <label htmlFor={switchId} className="flex cursor-pointer items-center gap-3 p-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl transition-colors duration-200",
            g.enabled ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold">{g.name}</span>
            <OnOff on={g.enabled} busy={busy} />
          </span>
          <span className="text-sm text-muted-foreground">{g.description}</span>
          {g.enabled && g.size > g.entries.length && (
            <span className="text-xs text-muted-foreground">{formatNumber(g.size)} sites on the list</span>
          )}
          {g.error && (
            <span role="alert" className="text-sm text-destructive">
              Couldn't download the list: {g.error}
            </span>
          )}
        </span>
        <Switch id={switchId} size="lg" checked={g.enabled} onCheckedChange={toggle} disabled={busy} />
      </label>

      {g.entries.length > 0 && (
        <div className="px-3 pb-2 pl-[4.25rem]">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {open ? "Hide sites" : "Show sites"}
            <ChevronDownIcon
              className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {open && (
            <ul className="flex flex-wrap gap-1.5 pb-2">
              {g.entries.map((e) => (
                <li key={e}>
                  <Badge variant="outline">{e}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function NewGroupCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const { api, onError } = useApi()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const g = await api.createGroup(name)
      toast.success(`Created ${g.name}. Now add sites to it.`)
      setName("")
      await onCreated()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={create} className="grid gap-2">
          <Label htmlFor="new-group">New group name</Label>
          <div className="flex gap-2">
            <Input
              id="new-group"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Homework time"
              maxLength={50}
              required
            />
            <Button type="submit" disabled={busy}>
              <PlusIcon aria-hidden="true" />
              Create
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function GroupCard({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { api, onError } = useApi()
  const { busy, toggle } = useToggle(g, onChange)
  const [input, setInput] = useState("")
  const inputId = `add-${g.id}`

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn()
      toast.success(done)
      await onChange()
      return true
    } catch (err) {
      onError(err)
      return false
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const entry = input.trim()
    if (entry && (await run(() => api.addToGroup(g.id, entry), `Added ${entry} to ${g.name}`))) setInput("")
  }

  function remove() {
    if (confirm(`Delete the group "${g.name}"? Its sites will no longer be blocked by it.`))
      run(() => api.deleteGroup(g.id), `Deleted ${g.name}`)
  }

  return (
    <Card className={cn(g.enabled && "ring-destructive/25")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-2 break-all">
          {g.name}
          <OnOff on={g.enabled} busy={busy} />
        </CardTitle>
        <CardDescription>
          {g.entries.length === 0
            ? "Add sites or keywords below."
            : `${g.entries.length} ${g.entries.length === 1 ? "site" : "sites"} · ${g.enabled ? "blocked now" : "switched off"}`}
        </CardDescription>
        <CardAction>
          <Switch
            size="lg"
            checked={g.enabled}
            onCheckedChange={toggle}
            disabled={busy}
            aria-label={`Block ${g.name}`}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={add} className="grid gap-2">
          <Label htmlFor={inputId}>Add a site or keyword</Label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="roblox.com or youtube"
              aria-describedby={`${inputId}-hint`}
              required
            />
            <Button type="submit" variant="secondary">
              <PlusIcon aria-hidden="true" />
              Add
            </Button>
          </div>
          <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
            A word without a dot, like <span className="font-medium text-foreground">youtube</span>, blocks every site
            containing it.
          </p>
        </form>

        {g.entries.length === 0 ? (
          <Empty>No sites in this group yet.</Empty>
        ) : (
          <ul className="divide-y rounded-xl border">
            {g.entries.map((e) => (
              <li key={e} className="flex items-center justify-between gap-3 py-1 pr-1 pl-4">
                <span className="font-medium break-all">{e}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => run(() => api.removeFromGroup(g.id, e), `Removed ${e} from ${g.name}`)}
                  aria-label={`Remove ${e}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button variant="ghost" className="justify-self-start text-destructive hover:text-destructive" onClick={remove}>
          <Trash2Icon aria-hidden="true" />
          Delete group
        </Button>
      </CardContent>
    </Card>
  )
}
