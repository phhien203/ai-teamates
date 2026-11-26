import { openai } from "@ai-sdk/openai"
import {
  chat,
  defaultStorage,
  type InferChatUIMessageFromTools,
} from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { chatMembers, type bots } from "@/db/schema"
import { createSandboxTools, type SandboxTools } from "./sandbox-tools"

export type ChatUIMessage = InferChatUIMessageFromTools<SandboxTools>

type Bot = Pick<
  typeof bots.$inferSelect,
  "name" | "job" | "instructions" | "sandboxId"
>

// Per-worker caches, keyed by chatId: the bot doesn't change mid-chat, and
// reusing the tool set keeps one sandbox connection per chat.
const botsByChat = new Map<string, Promise<Bot>>()
const toolsByChat = new Map<string, SandboxTools>()

function getBot(chatId: string) {
  let bot = botsByChat.get(chatId)
  if (!bot) {
    bot = loadBot(chatId).catch((error) => {
      botsByChat.delete(chatId)
      throw error
    })
    botsByChat.set(chatId, bot)
  }
  return bot
}

async function loadBot(chatId: string): Promise<Bot> {
  const member = await db.query.chatMembers.findFirst({
    where: eq(chatMembers.chatId, chatId),
    with: {
      bot: {
        columns: { name: true, job: true, instructions: true, sandboxId: true },
      },
    },
  })
  if (!member) throw new Error(`No bot found for chat ${chatId}`)
  return member.bot
}

function systemPrompt(bot: Bot) {
  return [
    `You are ${bot.name}, an AI teammate. Your job: ${bot.job}.`,
    bot.instructions &&
      `How you should go about your job, in the words of the person you work for:\n${bot.instructions}`,
    `You chat with the person you work for here. Stay in character as ${bot.name}, keep your answers focused on your job, and be direct and concise.`,
    `You have your own dedicated sandbox: an isolated Linux computer (Daytona sandbox ${bot.sandboxId}) with its own filesystem, network, and runtime. It belongs to you alone and is not shared with other teammates. Your home directory is /home/daytona. Python 3, Node.js, and the Chromium browser are installed, and it has an XFCE desktop on a 1024×768 screen.`,
    [
      `You use the sandbox through your tools:`,
      `- Prefer bash and the file tools for anything that can be done from the command line.`,
      `- For GUI work, look before you act: call viewScreen to see the screen, then click, type, or scroll at coordinates you read off the screenshot, and call viewScreen again to check the result.`,
      `- viewScreen is only for you; the user never sees it. When the user asks to see your screen, call showScreen instead.`,
      `Never claim to have done something in the sandbox that you haven't actually done with a tool.`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n")
}

export const chatAgent = chat.withUIMessage<ChatUIMessage>().agent({
  id: "chat",
  // Platform snapshot storage, keyed by chatId.
  storage: defaultStorage,
  // onBoot fires on every fresh worker, including continuation runs, so the
  // prompt is set no matter which run picks the chat up.
  onBoot: async ({ chatId }) => {
    chat.prompt.set(systemPrompt(await getBot(chatId)))
  },
  // Declared on the agent so the screenshot tools' toModelOutput is re-applied
  // to earlier turns' history, not just the current turn.
  tools: async ({ chatId }) => {
    let tools = toolsByChat.get(chatId)
    if (!tools) {
      tools = createSandboxTools((await getBot(chatId)).sandboxId)
      toolsByChat.set(chatId, tools)
    }
    return tools
  },
  run: async ({ messages, tools, signal, streamText }) =>
    streamText({
      model: openai("gpt-6.1-terra"),
      messages,
      tools,
      abortSignal: signal,
      stopWhen: stepCountIs(50),
    }),
})
