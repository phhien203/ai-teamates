"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  insertBotSchema,
  type InsertBot,
} from "@/db/schema"

export type CreateBotResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function createBot(input: InsertBot): Promise<CreateBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }

  const parsed = insertBotSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  // IDs are generated up front so the member row can reference both inserts
  // within a single batch (which runs as one transaction).
  const botId = nanoid()
  const chatId = nanoid()

  await db.batch([
    db.insert(bots).values({
      ...parsed.data,
      id: botId,
      instructions: parsed.data.instructions || null,
      userId,
    }),
    db.insert(chats).values({ id: chatId, userId, kind: "direct" }),
    db.insert(chatMembers).values({ chatId, botId }),
  ])

  revalidatePath("/")
  return { ok: true, id: botId }
}

export type UpdateBotResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export async function updateBot(
  id: string,
  input: InsertBot
): Promise<UpdateBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }

  const parsed = insertBotSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const updated = await db
    .update(bots)
    .set({
      ...parsed.data,
      instructions: parsed.data.instructions || null,
    })
    .where(and(eq(bots.id, id), eq(bots.userId, userId)))
    .returning({ id: bots.id })

  if (updated.length === 0) return { ok: false, error: "Bot not found." }

  // The bot's name and face show in the sidebar and every chat it's in.
  revalidatePath("/", "layout")
  return { ok: true }
}

export type DeleteBotResult = { ok: true } | { ok: false; error: string }

export async function deleteBot(id: string): Promise<DeleteBotResult> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }

  // Direct chats can't outlive their only bot, so they go with it. Group chats
  // just lose the member via the cascade on chat_members.
  const [, deleted] = await db.batch([
    db
      .delete(chats)
      .where(
        and(
          eq(chats.userId, userId),
          eq(chats.kind, "direct"),
          inArray(
            chats.id,
            db
              .select({ chatId: chatMembers.chatId })
              .from(chatMembers)
              .where(eq(chatMembers.botId, id))
          )
        )
      ),
    db
      .delete(bots)
      .where(and(eq(bots.id, id), eq(bots.userId, userId)))
      .returning({ id: bots.id }),
  ])

  if (deleted.length === 0) return { ok: false, error: "Bot not found." }

  revalidatePath("/", "layout")
  return { ok: true }
}
