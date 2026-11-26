import { openai } from "@ai-sdk/openai"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"

export const chatAgent = chat.agent({
  id: "chat",
  // Platform snapshot storage, keyed by chatId.
  storage: defaultStorage,
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: openai("gpt-6.1-terra"),
      messages,
      abortSignal: signal,
    }),
})
