import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

// Reached from the upgrade toast (components/upgrade-toast.ts), not the
// sidebar. Plans are configured in Clerk (Dashboard → Billing → Plans).
export default async function Page() {
  await auth.protect()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground">
          Upgrade to create bots, chat with them, and use their sandboxes.
        </p>
      </div>
      <PricingTable newSubscriptionRedirectUrl="/" />
    </div>
  )
}
