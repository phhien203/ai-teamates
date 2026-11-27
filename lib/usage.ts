// Usage-based billing: the ledger of what each user has spent in their
// current billing period, and the checks against the plan's allowance.
//
// Shared by the Next.js server (actions, usage page) and the chat agent on
// Trigger.dev, so it uses @clerk/backend rather than @clerk/nextjs and must
// not import "server-only".

import { createClerkClient } from "@clerk/backend"
import { isClerkAPIResponseError } from "@clerk/backend/errors"
import type { LanguageModelUsage } from "ai"
import { and, count, eq, gte, lt, sql, sum } from "drizzle-orm"

import { db } from "@/db"
import { bots, subscriptions, usageLedger } from "@/db/schema"
import {
  LIMIT_MESSAGES,
  MODEL_PRICE_MICROS,
  PLAN_LIMITS,
  SANDBOX_AUTO_STOP_MINUTES,
} from "@/lib/billing"

/** Slug of the paid plan in Clerk (Dashboard → Billing → Plans). */
const PAID_PLAN = "pro"

/** How long a cached subscription period is trusted before asking Clerk. */
const SUBSCRIPTION_TTL_MS = 5 * 60 * 1000

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export type LimitReason = keyof typeof LIMIT_MESSAGES

/** Thrown when a plan or usage limit blocks something. */
export class UsageLimitError extends Error {
  constructor(readonly reason: LimitReason) {
    super(LIMIT_MESSAGES[reason])
    this.name = "UsageLimitError"
  }
}

type Subscription = typeof subscriptions.$inferSelect

/** The current period of the user's paid subscription, straight from Clerk. */
async function fetchPaidPeriod(userId: string) {
  let subscription
  try {
    subscription = await clerk.billing.getUserBillingSubscription(userId)
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) return null
    throw error
  }

  const now = Date.now()
  const item = subscription.subscriptionItems.find(
    (item) =>
      item.plan?.slug === PAID_PLAN &&
      // A canceled item stays usable until its period ends.
      (item.status === "active" || item.status === "canceled") &&
      item.periodEnd !== null &&
      item.periodStart <= now &&
      now < item.periodEnd
  )
  if (!item || item.periodEnd === null) return null
  return {
    plan: item.plan!.slug,
    periodStart: new Date(item.periodStart),
    periodEnd: new Date(item.periodEnd),
  }
}

/**
 * The user's current paid billing period, or `null` without a paid plan.
 * Cached in the `subscriptions` table and refreshed from Clerk every few
 * minutes, or right away once the cached period is over.
 */
export async function getSubscription(
  userId: string,
  { fresh = false } = {}
): Promise<Subscription | null> {
  const cached = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  })
  const now = Date.now()
  const cacheValid =
    cached &&
    cached.periodEnd.getTime() > now &&
    now - cached.syncedAt.getTime() < SUBSCRIPTION_TTL_MS
  if (cacheValid && !fresh) return cached

  let period
  try {
    period = await fetchPaidPeriod(userId)
  } catch (error) {
    // Clerk is unreachable: fall back to a still-running cached period.
    if (cached && cached.periodEnd.getTime() > now) {
      console.error("Failed to refresh subscription", userId, error)
      return cached
    }
    throw error
  }

  if (!period) {
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId))
    return null
  }

  const row = { userId, ...period, syncedAt: new Date() }
  await db
    .insert(subscriptions)
    .values(row)
    .onConflictDoUpdate({ target: subscriptions.userId, set: row })
  return row
}

export type Usage = {
  plan: string
  periodStart: Date
  periodEnd: Date
  ai: { used: number; limit: number }
  sandbox: { used: number; limit: number }
  bots: { used: number; limit: number }
}

/** What the user has used of their allowance this period; `null` without a paid plan. */
export async function getUsage(
  userId: string,
  options?: { fresh?: boolean }
): Promise<Usage | null> {
  const subscription = await getSubscription(userId, options)
  if (!subscription) return null

  const [totals, [botCount]] = await Promise.all([
    db
      .select({
        metric: usageLedger.metric,
        total: sum(usageLedger.amount).mapWith(Number),
      })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.userId, userId),
          gte(usageLedger.createdAt, subscription.periodStart),
          lt(usageLedger.createdAt, subscription.periodEnd)
        )
      )
      .groupBy(usageLedger.metric),
    db.select({ n: count() }).from(bots).where(eq(bots.userId, userId)),
  ])
  const used = (metric: "ai" | "sandbox") =>
    totals.find((t) => t.metric === metric)?.total ?? 0

  return {
    plan: subscription.plan,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
    ai: { used: used("ai"), limit: PLAN_LIMITS.aiMicros },
    sandbox: { used: used("sandbox"), limit: PLAN_LIMITS.sandboxSeconds },
    bots: { used: botCount.n, limit: PLAN_LIMITS.bots },
  }
}

/**
 * Why the user can't use `resources` right now, or `null` if they can.
 * `bots` means they're at the bot limit (only matters when creating one).
 */
export async function checkAllowance(
  userId: string,
  ...resources: ("ai" | "sandbox" | "bots")[]
): Promise<LimitReason | null> {
  const usage = await getUsage(userId)
  if (!usage) return "plan"
  return (
    resources.find((resource) => {
      const { used, limit } = usage[resource]
      return used >= limit
    }) ?? null
  )
}

/** AI credits the user has left this period, in micro-USD (0 without a plan). */
export async function remainingAiMicros(userId: string) {
  const usage = await getUsage(userId)
  return usage ? Math.max(0, usage.ai.limit - usage.ai.used) : 0
}

/** Model cost of `usage`, in micro-USD. */
export function aiCostMicros(usage: LanguageModelUsage) {
  const input = usage.inputTokens ?? 0
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0
  const noCache =
    usage.inputTokenDetails?.noCacheTokens ??
    Math.max(0, input - cacheRead - cacheWrite)
  const output = usage.outputTokens ?? 0
  return Math.ceil(
    noCache * MODEL_PRICE_MICROS.input +
      cacheRead * MODEL_PRICE_MICROS.cacheRead +
      cacheWrite * MODEL_PRICE_MICROS.cacheWrite +
      output * MODEL_PRICE_MICROS.output
  )
}

/** Charges one model call (a step of a turn) to the ledger. */
export async function recordAiUsage(entry: {
  userId: string
  botId: string
  chatId: string
  usage: LanguageModelUsage
}) {
  const amount = aiCostMicros(entry.usage)
  if (amount <= 0) return
  await db.insert(usageLedger).values({
    userId: entry.userId,
    metric: "ai",
    amount,
    botId: entry.botId,
    chatId: entry.chatId,
    detail: {
      inputTokens: entry.usage.inputTokens,
      cacheReadTokens: entry.usage.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: entry.usage.inputTokenDetails?.cacheWriteTokens,
      outputTokens: entry.usage.outputTokens,
    },
  })
}

/**
 * Called before each use of a bot's sandbox (tool calls, memory reads, the
 * desktop). Throws a `UsageLimitError` if the user's plan or sandbox time
 * doesn't allow it; otherwise charges the run time since the last use.
 *
 * A sandbox keeps running until SANDBOX_AUTO_STOP_MINUTES after its last use,
 * so the time between two uses is charged in full up to that cap. The idle
 * tail after the last use of a session is charged at the next use.
 */
export async function meterSandboxUse(botId: string) {
  const bot = await db.query.bots.findFirst({
    where: eq(bots.id, botId),
    columns: { userId: true },
  })
  if (!bot) throw new Error(`Bot ${botId} not found`)

  const blocked = await checkAllowance(bot.userId, "sandbox")
  if (blocked) throw new UsageLimitError(blocked)

  // One statement, so concurrent uses can't charge the same interval twice:
  // the row lock serializes them, and each charges from the previous one.
  const capSeconds = SANDBOX_AUTO_STOP_MINUTES * 60
  await db.execute(sql`
    with prev as (
      select id, user_id, sandbox_active_at
      from bots
      where id = ${botId}
      for update
    ), touched as (
      update bots
      set sandbox_active_at = now()
      from prev
      where bots.id = prev.id
      returning prev.user_id, prev.sandbox_active_at as last_active_at
    )
    insert into usage_ledger (id, user_id, metric, amount, bot_id)
    select
      gen_random_uuid()::text,
      user_id,
      'sandbox',
      least(ceil(extract(epoch from now() - last_active_at)), ${capSeconds})::int,
      ${botId}
    from touched
    where last_active_at is not null and now() > last_active_at
  `)
}
