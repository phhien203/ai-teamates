"use client"

import { UserButton } from "@clerk/nextjs"

import {
  SidebarMenu,
  SidebarMenuItem,
  sidebarMenuButtonVariants,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function NavUser() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <UserButton
          showName
          appearance={{
            elements: {
              rootBox: "flex w-full",
              userButtonTrigger: cn(
                sidebarMenuButtonVariants({ size: "lg" }),
                "shadow-none focus:shadow-none"
              ),
              userButtonBox: "w-full flex-row-reverse justify-end gap-2",
              userButtonAvatarBox: "size-8 rounded-lg",
              userButtonOuterIdentifier:
                "truncate ps-0 text-sm font-medium text-inherit",
            },
          }}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
