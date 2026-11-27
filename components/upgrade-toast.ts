"use client"

import { toast } from "@/components/ui/toast"
import {
  isUpgradeRequired,
  isUsageLimitReached,
  LIMIT_MESSAGES,
  PRICING_PATH,
  USAGE_PATH,
  type UpgradeRequired,
  type UsageLimitReached,
} from "@/lib/billing"

type Navigate = (href: string) => void

/**
 * Error toast for features the free plan blocks. Its action is the only way
 * into the pricing page (it isn't in the sidebar).
 */
export function showUpgradeToast(
  navigate: Navigate,
  title = "Upgrade to keep going"
) {
  const id = toast.add({
    type: "error",
    title,
    description: LIMIT_MESSAGES.plan,
    actionProps: {
      children: "View plans",
      onClick: () => {
        toast.close(id)
        navigate(PRICING_PATH)
      },
    },
  })
}

/** Error toast for a used-up allowance, linking to the usage page. */
export function showUsageLimitToast(navigate: Navigate, description: string) {
  const id = toast.add({
    type: "error",
    title: "Usage limit reached",
    description,
    actionProps: {
      children: "View usage",
      onClick: () => {
        toast.close(id)
        navigate(USAGE_PATH)
      },
    },
  })
}

/**
 * Shows the right toast if `result` failed on a plan or usage limit, and
 * returns whether it did.
 */
export function toastBillingFailure<R extends { ok: boolean; code?: string }>(
  result: R,
  navigate: Navigate
): result is Extract<R, UpgradeRequired | UsageLimitReached> {
  if (isUpgradeRequired(result)) {
    showUpgradeToast(navigate)
    return true
  }
  if (isUsageLimitReached(result)) {
    showUsageLimitToast(navigate, result.error)
    return true
  }
  return false
}

/**
 * Same for an error message from the chat agent, which reports limits by
 * throwing one of LIMIT_MESSAGES.
 */
export function toastBillingError(message: string, navigate: Navigate) {
  if (message === LIMIT_MESSAGES.plan) {
    showUpgradeToast(navigate)
    return true
  }
  if (Object.values(LIMIT_MESSAGES).includes(message as never)) {
    showUsageLimitToast(navigate, message)
    return true
  }
  return false
}
