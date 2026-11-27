"use client"

import { toast } from "@/components/ui/toast"
import { PRICING_PATH } from "@/lib/billing"

/**
 * Error toast for features the free plan blocks. Its action is the only way
 * into the pricing page (it isn't in the sidebar).
 */
export function showUpgradeToast(
  navigate: (href: string) => void,
  title = "Upgrade to keep going"
) {
  const id = toast.add({
    type: "error",
    title,
    description: "Bots and sandboxes are part of the paid plan.",
    actionProps: {
      children: "View plans",
      onClick: () => {
        toast.close(id)
        navigate(PRICING_PATH)
      },
    },
  })
}
