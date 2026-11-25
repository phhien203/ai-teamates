"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
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
