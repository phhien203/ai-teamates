import { formatDistanceToNowStrict } from "date-fns"

import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { NavChatButton } from "@/components/nav-chat-button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { getChatsWithBots } from "@/queries/bots"

export async function NavChats() {
  const chats = await getChatsWithBots()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <NavChatButton
                chatId={chat.id}
                size="lg"
                tooltip={chat.name ?? chat.bots[0].name}
              >
                <GroupChatAvatar bots={chat.bots} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {chat.name ?? chat.bots[0].name}
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
              </NavChatButton>
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
              <div className="flex h-12 items-center gap-2 p-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1 group-data-[collapsible=icon]:hidden" />
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
