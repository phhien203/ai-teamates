import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import type { Chat } from "@/queries/chats"

export function ChatHeader({ chat }: { chat: Chat }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-2">
      <BotDialog bot={chat.bot}>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Edit ${chat.bot.name}`}
          className="min-w-0"
        >
          <ChatAvatar seed={chat.bot.avatar} className="size-5" />
          <span className="truncate text-sm font-medium">
            {chat.name ?? chat.bot.name}
          </span>
        </Button>
      </BotDialog>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Desktop"
        className="text-muted-foreground"
      >
        <MonitorIcon />
      </Button>
    </header>
  )
}
