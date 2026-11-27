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
