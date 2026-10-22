import { useState, type FormEvent } from "react"
import { Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import type { BlockGroup } from "@easioprotect/api"
import { Empty, ListSkeleton } from "@/components/ListStates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useApi, usePolled } from "@/lib/api-hooks"
import { formatNumber } from "@/lib/format"

export function GroupsTab() {
  const { data: groups, reload } = usePolled((api) => api.groups(), 0)
  const categories = groups?.filter((g) => g.builtin)
  const mine = groups?.filter((g) => !g.builtin)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Switch on a category to block every site in it.</CardDescription>
        </CardHeader>
        <CardContent>
          {!categories ? (
            <ListSkeleton />
          ) : (
            <ul className="divide-y">
              {categories.map((g) => (
                <CategoryRow key={g.id} group={g} onChange={reload} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
      toast.success(`${group.name} ${on ? "blocked" : "allowed again"}`)
    } catch (err) {
      onError(err)
    } finally {
      await onChange()
      setBusy(false)
    }
  }
  return { busy, toggle }
}

function CategoryRow({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { busy, toggle } = useToggle(g, onChange)
  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="font-medium">
            {g.name}
            {g.enabled && g.size > g.entries.length && (
              <Badge variant="secondary" className="ml-2 align-middle">
                {formatNumber(g.size)} sites
              </Badge>
            )}
          </p>
          <p className="text-sm text-muted-foreground">{busy ? "Updating…" : g.description}</p>
          {g.error && <p className="text-sm text-destructive">Could not download the list: {g.error}</p>}
        </div>
        <Switch checked={g.enabled} onCheckedChange={toggle} disabled={busy} aria-label={`Block ${g.name}`} />
      </div>
      {g.entries.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">What's included</summary>
          <div className="flex flex-wrap gap-1 pt-2">
            {g.entries.map((e) => (
              <Badge key={e} variant="outline">
                {e}
              </Badge>
            ))}
          </div>
        </details>
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
      toast.success(`Created ${g.name}. Add sites to it below.`)
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
      <CardHeader>
        <CardTitle>My groups</CardTitle>
        <CardDescription>
          Put several sites and keywords together and switch them on or off at once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={create} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Homework time"
            maxLength={50}
            className="h-10"
            required
          />
          <Button type="submit" size="lg" className="h-10 px-4" disabled={busy}>
            Create
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function GroupCard({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { api, onError } = useApi()
  const { busy, toggle } = useToggle(g, onChange)
  const [input, setInput] = useState("")

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
    if (confirm(`Delete the group "${g.name}"?`)) run(() => api.deleteGroup(g.id), `Deleted ${g.name}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="break-all">{g.name}</CardTitle>
        <CardDescription>{g.enabled ? "On: these are blocked." : "Off: these are allowed."}</CardDescription>
        <CardAction>
          <Switch
            checked={g.enabled}
            onCheckedChange={toggle}
            disabled={busy}
            aria-label={`Block ${g.name}`}
            className="scale-125"
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. roblox.com or youtube"
            className="h-10"
            required
          />
          <Button type="submit" size="lg" className="h-10 px-4">
            Add
          </Button>
        </form>

        {g.entries.length === 0 ? (
          <Empty>No sites in this group yet.</Empty>
        ) : (
          <ul className="divide-y">
            {g.entries.map((e) => (
              <li key={e} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium break-all">{e}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => run(() => api.removeFromGroup(g.id, e), `Removed ${e} from ${g.name}`)}
                  aria-label={`Remove ${e}`}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" className="justify-self-start text-destructive" onClick={remove}>
          <Trash2Icon />
          Delete group
        </Button>
      </CardContent>
    </Card>
  )
}
