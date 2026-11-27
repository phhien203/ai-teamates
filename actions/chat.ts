"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { and, asc, eq, inArray, notInArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { nanoid } from "nanoid"
import { z } from "zod"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  insertGroupChatSchema,
  type InsertGroupChat,
} from "@/db/schema"
import {
  FEATURES,
  hasFeatures,
  UPGRADE_REQUIRED,
  usageLimitReached,
  type UpgradeRequired,
  type UsageLimitReached,
} from "@/lib/billing"
import { meterSandboxUse, UsageLimitError } from "@/lib/usage"
import { getBotDesktopUrl } from "@/lib/daytona"
import type { LoadTranscriptResult } from "@trigger.dev/sdk/chat/react"
import type { ChatUIMessage, chatAgent } from "@/trigger/chat"

const start = chat.createStartSessionAction<typeof chatAgent>("chat")
const load = chat.createLoadTranscriptAction(defaultStorage)

/**
 * Throws unless the signed-in user owns the chat. With `requirePlan`, also
 * throws unless their plan covers talking to bots (whose turns use sandboxes).
 */
async function assertChatOwner(chatId: string, requirePlan = false) {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  if (requirePlan && !hasFeatures(has, FEATURES.bots, FEATURES.sandboxes)) {
    throw new Error(UPGRADE_REQUIRED.error)
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: { id: true },
  })
  if (!chat) throw new Error("Chat not found")
}

export type CreateGroupChatResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | UpgradeRequired

export async function createGroupChat(
  input: InsertGroupChat
): Promise<CreateGroupChatResult> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }
  if (!hasFeatures(has, FEATURES.bots)) return UPGRADE_REQUIRED

  const parsed = insertGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const botIds = [...new Set(parsed.data.botIds)]
  if (!(await ownsBots(userId, botIds))) return MISSING_BOTS

  const chatId = nanoid()
  // Members are ordered by joinedAt, so stagger it to keep the picked order.
  const now = Date.now()
  await db.batch([
    db
      .insert(chats)
      .values({ id: chatId, userId, kind: "group", name: parsed.data.name }),
    db.insert(chatMembers).values(
      botIds.map((botId, i) => ({
        chatId,
        botId,
        joinedAt: new Date(now + i),
      }))
    ),
  ])

  revalidatePath("/", "layout")
  return { ok: true, id: chatId }
}

export type UpdateGroupChatResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | UpgradeRequired

export async function updateGroupChat(
  id: string,
  input: InsertGroupChat
): Promise<UpdateGroupChatResult> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }
  if (!hasFeatures(has, FEATURES.bots)) return UPGRADE_REQUIRED

  const parsed = insertGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const botIds = [...new Set(parsed.data.botIds)]
  if (!(await ownsBots(userId, botIds))) return MISSING_BOTS

  const updated = await db
    .update(chats)
    .set({ name: parsed.data.name })
    .where(
      and(eq(chats.id, id), eq(chats.userId, userId), eq(chats.kind, "group"))
    )
    .returning({ id: chats.id })
  if (updated.length === 0) return { ok: false, error: "Group not found." }

  // Removed bots leave; new ones join after the current members, in the
  // picked order. Bots that stay keep their place.
  const now = Date.now()
  await db.batch([
    db
      .delete(chatMembers)
      .where(
        and(eq(chatMembers.chatId, id), notInArray(chatMembers.botId, botIds))
      ),
    db
      .insert(chatMembers)
      .values(
        botIds.map((botId, i) => ({
          chatId: id,
          botId,
          joinedAt: new Date(now + i),
        }))
      )
      .onConflictDoNothing(),
  ])

  revalidatePath("/", "layout")
  return { ok: true }
}

export type DeleteGroupChatResult = { ok: true } | { ok: false; error: string }

// Not gated: free users can always clean up what they have.
export async function deleteGroupChat(
  id: string
): Promise<DeleteGroupChatResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }

  // Members go with it via the cascade; the bots themselves stay.
  const deleted = await db
    .delete(chats)
    .where(
      and(eq(chats.id, id), eq(chats.userId, userId), eq(chats.kind, "group"))
    )
    .returning({ id: chats.id })
  if (deleted.length === 0) return { ok: false, error: "Group not found." }

  revalidatePath("/", "layout")
  return { ok: true }
}

const MISSING_BOTS: {
  ok: false
  error: string
  fieldErrors: Record<string, string[]>
} = {
  ok: false,
  error: "Some of those bots no longer exist.",
  fieldErrors: { botIds: ["Pick bots from your list."] },
}

/** Whether every one of `botIds` is a bot the user owns. */
async function ownsBots(userId: string, botIds: string[]) {
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, botIds)))
  return owned.length === botIds.length
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof chatAgent>
) {
  await assertChatOwner(params.chatId, true)
  return start(params)
}

export async function mintChatAccessToken(chatId: string) {
  await assertChatOwner(chatId, true)
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

// Not gated: free users can still read their chat history.
export async function loadTranscript(params: {
  chatId: string
  limit?: number
}): Promise<LoadTranscriptResult<ChatUIMessage>> {
  await assertChatOwner(params.chatId)
  // The stored messages were produced by chatAgent, so they carry its tool parts.
  return (await load(params)) as LoadTranscriptResult<ChatUIMessage>
}

type DesktopResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string }
  | UpgradeRequired
  | UsageLimitReached

/**
 * The bot behind a direct chat's desktop, after checking and charging its
 * sandbox time. Returns a failure result instead when that's not allowed.
 */
async function openChatDesktop(
  chatId: string
): Promise<DesktopResult<{ sandboxId: string }>> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) return { ok: false, error: "Unauthorized" }
  if (!hasFeatures(has, FEATURES.sandboxes)) return UPGRADE_REQUIRED

  const row = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: {},
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        limit: 1,
        columns: {},
        with: { bot: { columns: { id: true, sandboxId: true } } },
      },
    },
  })
  const bot = row?.members[0]?.bot
  if (!bot) return { ok: false, error: "Chat not found" }

  try {
    await meterSandboxUse(bot.id)
  } catch (error) {
    if (!(error instanceof UsageLimitError)) throw error
    return error.reason === "plan"
      ? UPGRADE_REQUIRED
      : usageLimitReached("sandbox")
  }
  return { ok: true, sandboxId: bot.sandboxId }
}

/** Signed noVNC URL for the desktop of the chat's bot. */
export async function getChatDesktopUrl(
  chatId: string
): Promise<DesktopResult<{ url: string }>> {
  const result = await openChatDesktop(chatId)
  if (!result.ok) return result
  const { sandboxId } = result

  try {
    return { ok: true, url: await getBotDesktopUrl(sandboxId) }
  } catch (error) {
    console.error("Failed to open desktop for sandbox", sandboxId, error)
    return { ok: false, error: "Couldn't start the desktop. Try again." }
  }
}

/**
 * Sent periodically while the desktop is open: watching it keeps the sandbox
 * running, so it's metered like any other use. A failure means disconnect.
 */
export async function pingChatDesktop(
  chatId: string
): Promise<DesktopResult<object>> {
  return openChatDesktop(chatId)
}
