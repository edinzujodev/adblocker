import { useState, type FormEvent } from "react"
import { CheckIcon, Loader2Icon, PackageIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import type { BlockGroup, Bundle } from "@easioprotect/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useApi } from "@/lib/api-hooks"

interface Props {
  bundles?: Bundle[]
  groups?: BlockGroup[]
  onChange: () => Promise<void>
}

/** Bundles: one switch for several groups, like "Kids mode". */
export function BundlesSection({ bundles, groups, onChange }: Props) {
  return (
    <>
      <div className="grid gap-1">
        <h2 className="text-xl font-bold tracking-tight">Bundles</h2>
        <p className="text-muted-foreground">
          One switch for several groups, like “Bedtime” or “Kids mode”. Switching a bundle off won't change the groups' own switches.
        </p>
      </div>
      {bundles?.map((b) => <BundleCard key={b.id} bundle={b} groups={groups ?? []} onChange={onChange} />)}
      <NewBundleCard onCreated={onChange} />
    </>
  )
}

function NewBundleCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const { api, onError } = useApi()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const b = await api.createBundle(name)
      toast.success(`Created ${b.name}. Now choose its groups.`)
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
          <Label htmlFor="new-bundle">New bundle name</Label>
          <div className="flex gap-2">
            <Input
              id="new-bundle"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kids mode"
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

function BundleCard({ bundle: b, groups, onChange }: { bundle: Bundle; groups: BlockGroup[]; onChange: () => Promise<void> }) {
  const { api, onError } = useApi()
  const [busy, setBusy] = useState(false)
  // A new, empty bundle opens straight into choosing its groups.
  const [editing, setEditing] = useState(b.groups.length === 0)
  const [chosen, setChosen] = useState<string[]>(b.groups)
  const members = b.groups.map((id) => groups.find((g) => g.id === id)).filter((g) => !!g)

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      await onChange()
      return true
    } catch (err) {
      onError(err)
      return false
    } finally {
      setBusy(false)
    }
  }

  function toggle(on: boolean) {
    run(() => api.updateBundle(b.id, { enabled: on }), on ? `${b.name} is on` : `${b.name} is off`)
  }

  async function save() {
    if (await run(() => api.setBundleGroups(b.id, chosen), `Saved the groups in ${b.name}`)) setEditing(false)
  }

  function startEditing() {
    setChosen(b.groups)
    setEditing(true)
  }

  function remove() {
    if (confirm(`Delete the bundle "${b.name}"? Its groups keep their own switches.`))
      run(() => api.deleteBundle(b.id), `Deleted ${b.name}`)
  }

  return (
    <Card className={cn(b.enabled && "ring-destructive/25")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-2 break-all">
          <PackageIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {b.name}
          {busy ? (
            <span className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              Updating
            </span>
          ) : (
            <span className={cn("text-sm font-semibold", b.enabled ? "text-destructive" : "text-muted-foreground")}>
              {b.enabled ? "On" : "Off"}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {members.length === 0
            ? "No groups yet. Choose which ones to include."
            : `${members.length} ${members.length === 1 ? "group" : "groups"} · ${b.enabled ? "all blocked now" : "switched off"}`}
        </CardDescription>
        <CardAction>
          <Switch
            size="lg"
            checked={b.enabled}
            onCheckedChange={toggle}
            disabled={busy || members.length === 0}
            aria-label={`Switch on ${b.name}`}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {editing ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">What {b.name} blocks</legend>
            <div className="grid gap-1 rounded-xl border p-1">
              {groups.map((g) => {
                const on = chosen.includes(g.id)
                return (
                  <label
                    key={g.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 transition-colors duration-200 hover:bg-muted",
                      on && "bg-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setChosen(on ? chosen.filter((id) => id !== g.id) : [...chosen, g.id])}
                      className="size-5 accent-primary"
                    />
                    <span className="flex-1 font-medium">{g.name}</span>
                    <span className="text-sm text-muted-foreground">{g.builtin ? "Category" : "My group"}</span>
                  </label>
                )
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={busy}>
                <CheckIcon aria-hidden="true" />
                Save
              </Button>
              {b.groups.length > 0 && (
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </fieldset>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {members.map((g) => (
                <li key={g.id}>
                  <Badge variant="secondary" className="h-8 px-3 text-sm">
                    {g.name}
                  </Badge>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={startEditing}>
                <PencilIcon aria-hidden="true" />
                Choose groups
              </Button>
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
                <Trash2Icon aria-hidden="true" />
                Delete bundle
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
