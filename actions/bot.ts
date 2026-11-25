"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { db } from "@/db"
import { bots, insertBotSchema, type InsertBot } from "@/db/schema"

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

  const [bot] = await db
    .insert(bots)
    .values({
      ...parsed.data,
      instructions: parsed.data.instructions || null,
      userId,
    })
    .returning({ id: bots.id })

  revalidatePath("/")
  return { ok: true, id: bot.id }
}
