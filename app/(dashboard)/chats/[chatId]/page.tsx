import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { ChatHeader } from "@/components/chat-header"
import { ChatView } from "@/components/chat-view"
import { getChat } from "@/queries/chats"

export default async function Page(props: PageProps<"/chats/[chatId]">) {
  await auth.protect()

  const { chatId } = await props.params
  const chat = await getChat(chatId)
  if (!chat) notFound()

  return (
    <div className="flex h-svh flex-col">
      <ChatHeader chat={chat} />
      <ChatView key={chat.id} chatId={chat.id} />
    </div>
  )
}
