import { useState, type FormEvent } from "react"
import { CircleCheckIcon, KeyRoundIcon, Loader2Icon } from "lucide-react"

import { MIN_PASSWORD_LENGTH } from "@jok/api"
import { Logo } from "@/components/Logo"
import { PasswordInput } from "@/components/PasswordInput"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useApi } from "@/lib/api-hooks"
import { errorMessage } from "@/lib/format"

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  // Set when the master password was used: the next step is a new password.
  const [resetToken, setResetToken] = useState("")
  const [notice, setNotice] = useState("")

  return (
    <main className="grid min-h-svh place-items-center bg-background p-4">
      <div className="grid w-full max-w-sm gap-6">
        <div className="grid justify-items-center gap-3 text-center">
          <Logo className="size-16" />
          <div className="grid gap-1">
            <h1 className="text-2xl font-bold tracking-tight">JoK</h1>
            <p className="text-muted-foreground">Say no to ads and unwanted sites.</p>
          </div>
        </div>
        {resetToken ? (
          <NewPasswordCard
            resetToken={resetToken}
            onDone={(message) => {
              setResetToken("")
              setNotice(message)
            }}
          />
        ) : (
          <LoginCard notice={notice} onLoggedIn={onLoggedIn} onReset={setResetToken} />
        )}
      </div>
    </main>
  )
}

function LoginCard({
  notice,
  onLoggedIn,
  onReset,
}: {
  notice: string
  onLoggedIn: () => void
  onReset: (resetToken: string) => void
}) {
  const { api } = useApi()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const r = await api.login(password)
      if (r.reset && r.resetToken) onReset(r.resetToken)
      else onLoggedIn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          {notice && (
            <p role="status" className="flex items-start gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
              <CircleCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              autoFocus
              invalid={!!error}
              describedBy="password-error"
            />
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
  )
}

/** After a master-password login: choose the new password. */
function NewPasswordCard({ resetToken, onDone }: { resetToken: string; onDone: (message: string) => void }) {
  const { api } = useApi()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== confirm) return setError("The two passwords don't match.")
    setBusy(true)
    setError("")
    try {
      await api.resetPassword(resetToken, password)
      onDone("Your new password is set. Log in with it.")
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          Set a new password
        </CardTitle>
        <CardDescription>
          You used the master password. Choose the password everyone will log in with from now on.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              autoFocus
              describedBy="new-password-help"
            />
            <p id="new-password-help" className="text-sm text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Type it again</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
              invalid={!!error}
              describedBy="reset-error"
            />
            <p id="reset-error" role="alert" className="text-sm font-medium text-destructive empty:hidden">
              {error}
            </p>
          </div>
          <Button type="submit" size="lg" disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            Save new password
          </Button>
          <Button type="button" variant="ghost" onClick={() => onDone("")}>
            Cancel
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
