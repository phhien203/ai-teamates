import "server-only"

import { cache } from "react"
import { auth } from "@clerk/nextjs/server"
import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers, chats } from "@/db/schema"

/**
 * One of the signed-in user's chats with its bots in the order they joined,
 * or `null` when it doesn't exist or belongs to someone else.
 */
export const getChat = cache(async (chatId: string) => {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return null

  const row = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    columns: { id: true, kind: true, name: true },
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        columns: {},
        with: {
          bot: {
            columns: {
              id: true,
              name: true,
              avatar: true,
              job: true,
              instructions: true,
            },
          },
        },
      },
    },
  })

  if (!row || row.members.length === 0) return null

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    bots: row.members.map((member) => member.bot),
  }
})

export type Chat = NonNullable<Awaited<ReturnType<typeof getChat>>>
