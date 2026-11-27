"use client"

import * as React from "react"
import { format, formatDistanceToNowStrict } from "date-fns"

/** Time left until the billing period ends, in the viewer's time zone. */
export function UsageReset({ periodEnd }: { periodEnd: string }) {
  const end = new Date(periodEnd)
  const [now, setNow] = React.useState<number | null>(null)

  // Rendered on the client only (relative time and local time zone), and
  // refreshed every minute.
  React.useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])

  if (now === null) return <span className="text-muted-foreground">…</span>
  if (end.getTime() <= now) return <span>Resetting now</span>

  return (
    <span>
      Resets in{" "}
      <span className="font-medium">
        {formatDistanceToNowStrict(end, { roundingMethod: "floor" })}
      </span>
      <span className="text-muted-foreground">
        {" "}
        · {format(end, "MMM d 'at' h:mm a")}
      </span>
    </span>
  )
}
