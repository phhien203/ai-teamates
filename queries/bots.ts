import "server-only"

import { auth } from "@clerk/nextjs/server"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers, chats } from "@/db/schema"

/**
 * The signed-in user's chats, most recent first, each with the bot it shows.
 * Group chats fall back to their first member until they get their own face.
 */
export async function getChatsWithBot() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return []

  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    columns: {
      id: true,
      name: true,
      lastMessagePreview: true,
      lastMessageAt: true,
    },
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        limit: 1,
        columns: {},
        with: {
          bot: { columns: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  return rows.flatMap(({ members, ...chat }) => {
    const bot = members[0]?.bot
    return bot ? [{ ...chat, bot }] : []
  })
}

export type ChatWithBot = Awaited<ReturnType<typeof getChatsWithBot>>[number]
