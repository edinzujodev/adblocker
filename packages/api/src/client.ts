// EasioProtect API client. It only uses fetch, so it works in the browser
// (session cookie) and in React Native (bearer token from login()).

import type { BlockGroup, Bundle, CheckResult, LoginResult, DomainCount, ListName, Query, Status, ThisComputer } from "./types"

/** Thrown when the session is missing or expired; show the login screen. */
export class AuthError extends Error {
  constructor() {
    super("Please log in")
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    // The server writes messages in lowercase; show them as sentences.
    super(message.charAt(0).toUpperCase() + message.slice(1))
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
    /**
     * Logs in. With the normal password it returns the session token (the
     * mobile app stores it for next time). With the master password it
     * returns { reset: true, resetToken }: pass that to resetPassword().
     */
    async login(password: string): Promise<LoginResult> {
      const r = await request<LoginResult>("POST", "/api/login", { password })
      if (r.token) token = r.token
      return r
    },
    /** Sets a new password after a master-password login. Every device is signed out. */
    resetPassword: (resetToken: string, password: string) =>
      request<void>("POST", "/api/password/reset", { resetToken, password }),
    /** Changes the password; other devices are signed out. */
    changePassword: (current: string, password: string) =>
      request<void>("POST", "/api/password", { current, password }),
    async logout() {
      await request<void>("POST", "/api/logout")
      token = undefined
    },

    status: () => request<Status>("GET", "/api/status"),
    setEnabled: (enabled: boolean) => request<{ enabled: boolean }>("POST", "/api/enabled", { enabled }),

    recentQueries: (opts: { blocked?: boolean; limit?: number } = {}) =>
      request<Query[]>("GET", `/api/queries?blocked=${opts.blocked ?? false}&limit=${opts.limit ?? 100}`),
    topBlocked: () => request<DomainCount[]>("GET", "/api/top-blocked"),
    check: (domain: string) => request<CheckResult>("GET", `/api/check?domain=${enc(domain)}`),

    list: (name: ListName) => request<string[]>("GET", `/api/${name}`),
    addTo: (name: ListName, domain: string) => request<void>("POST", `/api/${name}`, { domain }),
    removeFrom: (name: ListName, domain: string) => request<void>("DELETE", `/api/${name}/${enc(domain)}`),

    groups: () => request<BlockGroup[]>("GET", "/api/groups"),
    createGroup: (name: string, entries: string[] = []) =>
      request<BlockGroup>("POST", "/api/groups", { name, entries }),
    updateGroup: (id: string, change: { name?: string; enabled?: boolean }) =>
      request<BlockGroup>("PATCH", `/api/groups/${enc(id)}`, change),
    deleteGroup: (id: string) => request<void>("DELETE", `/api/groups/${enc(id)}`),
    addToGroup: (id: string, entry: string) =>
      request<BlockGroup>("POST", `/api/groups/${enc(id)}/entries`, { domain: entry }),
    removeFromGroup: (id: string, entry: string) =>
      request<BlockGroup>("DELETE", `/api/groups/${enc(id)}/entries/${enc(entry)}`),

    bundles: () => request<Bundle[]>("GET", "/api/bundles"),
    createBundle: (name: string, groups: string[] = []) => request<Bundle>("POST", "/api/bundles", { name, groups }),
    updateBundle: (id: string, change: { name?: string; enabled?: boolean }) =>
      request<Bundle>("PATCH", `/api/bundles/${enc(id)}`, change),
    setBundleGroups: (id: string, groups: string[]) =>
      request<Bundle>("PUT", `/api/bundles/${enc(id)}/groups`, { groups }),
    deleteBundle: (id: string) => request<void>("DELETE", `/api/bundles/${enc(id)}`),

    thisComputer: () => request<ThisComputer>("GET", "/api/this-computer"),
    setThisComputer: (enabled: boolean) => request<ThisComputer>("POST", "/api/this-computer", { enabled }),
  }
}

export type Client = ReturnType<typeof createClient>
