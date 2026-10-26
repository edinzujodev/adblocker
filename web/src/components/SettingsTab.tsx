import { useState, type FormEvent } from "react"
import { KeyRoundIcon, Loader2Icon, LifeBuoyIcon } from "lucide-react"
import { toast } from "sonner"

import { MIN_PASSWORD_LENGTH } from "@easioprotect/api"
import { PasswordInput } from "@/components/PasswordInput"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useApi } from "@/lib/api-hooks"
import { errorMessage } from "@/lib/format"

export function SettingsTab() {
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your password and how to get back in if you forget it.</p>
      </div>
      <ChangePasswordCard />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoyIcon className="size-5 text-muted-foreground" aria-hidden="true" />
            Forgot your password?
          </CardTitle>
          <CardDescription>
            On the login screen, enter the master password instead. It lets you set a new password. The master password
            can't be changed here.
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  )
}

function ChangePasswordCard() {
  const { api } = useApi()
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== confirm) return setError("The two new passwords don't match.")
    setBusy(true)
    setError("")
    try {
      await api.changePassword(current, password)
      toast.success("Password changed. Other devices need to log in again.")
      setCurrent("")
      setPassword("")
      setConfirm("")
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
          Change password
        </CardTitle>
        <CardDescription>Everyone logs in with this password. Other devices will need the new one.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput id="current-password" autoComplete="current-password" value={current} onChange={setCurrent} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              describedBy="new-password-help"
            />
            <p id="new-password-help" className="text-sm text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Type the new password again</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
              invalid={!!error}
              describedBy="change-error"
            />
            <p id="change-error" role="alert" className="text-sm font-medium text-destructive empty:hidden">
              {error}
            </p>
          </div>
          <Button type="submit" disabled={busy} className="justify-self-start">
            {busy && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
