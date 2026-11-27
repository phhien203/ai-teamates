"use client"

import { MonitorIcon } from "lucide-react"
import { useParentGroup } from "react-resizable-panels"

import { BotDialog } from "@/components/bot-dialog"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import type { Chat } from "@/queries/chats"

// Panel ids defined in app/(dashboard)/chats/[chatId]/page.tsx.
const CHAT_PANEL_ID = "chat"
const DESKTOP_PANEL_ID = "desktop"

export function ChatHeader({ chat }: { chat: Chat }) {
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

  // Group chats have no bot of their own to edit and no desktop to show.
  if (chat.kind === "group") {
    return (
      <header className="flex h-12 shrink-0 items-center gap-2 px-2">
        <div className="flex min-w-0 items-center gap-2 px-2.5">
          <GroupChatAvatar bots={chat.bots} className="size-5" />
          <span className="truncate text-sm font-medium">{chat.name}</span>
        </div>
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
