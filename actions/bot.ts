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
import {
  FEATURES,
  hasFeatures,
  UPGRADE_REQUIRED,
  usageLimitReached,
  type UpgradeRequired,
  type UsageLimitReached,
} from "@/lib/billing"
import { checkAllowance } from "@/lib/usage"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"

export type CreateBotResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | UpgradeRequired
  | UsageLimitReached

export async function createBot(input: InsertBot): Promise<CreateBotResult> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }
  // Every bot comes with its own sandbox.
  if (!hasFeatures(has, FEATURES.bots, FEATURES.sandboxes)) {
    return UPGRADE_REQUIRED
  }
  // Each bot holds a sandbox, which costs disk even when stopped.
  const blocked = await checkAllowance(userId, "bots", "sandbox")
  if (blocked === "plan") return UPGRADE_REQUIRED
  if (blocked) return usageLimitReached(blocked)

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

  let sandboxId: string
  try {
    sandboxId = await createBotSandbox({ id: botId, userId })
  } catch (error) {
    console.error("Failed to create sandbox for bot", botId, error)
    return { ok: false, error: "Couldn't set up the bot's sandbox. Try again." }
  }

  try {
    await db.batch([
      db.insert(bots).values({
        ...parsed.data,
        id: botId,
        instructions: parsed.data.instructions || null,
        userId,
        sandboxId,
      }),
      db.insert(chats).values({ id: chatId, userId, kind: "direct" }),
      db.insert(chatMembers).values({ chatId, botId }),
    ])
  } catch (error) {
    // Don't leave an orphaned sandbox behind if the bot never got saved.
    await deleteBotSandbox(sandboxId).catch((cleanupError) =>
      console.error("Failed to clean up sandbox", sandboxId, cleanupError)
    )
    throw error
  }

  revalidatePath("/")
  return { ok: true, id: botId }
}

export type UpdateBotResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | UpgradeRequired

export async function updateBot(
  id: string,
  input: InsertBot
): Promise<UpdateBotResult> {
  const { isAuthenticated, userId, has } = await auth()
  if (!isAuthenticated) return { ok: false, error: "You must be signed in." }
  if (!hasFeatures(has, FEATURES.bots)) return UPGRADE_REQUIRED

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

// Not gated: free users can always clean up (and free) what they have.
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
      .returning({ id: bots.id, sandboxId: bots.sandboxId }),
  ])

  if (deleted.length === 0) return { ok: false, error: "Bot not found." }

  // The bot is already gone, so a failed sandbox delete is logged, not surfaced.
  const { sandboxId } = deleted[0]
  await deleteBotSandbox(sandboxId).catch((error) =>
    console.error("Failed to delete sandbox", sandboxId, error)
  )

  revalidatePath("/", "layout")
  return { ok: true }
}
