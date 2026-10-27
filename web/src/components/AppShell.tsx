import { useEffect, useState } from "react"
import {
  ActivityIcon,
  HouseIcon,
  LayersIcon,
  ListChecksIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import type { Status } from "@easioprotect/api"
import { ActivityTab } from "@/components/ActivityTab"
import { GroupsTab } from "@/components/GroupsTab"
import { HomeTab } from "@/components/HomeTab"
import { ListsTab } from "@/components/ListsTab"
import { Logo } from "@/components/Logo"
import { SettingsTab } from "@/components/SettingsTab"
import { Button } from "@/components/ui/button"
import { useApi, usePolled } from "@/lib/api-hooks"

export type Tab = "home" | "activity" | "groups" | "lists" | "settings"

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: HouseIcon },
  { id: "groups", label: "Groups", icon: LayersIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "lists", label: "My lists", icon: ListChecksIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
]

function tabFromHash(): Tab {
  const id = window.location.hash.slice(1)
  return tabs.some((t) => t.id === id) ? (id as Tab) : "home"
}

/**
 * The open tab lives in the URL hash, so the phone's back button, reloads and
 * bookmarks all land on the right tab.
 */
function useTab() {
  const [tab, setTab] = useState(tabFromHash)
  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  return [tab, (t: Tab) => (window.location.hash = t)] as const
}

export function AppShell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { api } = useApi()
  const [tab, go] = useTab()
  const { data: status, reload } = usePolled((api) => api.status())

  async function logout() {
    await api.logout().catch(() => {})
    onLoggedOut()
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <a href="#home" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Logo />
            <span className="max-[360px]:sr-only">EasioProtect</span>
          </a>
          <StatusPill status={status} />

          <nav aria-label="Sections" className="ml-auto hidden gap-1 md:flex">
            {tabs.map((t) => (
              <TabLink key={t.id} tab={t} active={tab === t.id} layout="row" />
            ))}
          </nav>
          <Button variant="ghost" onClick={logout} className="ml-auto text-muted-foreground md:ml-2">
            <LogOutIcon aria-hidden="true" />
            <span className="max-lg:sr-only">Log out</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-2xl gap-5 px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-10">
        {tab === "home" && <HomeTab status={status} onStatusChange={reload} go={go} />}
        {tab === "groups" && <GroupsTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "lists" && <ListsTab />}
        {tab === "settings" && <SettingsTab />}
        <p className="text-center text-sm text-muted-foreground">
          Changes apply right away. Devices can take a few minutes to notice.
        </p>
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-2xl">
          {tabs.map((t) => (
            <TabLink key={t.id} tab={t} active={tab === t.id} layout="column" />
          ))}
        </div>
      </nav>
    </div>
  )
}

function TabLink({ tab, active, layout }: { tab: (typeof tabs)[number]; active: boolean; layout: "row" | "column" }) {
  const Icon = tab.icon
  return (
    <a
      href={`#${tab.id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground",
        layout === "column"
          ? "min-h-16 flex-1 flex-col justify-center gap-1 text-xs"
          : "h-10 gap-2 rounded-lg px-3 text-sm whitespace-nowrap hover:bg-muted",
        active && "text-primary hover:text-primary",
        active && layout === "row" && "bg-muted",
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full transition-colors duration-200",
          layout === "column" && "h-8 w-14",
          active && layout === "column" && "bg-primary/10",
        )}
      >
        <Icon className={layout === "column" ? "size-5" : "size-4"} aria-hidden="true" />
      </span>
      {tab.label}
    </a>
  )
}

/** Protection state on every tab, with an icon and words, not color alone. */
function StatusPill({ status }: { status?: Status }) {
  if (!status) return null
  const on = status.enabled
  const Icon = on ? ShieldCheckIcon : ShieldOffIcon
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        on ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {on ? "Protected" : "Paused"}
    </span>
  )
}
