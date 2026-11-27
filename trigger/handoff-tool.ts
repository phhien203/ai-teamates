import { tool } from "ai"
import { z } from "zod"

type Teammate = { id: string; name: string; job: string }

/**
 * Group chats only: passes the user's latest message to a teammate better
 * suited to it. Calling it ends the caller's turn; the frontend then asks the
 * agent to answer again as the teammate (see the `handoff` action).
 */
export function createHandoffTool(teammates: Teammate[]) {
  return tool({
    description:
      "Hand the user's latest message to a teammate in this group chat whose job fits it better than yours. Your turn ends when you call it and the teammate answers next, so don't answer the message yourself.",
    inputSchema: z.object({
      botId: z
        .string()
        .describe("The id of the teammate to hand the message to."),
      reason: z
        .string()
        .describe(
          "One short sentence, shown to the user, on why the teammate is better suited."
        ),
    }),
    execute: async ({ botId, reason }) => {
      const teammate = teammates.find((t) => t.id === botId)
      if (!teammate) {
        throw new Error(
          `No teammate with id ${botId}. Pick one of: ${teammates.map((t) => `${t.id} (${t.name})`).join(", ")}.`
        )
      }
      return { botId: teammate.id, name: teammate.name, reason }
    },
  })
}

export type HandoffTool = ReturnType<typeof createHandoffTool>
