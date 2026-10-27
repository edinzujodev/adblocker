import { useId, useState, type FormEvent } from "react"
import { BanIcon, CircleCheckIcon, PlusIcon, XIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import type { ListName } from "@jok/api"
import { Empty, ListSkeleton } from "@/components/ListStates"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApi, usePolled } from "@/lib/api-hooks"

export function ListsTab() {
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">My lists</h1>
        <p className="text-muted-foreground">Your own exceptions: websites to always block, and websites to always allow.</p>
      </div>
      <DomainListCard
        list="custom"
        icon={BanIcon}
        title="Always block"
        description="Blocking a website blocks all of it: instagram.com also covers www.instagram.com."
        label="Website or word to block"
        placeholder="tiktok.com or instagram"
        hint="Tip: type just a word, like instagram, to block every website with that word in its address."
        addLabel="Block"
        empty="You haven't blocked any sites yourself."
        added={(d) => `Blocked ${d}`}
        removed={(d) => `Unblocked ${d}`}
      />
      <DomainListCard
        list="allowlist"
        icon={CircleCheckIcon}
        title="Always allow"
        description="These always work, even if a group or the ad filter would block them. Add a site here if something your family needs stops working."
        label="Website to allow"
        placeholder="example.com"
        addLabel="Allow"
        empty="Nothing here yet."
        added={(d) => `${d} is always allowed`}
        removed={(d) => `${d} removed from allowed`}
      />
    </>
  )
}

interface DomainListCardProps {
  list: ListName
  icon: LucideIcon
  title: string
  description: string
  label: string
  placeholder: string
  hint?: string
  addLabel: string
  empty: string
  added: (domain: string) => string
  removed: (domain: string) => string
}

function DomainListCard(p: DomainListCardProps) {
  const { api, onError } = useApi()
  const { data: domains, reload } = usePolled((api) => api.list(p.list), 0)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const id = useId()

  async function add(e: FormEvent) {
    e.preventDefault()
    const domain = input.trim()
    if (!domain) return
    setBusy(true)
    try {
      await api.addTo(p.list, domain)
      toast.success(p.added(domain))
      setInput("")
      await reload()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(domain: string) {
    try {
      await api.removeFrom(p.list, domain)
      toast.success(p.removed(domain))
      await reload()
    } catch (err) {
      onError(err)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <p.icon className="size-5 text-muted-foreground" aria-hidden="true" />
          {p.title}
        </CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={add} className="grid gap-2">
          <Label htmlFor={id}>{p.label}</Label>
          <div className="flex gap-2">
            <Input
              id={id}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={p.placeholder}
              aria-describedby={p.hint ? `${id}-hint` : undefined}
              required
            />
            <Button type="submit" disabled={busy}>
              <PlusIcon aria-hidden="true" />
              {p.addLabel}
            </Button>
          </div>
          {p.hint && (
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">
              {p.hint}
            </p>
          )}
        </form>

        {!domains ? (
          <ListSkeleton />
        ) : domains.length === 0 ? (
          <Empty>{p.empty}</Empty>
        ) : (
          <ul className="divide-y rounded-xl border">
            {domains.map((d) => (
              <li key={d} className="flex items-center justify-between gap-3 py-1 pr-1 pl-4">
                <span className="font-medium break-all">{d}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(d)}
                  aria-label={`Remove ${d}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
