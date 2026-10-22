// Types for the EasioProtect JSON API (see internal/web/web.go). Kept free of
// browser APIs so the React Native app can share them.

export interface Status {
  enabled: boolean
  totalQueries: number
  blockedQueries: number
  blocklistSize: number
  customCount: number
  allowCount: number
}

export interface Query {
  time: string // RFC 3339
  client: string
  type: string
  domain: string
  blocked: boolean
}

export interface DomainCount {
  domain: string
  count: number
}

export type CheckReason = "blocklist" | "custom" | "group" | "allowlist" | "disabled" | "not-listed"

export interface CheckResult {
  domain: string
  blocked: boolean
  reason: CheckReason
  rule?: string
  /** Block group's name, for reason "group". */
  group?: string
}

/** A built-in category (builtin: true) or one of the user's own groups. */
export interface BlockGroup {
  id: string
  name: string
  description?: string
  builtin: boolean
  enabled: boolean
  /** Listed domains and keywords, sorted. */
  entries: string[]
  /** Entries plus domains from a downloaded list. */
  size: number
  /** Why the category's list could not be downloaded. */
  error?: string
}

export interface ThisComputer {
  supported: boolean
  admin: boolean
  enabled: boolean
  computer: string
  adapters: { name: string; servers: string[] }[] | null
  message?: string
}

/** The two lists the user edits. */
export type ListName = "custom" | "allowlist"
