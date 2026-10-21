import { useState, type FormEvent } from "react"
import { Loader2Icon } from "lucide-react"

import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApi } from "@/lib/api-hooks"
import { errorMessage } from "@/lib/format"

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { api } = useApi()
  const [password, setPassword] = useState("")
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
    <main className="grid min-h-svh place-items-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mx-auto size-14" />
          <CardTitle className="text-2xl">EasioProtect</CardTitle>
          <CardDescription>Enter the password shown when the server started.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <Label htmlFor="password" className="sr-only">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="h-11"
              aria-invalid={!!error}
            />
            <Button type="submit" size="lg" className="h-11" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              Log in
            </Button>
            <p role="alert" className="min-h-5 text-sm text-destructive">
              {error}
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
