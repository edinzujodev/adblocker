import { useState, type FormEvent } from "react"
import { XIcon } from "lucide-react"
import { toast } from "sonner"

import type { ListName } from "@/api/types"
import { Empty, ListSkeleton } from "@/components/ListStates"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useApi, usePolled } from "@/lib/api-hooks"

export function ListsTab() {
  return (
    <>
      <DomainListCard
        list="custom"
        title="My blocked sites"
        description="Sites you block yourself. Subdomains are included."
        placeholder="e.g. tiktok.com"
        addLabel="Block"
        empty="You haven't blocked any sites yourself."
        added={(d) => `Blocked ${d}`}
        removed={(d) => `Unblocked ${d}`}
      />
      <DomainListCard
        list="allowlist"
        title="Always allowed"
        description="Never blocked, even if a blocklist contains them."
        placeholder="e.g. example.com"
        addLabel="Allow"
        empty="No always-allowed sites."
        added={(d) => `${d} is always allowed`}
        removed={(d) => `${d} removed from allowed`}
      />
    </>
  )
}

interface DomainListCardProps {
  list: ListName
  title: string
  description: string
  placeholder: string
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
        <CardTitle>{p.title}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
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
            placeholder={p.placeholder}
            className="h-10"
            required
          />
          <Button type="submit" size="lg" className="h-10 px-4" disabled={busy}>
            {p.addLabel}
          </Button>
        </form>

        {!domains ? (
          <ListSkeleton />
        ) : domains.length === 0 ? (
          <Empty>{p.empty}</Empty>
        ) : (
          <ul className="divide-y">
            {domains.map((d) => (
              <li key={d} className="flex items-center justify-between gap-3 py-2">
                <span className="font-medium break-all">{d}</span>
                <Button variant="destructive" size="sm" onClick={() => remove(d)} aria-label={`Remove ${d}`}>
                  <XIcon />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
