"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { SidebarMenuButton } from "@/components/ui/sidebar"

export function NavChatButton({
  chatId,
  ...props
}: Omit<React.ComponentProps<typeof SidebarMenuButton>, "render" | "isActive"> & {
  chatId: string
}) {
  const params = useParams<{ chatId?: string }>()
  const isActive = params.chatId === chatId

  return (
    <SidebarMenuButton
      isActive={isActive}
      aria-current={isActive ? "page" : undefined}
      render={<Link href={`/chats/${chatId}`} />}
      {...props}
    />
  )
}
