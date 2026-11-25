import { Suspense } from "react"

import { NavActions } from "@/components/nav-actions"
import { NavChats, NavChatsSkeleton } from "@/components/nav-chats"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <NavActions />
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<NavChatsSkeleton />}>
          <NavChats />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
