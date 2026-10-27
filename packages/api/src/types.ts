// Types for the JoK JSON API (see internal/web/web.go). Kept free of
// browser APIs so the React Native app can share them.

/** POST /api/login: a session, or (master password) a token to set a new password. */
export interface LoginResult {
  token?: string
  reset?: boolean
  resetToken?: string
}

/** Shortest password the server accepts. */
export const MIN_PASSWORD_LENGTH = 8

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
  /** Bundle that switched the group on, if not its own switch. */
  bundle?: string
}

/** A built-in category (builtin: true) or one of the user's own groups. */
export interface BlockGroup {
  id: string
  name: string
  description?: string
  builtin: boolean
  /** The group's own switch. */
  enabled: boolean
  /** A switched-on bundle that blocks this group, even if its own switch is off. */
  blockedBy?: string
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

/**
 * A named set of groups. While it is on, every group in it blocks; switching
 * it off leaves the groups' own switches as they were.
 */
export interface Bundle {
  id: string
  name: string
  enabled: boolean
  /** Group IDs. */
  groups: string[]
}

/** The two lists the user edits. */
export type ListName = "custom" | "allowlist"
