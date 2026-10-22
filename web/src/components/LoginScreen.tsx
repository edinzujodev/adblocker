import { useState, type FormEvent } from "react"
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react"

import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApi } from "@/lib/api-hooks"
import { errorMessage } from "@/lib/format"

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { api } = useApi()
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      await api.login(password)
      onLoggedIn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <div className="grid w-full max-w-sm gap-6">
        <div className="grid justify-items-center gap-3 text-center">
          <Logo className="size-16" />
          <div className="grid gap-1">
            <h1 className="text-2xl font-bold tracking-tight">EasioProtect</h1>
            <p className="text-muted-foreground">Ad and site blocking for your home network</p>
          </div>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                    className="pr-12"
                    aria-invalid={!!error}
                    aria-describedby="password-help password-error"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShow(!show)}
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    className="absolute top-0 right-0 text-muted-foreground"
                  >
                    {show ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
                  </Button>
                </div>
                <p id="password-help" className="text-sm text-muted-foreground">
                  It's printed in the EasioProtect window when it starts, and saved in admin-password.txt.
                </p>
                <p id="password-error" role="alert" className="text-sm font-medium text-destructive empty:hidden">
                  {error}
                </p>
              </div>
              <Button type="submit" size="lg" disabled={busy}>
                {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
                Log in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
