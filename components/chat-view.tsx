"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import { isStaticToolUIPart } from "ai"

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { ToolCall } from "@/components/tool-call"
import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { ChatUIMessage, chatAgent } from "@/trigger/chat"

export function ChatView({ chatId }: { chatId: string }) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })
  const { messages, isLoading } = useLoadTranscript(chatId, loadTranscript, {
    transport,
  })

  // useChat must mount with the loaded transcript as its initial messages.
  if (isLoading) return <div className="flex-1" />

  return (
    <ChatSession
      chatId={chatId}
      initialMessages={messages}
      transport={transport}
    />
  )
}

function ChatSession({
  chatId,
  initialMessages,
  transport,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
  transport: ReturnType<typeof useTriggerChatTransport<typeof chatAgent>>
}) {
  const { messages, sendMessage, status, stop } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
  })

  function handleSubmit(message: PromptInputMessage) {
    if (!message.text.trim()) return
    sendMessage({ text: message.text })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <MessageResponse key={`${message.id}-${i}`}>
                        {part.text}
                      </MessageResponse>
                    )
                  }
                  if (isStaticToolUIPart(part)) {
                    return <ToolCall key={part.toolCallId} part={part} />
                  }
                  return null
                })}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl p-4 pt-0">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
