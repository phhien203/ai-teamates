import "server-only"

import { cache } from "react"
import { auth } from "@clerk/nextjs/server"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { bots, chatMembers, chats } from "@/db/schema"

/** The signed-in user's bots, oldest first. */
export const getBots = cache(async () => {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return []

  return db.query.bots.findMany({
    where: eq(bots.userId, userId),
    orderBy: asc(bots.createdAt),
    columns: { id: true, name: true, avatar: true },
  })
})

export type BotSummary = Awaited<ReturnType<typeof getBots>>[number]

/**
 * The signed-in user's chats, most recent first, each with its bots in the
 * order they joined. Direct chats have exactly one.
 */
export const getChatsWithBots = cache(async () => {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return []

  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    columns: {
      id: true,
      kind: true,
      name: true,
      lastMessagePreview: true,
      lastMessageAt: true,
    },
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        columns: {},
        with: {
          bot: { columns: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  return rows.flatMap(({ members, ...chat }) =>
    members.length > 0
      ? [{ ...chat, bots: members.map((member) => member.bot) }]
      : []
  )
})

export type ChatWithBots = Awaited<ReturnType<typeof getChatsWithBots>>[number]
