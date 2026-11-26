"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"
import type { chatAgent } from "@/trigger/chat"

const start = chat.createStartSessionAction<typeof chatAgent>("chat")
const load = chat.createLoadTranscriptAction(defaultStorage)

/** Throws unless the signed-in user owns the chat. */
async function assertChatOwner(chatId: string) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: { id: true },
  })
  if (!chat) throw new Error("Chat not found")
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof chatAgent>
) {
  await assertChatOwner(params.chatId)
  return start(params)
}

export async function mintChatAccessToken(chatId: string) {
  await assertChatOwner(chatId)
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function loadTranscript(params: {
  chatId: string
  limit?: number
}) {
  await assertChatOwner(params.chatId)
  return load(params)
}
