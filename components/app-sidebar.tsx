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
import { getChatsWithBot } from "@/queries/bots"

export function AppSidebar() {
  const chatsPromise = getChatsWithBot()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <NavActions />
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
