"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers, chats } from "@/db/schema"
import { getBotDesktopUrl } from "@/lib/daytona"
import type { LoadTranscriptResult } from "@trigger.dev/sdk/chat/react"
import type { ChatUIMessage, chatAgent } from "@/trigger/chat"

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
}): Promise<LoadTranscriptResult<ChatUIMessage>> {
  await assertChatOwner(params.chatId)
  // The stored messages were produced by chatAgent, so they carry its tool parts.
  return (await load(params)) as LoadTranscriptResult<ChatUIMessage>
}

/** Signed noVNC URL for the desktop of the chat's bot. */
export async function getChatDesktopUrl(
  chatId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "Unauthorized" }

  const row = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: {},
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        limit: 1,
        columns: {},
        with: { bot: { columns: { sandboxId: true } } },
      },
    },
  })
  const sandboxId = row?.members[0]?.bot.sandboxId
  if (!sandboxId) return { ok: false, error: "Chat not found" }

  try {
    return { ok: true, url: await getBotDesktopUrl(sandboxId) }
  } catch (error) {
    console.error("Failed to open desktop for sandbox", sandboxId, error)
    return { ok: false, error: "Couldn't start the desktop. Try again." }
  }
}
