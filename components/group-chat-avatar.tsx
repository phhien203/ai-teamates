import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"

const MAX_VISIBLE = 3

// Slots inside the square, per number of items (avatars plus the "+N" count).
// Two sit side by side, overlapping; three form a triangle; four fill a 2×2 grid.
const SLOTS: Record<number, string[]> = {
  2: [
    "top-1/2 left-0 size-[62.5%] -translate-y-1/2",
    "top-1/2 right-0 size-[62.5%] -translate-y-1/2",
  ],
  3: [
    "top-0 left-1/4 size-1/2",
    "bottom-0 left-0 size-1/2",
    "right-0 bottom-0 size-1/2",
  ],
  4: [
    "top-0 left-0 size-1/2",
    "top-0 right-0 size-1/2",
    "bottom-0 left-0 size-1/2",
    "right-0 bottom-0 size-1/2",
  ],
}

type GroupChatAvatarProps = {
  bots: { id: string; avatar: string }[]
  className?: string
}

/**
 * The face of a chat: one bot's avatar for a direct chat, or up to three bot
 * avatars plus a "+N" count for a group. Always takes up the same square as a
 * single `ChatAvatar` (size-8 unless `className` overrides it).
 */
export function GroupChatAvatar({ bots, className }: GroupChatAvatarProps) {
  if (bots.length <= 1) {
    return <ChatAvatar seed={bots[0]?.avatar ?? ""} className={className} />
  }

  const visible = bots.slice(0, MAX_VISIBLE)
  const rest = bots.length - visible.length
  const slots = SLOTS[visible.length + (rest > 0 ? 1 : 0)]

  return (
    <div
      aria-hidden
      className={cn("@container relative size-8 shrink-0", className)}
    >
      {visible.map((bot, i) => (
        <ChatAvatar
          key={bot.id}
          seed={bot.avatar}
          className={cn("absolute", slots[i])}
        />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-muted text-[25cqw] leading-none font-medium text-muted-foreground tabular-nums",
            slots[visible.length]
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  )
}
