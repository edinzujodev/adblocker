// EasioProtect API client. It only uses fetch, so it works in the browser
// (session cookie) and in React Native (bearer token from login()).

import type { CheckResult, DomainCount, ListName, Query, Status, ThisComputer } from "./types"

/** Thrown when the session is missing or expired; show the login screen. */
export class AuthError extends Error {
  constructor() {
    super("Please log in")
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ClientOptions {
  /** Server address, e.g. "http://192.168.0.197:8080". "" means same origin. */
  baseUrl?: string
  /** Bearer token for clients without cookies (the mobile app). */
  token?: string
}

export function createClient(opts: ClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? ""
  let token = opts.token

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers["Content-Type"] = "application/json"
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    })
    if (res.status === 401 && path !== "/api/login") throw new AuthError()
    if (res.status === 204) return undefined as T
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
    return data as T
  }

  const enc = encodeURIComponent

  return {
    async login(password: string) {
      const r = await request<{ token: string }>("POST", "/api/login", { password })
      token = opts.token !== undefined ? r.token : token // keep it only for token clients
      return r.token
    },
    logout: () => request<void>("POST", "/api/logout"),

    status: () => request<Status>("GET", "/api/status"),
    setEnabled: (enabled: boolean) => request<{ enabled: boolean }>("POST", "/api/enabled", { enabled }),

    recentQueries: (opts: { blocked?: boolean; limit?: number } = {}) =>
      request<Query[]>("GET", `/api/queries?blocked=${opts.blocked ?? false}&limit=${opts.limit ?? 100}`),
    topBlocked: () => request<DomainCount[]>("GET", "/api/top-blocked"),
    check: (domain: string) => request<CheckResult>("GET", `/api/check?domain=${enc(domain)}`),

    list: (name: ListName) => request<string[]>("GET", `/api/${name}`),
    addTo: (name: ListName, domain: string) => request<void>("POST", `/api/${name}`, { domain }),
    removeFrom: (name: ListName, domain: string) => request<void>("DELETE", `/api/${name}/${enc(domain)}`),

    thisComputer: () => request<ThisComputer>("GET", "/api/this-computer"),
    setThisComputer: (enabled: boolean) => request<ThisComputer>("POST", "/api/this-computer", { enabled }),
  }
}

export type Client = ReturnType<typeof createClient>
