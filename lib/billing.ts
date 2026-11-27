// Clerk Billing (user plans). The paid "pro" plan includes both features; the
// free plan includes none, so free users are blocked from everything below.
// Plans and features live in Clerk (Dashboard → Billing), not in this repo.

/** Feature slugs attached to the paid plan in Clerk. */
export const FEATURES = {
  /** Creating, editing, and chatting with bots (direct and group chats). */
  bots: "bots",
  /** Creating, connecting to, and using bots' Daytona sandboxes. */
  sandboxes: "sandboxes",
} as const

export type Feature = (typeof FEATURES)[keyof typeof FEATURES]

export const PRICING_PATH = "/pricing"

/** Returned by server actions when the user's plan lacks a feature. */
export type UpgradeRequired = {
  ok: false
  error: string
  code: "upgrade_required"
}

export const UPGRADE_REQUIRED: UpgradeRequired = {
  ok: false,
  error: "This needs a paid plan.",
  code: "upgrade_required",
}

type Has = (params: { feature: string }) => boolean

/** Whether the plan behind `has` (from Clerk's `auth()`/`useAuth()`) includes every feature. */
export function hasFeatures(has: Has | undefined, ...features: Feature[]) {
  return !!has && features.every((feature) => has({ feature }))
}

export function isUpgradeRequired(result: {
  ok: boolean
  code?: string
}): result is UpgradeRequired {
  return !result.ok && result.code === "upgrade_required"
}

// Usage allowance of the paid plan, per billing period. Sized to keep a $20/mo
// subscription profitable against the provider prices below.
export const PLAN_LIMITS = {
  /** Model cost, in micro-USD. Shown to users as credits (1 credit = 1¢). */
  aiMicros: 8_000_000,
  /** Sandbox run time across all bots, in seconds. */
  sandboxSeconds: 40 * 60 * 60,
  /** Bots (and so sandboxes, which cost disk even when stopped) at once. */
  bots: 5,
}

export const MICROS_PER_CREDIT = 10_000

/**
 * Model price in micro-USD per token: gpt-6.1-terra's standard API pricing
 * ($1/M input, $0.05/M cached input, $1.25/M cache writes, $5/M output).
 * Keep in sync with the model in trigger/chat.ts.
 */
export const MODEL_PRICE_MICROS = {
  input: 1,
  cacheRead: 0.05,
  cacheWrite: 1.25,
  output: 5,
}

/**
 * Sandboxes auto-stop after this long without use. Sandbox time is metered
 * from use to use, capped at this, since a sandbox left alone runs this long.
 */
export const SANDBOX_AUTO_STOP_MINUTES = 10

/** Error messages the chat agent throws; shown verbatim by the chat UI. */
export const LIMIT_MESSAGES = {
  plan: "Bots and sandboxes are part of the paid plan.",
  ai: "You've used all your AI credits for this billing period.",
  sandbox: "You've used all your sandbox time for this billing period.",
  bots: `Your plan includes up to ${PLAN_LIMITS.bots} bots. Delete one to make another.`,
} as const

export const USAGE_PATH = "/usage"

/** Returned by server actions when a usage limit is reached. */
export type UsageLimitReached = {
  ok: false
  error: string
  code: "usage_limit"
}

export function usageLimitReached(
  metric: "ai" | "sandbox" | "bots"
): UsageLimitReached {
  return { ok: false, error: LIMIT_MESSAGES[metric], code: "usage_limit" }
}

export function isUsageLimitReached(result: {
  ok: boolean
  code?: string
}): result is UsageLimitReached {
  return !result.ok && result.code === "usage_limit"
}
