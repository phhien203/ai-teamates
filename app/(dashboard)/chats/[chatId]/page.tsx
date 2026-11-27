import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { ChatHeader } from "@/components/chat-header"
import { ChatView } from "@/components/chat-view"
import { DesktopPanel } from "@/components/desktop-panel"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { getChat } from "@/queries/chats"

export default async function Page(props: PageProps<"/chats/[chatId]">) {
  await auth.protect()

  const { chatId } = await props.params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  // Group chats have no desktop panel: their bots each have their own sandbox.
  if (chat.kind === "group") {
    return (
      <div className="flex h-svh flex-col overflow-hidden">
        <ChatHeader chat={chat} />
        <ChatView key={chat.id} chat={chat} />
      </div>
    )
  }

  return (
    // Fixed to the viewport: only the chat's message list scrolls. Panels
    // default to `overflow: auto` on their content, so override it inline.
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-svh overflow-hidden"
    >
      <ResizablePanel
        id="chat"
        minSize="30%"
        className="flex flex-col"
        style={{ overflow: "hidden" }}
      >
        <ChatHeader chat={chat} />
        <ChatView key={chat.id} chat={chat} />
      </ResizablePanel>
      <ResizableHandle />
      {/* Toggled by the desktop button in ChatHeader. */}
      <ResizablePanel
        id="desktop"
        defaultSize="0%"
        minSize="20%"
        collapsible
        style={{ overflow: "hidden" }}
      >
        <DesktopPanel key={chat.id} chatId={chat.id} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
