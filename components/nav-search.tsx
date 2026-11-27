"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { ChatWithBots } from "@/queries/bots"

type NavSearchProps = {
  chatsPromise: Promise<ChatWithBots[]>
}

export function NavSearch({ chatsPromise }: NavSearchProps) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 w-full justify-start rounded-lg border-input bg-transparent px-2.5 font-normal text-muted-foreground group-data-[collapsible=icon]:hidden dark:bg-input/30"
      >
        <SearchIcon data-icon="inline-start" />
        Search
        <KbdGroup className="ml-auto">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Search" onClick={() => setOpen(true)}>
            <SearchIcon />
            <span>Search</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search chats"
        description="Search for a chat to open..."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <React.Suspense>
              <ChatResults
                chatsPromise={chatsPromise}
                onSelect={() => setOpen(false)}
              />
            </React.Suspense>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

function ChatResults({
  chatsPromise,
  onSelect,
}: NavSearchProps & { onSelect: () => void }) {
  const chats = React.use(chatsPromise)
  const router = useRouter()

  return (
    <CommandGroup heading="Chats">
      {chats.map((chat) => (
        <CommandItem
          key={chat.id}
          value={chat.id}
          keywords={[chat.name ?? chat.bots[0].name]}
          onSelect={() => {
            onSelect()
            router.push(`/chats/${chat.id}`)
          }}
        >
          <GroupChatAvatar bots={chat.bots} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">
              {chat.name ?? chat.bots[0].name}
            </span>
            {chat.lastMessagePreview && (
              <span className="truncate text-xs text-muted-foreground">
                {chat.lastMessagePreview}
              </span>
            )}
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
