import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react"

import type { Client } from "@jok/api"

export interface ApiContextValue {
  api: Client
  /** Call when a request fails: logs out on AuthError, otherwise shows a toast. */
  onError: (err: unknown) => void
}

export const ApiContext = createContext<ApiContextValue | null>(null)

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext)
  if (!ctx) throw new Error("useApi must be used inside ApiProvider")
  return ctx
}

/**
 * Loads data with fn and reloads it every intervalMs while the page is
 * visible (0 = no polling). reload() fetches again right away.
 */
export function usePolled<T>(fn: (api: Client) => Promise<T>, intervalMs = 5000) {
  const { api, onError } = useApi()
  const [data, setData] = useState<T>()
  const fnRef = useRef(fn)
  useLayoutEffect(() => {
    fnRef.current = fn
  })

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current(api))
    } catch (err) {
      onError(err)
    }
  }, [api, onError])

  useEffect(() => {
    reload()
    if (!intervalMs) return
    const id = setInterval(() => {
      if (!document.hidden) reload()
    }, intervalMs)
    const onVisible = () => !document.hidden && reload()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [reload, intervalMs])

  return { data, reload }
}
