import { auth } from "@clerk/nextjs/server"
import { format } from "date-fns"
import { BotIcon, CpuIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { UsageReset } from "@/components/usage-reset"
import { MICROS_PER_CREDIT, PRICING_PATH } from "@/lib/billing"
import { getUsage } from "@/lib/usage"

// Reached from the user menu in the sidebar footer (components/nav-user.tsx).
export default async function Page() {
  const { userId } = await auth.protect()
  // Fresh from Clerk, so a just-renewed or just-bought plan shows right away.
  const usage = await getUsage(userId, { fresh: true })

  if (!usage) {
    return (
      <div className="flex min-h-svh">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No usage to show</EmptyTitle>
            <EmptyDescription>
              Usage limits come with the paid plan. Upgrade to create bots and
              use their sandboxes.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href={PRICING_PATH} />}>
              View plans
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  const credits = (micros: number) => Math.ceil(micros / MICROS_PER_CREDIT)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">
          What you&apos;ve used of your plan this billing period.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <UsageReset periodEnd={usage.periodEnd.toISOString()} />
          </CardTitle>
          <CardDescription>
            Current period: {format(usage.periodStart, "MMM d")} –{" "}
            {format(usage.periodEnd, "MMM d, yyyy")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <UsageMeter
            icon={<SparklesIcon />}
            label="AI credits"
            description="Model usage by your bots: every message they read and write."
            used={credits(usage.ai.used)}
            limit={credits(usage.ai.limit)}
            format={(n) => n.toLocaleString("en-US")}
          />
          <UsageMeter
            icon={<CpuIcon />}
            label="Sandbox time"
            description="Time your bots' computers run, including the live desktop."
            used={usage.sandbox.used}
            limit={usage.sandbox.limit}
            format={formatDuration}
          />
          <UsageMeter
            icon={<BotIcon />}
            label="Bots"
            description="Bots you have right now. Deleting one frees its slot."
            used={usage.bots.used}
            limit={usage.bots.limit}
            format={String}
            resets={false}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function UsageMeter({
  icon,
  label,
  description,
  used,
  limit,
  format,
  resets = true,
}: {
  icon: React.ReactNode
  label: string
  description: string
  used: number
  limit: number
  format: (n: number) => string
  /** Whether usage starts over with each billing period. */
  resets?: boolean
}) {
  const percent = Math.min(100, (used / limit) * 100)
  const full = used >= limit

  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={percent} className="gap-2">
        <ProgressLabel className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          {label}
        </ProgressLabel>
        <span
          className={
            full
              ? "ml-auto text-sm font-medium text-destructive tabular-nums"
              : "ml-auto text-sm text-muted-foreground tabular-nums"
          }
        >
          {format(Math.min(used, limit))} / {format(limit)}
        </span>
      </Progress>
      <p className="text-xs text-muted-foreground">
        {description}
        {!resets && " Doesn't reset."}
      </p>
    </div>
  )
}

/** Seconds as "12h 30m" (or "45m" under an hour). */
function formatDuration(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
