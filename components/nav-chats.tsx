import Link from "next/link"
import { formatDistanceToNowStrict } from "date-fns"

import { ChatAvatar } from "@/components/chat-avatar"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"
import { getChatsWithBot } from "@/queries/bots"

export async function NavChats() {
  const chats = await getChatsWithBot()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                size="lg"
                render={<Link href={`/chats/${chat.id}`} />}
              >
                <ChatAvatar seed={chat.bot.avatar} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {chat.name ?? chat.bot.name}
                    </span>
                    <time
                      dateTime={chat.lastMessageAt.toISOString()}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatDistanceToNowStrict(chat.lastMessageAt)}
                    </time>
                  </div>
                  {chat.lastMessagePreview && (
                    <span className="truncate text-xs text-muted-foreground">
                      {chat.lastMessagePreview}
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function NavChatsSkeleton() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {Array.from({ length: 3 }, (_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
