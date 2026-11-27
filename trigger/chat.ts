import { openai } from "@ai-sdk/openai"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import {
  hasToolCall,
  stepCountIs,
  type InferUITools,
  type UIDataTypes,
  type UIMessage,
} from "ai"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { chatMembers, chats, type bots } from "@/db/schema"
import { createHandoffTool, type HandoffTool } from "./handoff-tool"
import { createSandboxTools, type SandboxTools } from "./sandbox-tools"

/** Assistant messages carry the bot that wrote them. */
export type ChatMessageMetadata = { botId?: string }

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  // `handoff` is only given to bots in group chats.
  InferUITools<SandboxTools & { handoff: HandoffTool }>
>

type Bot = Pick<
  typeof bots.$inferSelect,
  "id" | "name" | "job" | "instructions" | "sandboxId"
>

type ChatInfo = {
  kind: (typeof chats.$inferSelect)["kind"]
  name: string | null
  bots: Bot[]
}

// Per-worker caches: a chat's members don't change, and reusing a bot's tool
// set keeps one sandbox connection per bot.
const chatsById = new Map<string, Promise<ChatInfo>>()
const toolsBySandbox = new Map<string, SandboxTools>()

function getChatInfo(chatId: string) {
  let info = chatsById.get(chatId)
  if (!info) {
    info = loadChatInfo(chatId).catch((error) => {
      chatsById.delete(chatId)
      throw error
    })
    chatsById.set(chatId, info)
  }
  return info
}

async function loadChatInfo(chatId: string): Promise<ChatInfo> {
  const row = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    columns: { kind: true, name: true },
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        columns: {},
        with: {
          bot: {
            columns: {
              id: true,
              name: true,
              job: true,
              instructions: true,
              sandboxId: true,
            },
          },
        },
      },
    },
  })
  if (!row || row.members.length === 0) {
    throw new Error(`No bots found for chat ${chatId}`)
  }
  return {
    kind: row.kind,
    name: row.name,
    bots: row.members.map((member) => member.bot),
  }
}

/**
 * The bot answering this turn: the one picked in the UI, if it's a member of
 * the chat, else the first member (always the case for direct chats).
 */
async function getTurnBot(chatId: string, botId: string | undefined) {
  const info = await getChatInfo(chatId)
  const bot = info.bots.find((b) => b.id === botId) ?? info.bots[0]
  return { info, bot }
}

function getSandboxTools(bot: Bot) {
  let tools = toolsBySandbox.get(bot.sandboxId)
  if (!tools) {
    tools = createSandboxTools(bot.sandboxId)
    toolsBySandbox.set(bot.sandboxId, tools)
  }
  return tools
}

function getTools(bot: Bot, info: ChatInfo) {
  const sandboxTools = getSandboxTools(bot)
  if (info.kind !== "group") return sandboxTools
  const teammates = info.bots.filter((b) => b.id !== bot.id)
  return { ...sandboxTools, handoff: createHandoffTool(teammates) }
}

function systemPrompt(bot: Bot, info: ChatInfo) {
  const isGroup = info.kind === "group"
  const teammates = info.bots.filter((b) => b.id !== bot.id)

  return [
    `You are ${bot.name}, an AI teammate. Your job: ${bot.job}.`,
    bot.instructions &&
      `How you should go about your job, in the words of the person you work for:\n${bot.instructions}`,
    isGroup
      ? [
          `You're in a group chat called "${info.name}" with the person you work for and these teammates:`,
          ...teammates.map(
            (b) => `- ${b.name} (id: ${b.id}), whose job is: ${b.job}`
          ),
          ``,
          `How the group chat works:`,
          `- The user picks one of you to answer each message, and this time they picked you. Only you are answering this turn; don't speak for your teammates or pretend to be them.`,
          `- The history doesn't say which of you wrote each assistant reply, so some of them are probably your teammates'. Build on what they said rather than repeating it, and never claim their work as your own.`,
          `- Each of you has your own sandbox. You can't see or touch your teammates' files, programs, or screens, and they can't see yours. If you need something a teammate made, ask the user to have them share it in the chat.`,
          `- If the user's message is clearly better suited to a teammate's job than yours, call the handoff tool with their id and a short reason instead of answering. Don't answer it yourself first, and don't hand off just because a task is hard or long.`,
          `- If the history ends with a teammate handing the user's message to you, answer that message yourself. Never hand it back to the teammate who handed it to you.`,
          ``,
          `Stay in character as ${bot.name}, keep your answers focused on your job, and be direct and concise.`,
        ].join("\n")
      : `You chat with the person you work for here. Stay in character as ${bot.name}, keep your answers focused on your job, and be direct and concise.`,
    `You have your own dedicated sandbox: an isolated Linux computer (Daytona sandbox ${bot.sandboxId}) with its own filesystem, network, and runtime. It belongs to you alone and is not shared with ${isGroup ? "your teammates" : "other teammates"}. Your home directory is /home/daytona. Python 3, Node.js, and the Chromium browser are installed, and it has an XFCE desktop on a 1024×768 screen.`,
    [
      `You use the sandbox through your tools:`,
      `- Prefer bash and the file tools for anything that can be done from the command line.`,
      `- For GUI work, look before you act: call viewScreen to see the screen, then click, type, or scroll at coordinates you read off the screenshot, and call viewScreen again to check the result.`,
      isGroup
        ? `- viewScreen is only for you; the user never sees it. When the user asks to see your screen, call showScreen instead, which puts a screenshot in the chat. There's no live view of your desktop in a group chat, so showScreen is the only way the user sees it.`
        : `- viewScreen is only for you; the user never sees it. When the user asks to see your screen, call showScreen instead.`,
      isGroup &&
        `- handoff passes the user's message to a teammate, as described above.`,
      `Never claim to have done something in the sandbox that you haven't actually done with a tool.`,
    ]
      .filter(Boolean)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
}

export const chatAgent = chat.withUIMessage<ChatUIMessage>().agent({
  id: "chat",
  // Platform snapshot storage, keyed by chatId.
  storage: defaultStorage,
  // Sent by the transport with every turn: which bot should answer.
  clientDataSchema: z.object({ botId: z.string().optional() }),
  // Sent after a bot calls the handoff tool, with the teammate it handed to as
  // the clientData botId: answer the same history again, as that teammate.
  actionSchema: z.object({ type: z.literal("handoff") }),
  onAction: async () => chat.turn(),
  // Resolved per turn, for the bot answering it. Declared on the agent so the
  // screenshot tools' toModelOutput is re-applied to earlier turns' history,
  // not just the current turn. Every bot's sandbox tools have the same shape.
  tools: async ({ chatId, clientData }) => {
    const { info, bot } = await getTurnBot(chatId, clientData?.botId)
    return getTools(bot, info)
  },
  run: async ({ chatId, clientData, messages, tools, signal, streamText }) => {
    // The prompt and the reply's author depend on the bot picked this turn.
    const { info, bot } = await getTurnBot(chatId, clientData?.botId)
    chat.prompt.set(systemPrompt(bot, info))
    chat.setUIMessageStreamOptions({
      messageMetadata: () => ({ botId: bot.id }),
    })

    return streamText({
      model: openai("gpt-6.1-terra"),
      messages,
      tools,
      abortSignal: signal,
      // A handoff ends the turn: the teammate answers in the next one.
      stopWhen: [stepCountIs(50), hasToolCall("handoff")],
    })
  },
})
