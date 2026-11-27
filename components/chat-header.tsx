"use client"

import { MonitorIcon } from "lucide-react"
import { useParentGroup } from "react-resizable-panels"

import { BotDialog } from "@/components/bot-dialog"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import type { BotSummary } from "@/queries/bots"
import type { Chat } from "@/queries/chats"

// Panel ids defined in app/(dashboard)/chats/[chatId]/page.tsx.
const CHAT_PANEL_ID = "chat"
const DESKTOP_PANEL_ID = "desktop"

export function ChatHeader({
  chat,
  botsPromise,
}: {
  chat: Chat
  /** The user's bots, for editing a group chat's members. */
  botsPromise: Promise<BotSummary[]>
}) {
  const group = useParentGroup()

  function toggleDesktop() {
    if (!group) return
    const isOpen = (group.getLayout()[DESKTOP_PANEL_ID] ?? 0) > 0
    group.setLayout(
      isOpen
        ? { [CHAT_PANEL_ID]: 100, [DESKTOP_PANEL_ID]: 0 }
        : { [CHAT_PANEL_ID]: 60, [DESKTOP_PANEL_ID]: 40 }
    )
  }

  // Group chats edit the group rather than a bot, and have no desktop.
  if (chat.kind === "group") {
    const name = chat.name ?? ""
    return (
      <header className="flex h-12 shrink-0 items-center gap-2 px-2">
        <GroupChatDialog
          chat={{
            id: chat.id,
            name,
            botIds: chat.bots.map((bot) => bot.id),
          }}
          botsPromise={botsPromise}
        >
          <Button
            type="button"
            variant="ghost"
            aria-label={`Edit ${name}`}
            className="min-w-0"
          >
            <GroupChatAvatar bots={chat.bots} className="size-5" />
            <span className="truncate text-sm font-medium">{name}</span>
          </Button>
        </GroupChatDialog>
      </header>
    )
  }

  const [bot] = chat.bots

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-2">
      <BotDialog bot={bot}>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Edit ${bot.name}`}
          className="min-w-0"
        >
          <GroupChatAvatar bots={chat.bots} className="size-5" />
          <span className="truncate text-sm font-medium">
            {chat.name ?? bot.name}
          </span>
        </Button>
      </BotDialog>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Toggle desktop"
        onClick={toggleDesktop}
        className="text-muted-foreground"
      >
        <MonitorIcon />
      </Button>
    </header>
  )
}
