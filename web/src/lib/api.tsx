import { useCallback, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { AuthError, createClient } from "@jok/api"
import { ApiContext } from "@/lib/api-hooks"
import { errorMessage } from "@/lib/format"

export function ApiProvider({ onAuthLost, children }: { onAuthLost: () => void; children: ReactNode }) {
  const [api] = useState(() => createClient())
  const onError = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) onAuthLost()
      else toast.error(errorMessage(err))
    },
    [onAuthLost],
  )
  return <ApiContext.Provider value={{ api, onError }}>{children}</ApiContext.Provider>
}
