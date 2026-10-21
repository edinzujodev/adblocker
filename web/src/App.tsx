import { useCallback, useEffect, useState } from "react"

import { AuthError } from "@/api/client"
import { AppShell } from "@/components/AppShell"
import { LoginScreen } from "@/components/LoginScreen"
import { Toaster } from "@/components/ui/sonner"
import { ApiProvider } from "@/lib/api"
import { useApi } from "@/lib/api-hooks"

type Auth = "checking" | "in" | "out"

export default function App() {
  const [auth, setAuth] = useState<Auth>("checking")
  const onAuthLost = useCallback(() => setAuth("out"), [])

  return (
    <ApiProvider onAuthLost={onAuthLost}>
      {auth === "checking" && <SessionCheck onResult={setAuth} />}
      {auth === "out" && <LoginScreen onLoggedIn={() => setAuth("in")} />}
      {auth === "in" && <AppShell onLoggedOut={() => setAuth("out")} />}
      <Toaster position="top-center" />
    </ApiProvider>
  )
}

/** If the session cookie is still valid, skip the login screen. */
function SessionCheck({ onResult }: { onResult: (a: Auth) => void }) {
  const { api, onError } = useApi()
  useEffect(() => {
    api
      .status()
      .then(() => onResult("in"))
      .catch((err) => {
        if (!(err instanceof AuthError)) onError(err)
        onResult("out")
      })
  }, [api, onError, onResult])
  return null
}
