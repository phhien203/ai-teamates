import { Suspense } from "react"

import { NavActions } from "@/components/nav-actions"
import { NavChats, NavChatsSkeleton } from "@/components/nav-chats"
import { NavSearch } from "@/components/nav-search"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { getBots, getChatsWithBots } from "@/queries/bots"

export function AppSidebar() {
  const chatsPromise = getChatsWithBots()
  const botsPromise = getBots()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <NavActions botsPromise={botsPromise} />
        <NavSearch chatsPromise={chatsPromise} />
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<NavChatsSkeleton />}>
          <NavChats />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
