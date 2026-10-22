import { useState } from "react"
import { ActivityIcon, LayersIcon, ListIcon, LogOutIcon, ShieldIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"

import { ActivityTab } from "@/components/ActivityTab"
import { GroupsTab } from "@/components/GroupsTab"
import { HomeTab } from "@/components/HomeTab"
import { ListsTab } from "@/components/ListsTab"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { useApi } from "@/lib/api-hooks"

type Tab = "home" | "activity" | "groups" | "lists"

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: ShieldIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "groups", label: "Groups", icon: LayersIcon },
  { id: "lists", label: "Lists", icon: ListIcon },
]

export function AppShell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { api } = useApi()
  const [tab, setTab] = useState<Tab>("home")

  async function logout() {
    await api.logout().catch(() => {})
    onLoggedOut()
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Logo />
            EasioProtect
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOutIcon />
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-xl gap-4 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {tab === "home" && <HomeTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "groups" && <GroupsTab />}
        {tab === "lists" && <ListsTab />}
        <p className="text-center text-sm text-muted-foreground">
          Changes apply right away, but devices may remember old answers for a few minutes.
        </p>
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-xl">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors",
                tab === id && "text-primary",
              )}
            >
              <Icon className="size-6" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
