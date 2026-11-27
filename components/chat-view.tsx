"use client"

import * as React from "react"
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
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { ChatAvatar } from "@/components/chat-avatar"
import { Badge } from "@/components/ui/badge"
import { ToolCall } from "@/components/tool-call"
import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { Chat } from "@/queries/chats"
import type { ChatUIMessage, chatAgent } from "@/trigger/chat"

type ChatBot = Chat["bots"][number]

const MAX_HANDOFFS = 2

export function ChatView({ chat }: { chat: Chat }) {
  const chatId = chat.id
  // The bot that answers the next message. Direct chats only have the one.
  const [botId, setBotId] = React.useState(chat.bots[0].id)

  // The selected bot travels as transport metadata (clientData): the transport
  // live-updates it and sends it with every turn.
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    clientData: { botId },
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
      bots={chat.kind === "group" ? chat.bots : null}
      botId={botId}
      onBotChange={setBotId}
    />
  )
}

function ChatSession({
  chatId,
  initialMessages,
  transport,
  bots,
  botId,
  onBotChange,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
  transport: ReturnType<typeof useTriggerChatTransport<typeof chatAgent>>
  /** The group's bots, or `null` for a direct chat (no picker). */
  bots: ChatBot[] | null
  botId: string
  onBotChange: (botId: string) => void
}) {
  // The teammate a bot just handed the conversation to, waiting for the
  // finished turn to settle before it's asked to answer.
  const pendingHandoff = React.useRef<string | null>(null)
  // Handoffs since the user's last message, so bots can't pass it around
  // forever.
  const handoffCount = React.useRef(0)

  const { messages, sendMessage, status, stop } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: ({ message, isAbort, isError }) => {
      if (!bots || isAbort || isError) return
      const handoff = message.parts.findLast(
        (part) => part.type === "tool-handoff"
      )
      if (
        handoff?.state === "output-available" &&
        handoffCount.current < MAX_HANDOFFS
      ) {
        handoffCount.current += 1
        pendingHandoff.current = handoff.output.botId
      }
    },
  })

  // Hand off once the chat is idle: select the teammate (so they also answer
  // what comes next) and ask the agent to answer again as them. The botId goes
  // as transport metadata, like every turn's.
  React.useEffect(() => {
    const botId = pendingHandoff.current
    if (status !== "ready" || !botId) return
    pendingHandoff.current = null
    onBotChange(botId)
    void sendMessage(undefined, {
      body: { action: { type: "handoff" } },
      metadata: { botId },
    })
  }, [status, onBotChange, sendMessage])

  function handleSubmit(message: PromptInputMessage) {
    if (!message.text.trim()) return
    handoffCount.current = 0
    // Recorded on the message itself (not just the request), so the transcript
    // shows which bot each prompt was for.
    sendMessage({ text: message.text, metadata: { botId } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.map((message) => {
            // In group chats, each prompt starts with the bot it was for.
            const recipient =
              bots && message.role === "user"
                ? bots.find((bot) => bot.id === message.metadata?.botId)
                : undefined

            const parts = message.parts.map((part, i) => {
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
            })

            const content = (
              <MessageContent>
                {recipient ? (
                  // The badge floats so the message's first line runs on
                  // beside it, like an @-mention. flow-root contains the float.
                  <div className="flow-root">
                    <Badge
                      variant="outline"
                      className="float-left mr-1.5 max-w-40 pl-0.5"
                    >
                      <ChatAvatar seed={recipient.avatar} className="size-4" />
                      <span className="min-w-0 truncate">{recipient.name}</span>
                    </Badge>
                    {parts}
                  </div>
                ) : (
                  parts
                )}
              </MessageContent>
            )

            // In group chats, each reply sits next to the face of the bot
            // that wrote it.
            const author =
              bots && message.role === "assistant"
                ? bots.find((bot) => bot.id === message.metadata?.botId)
                : undefined

            return (
              <Message
                from={message.role}
                key={message.id}
                className={author && "flex-row items-start gap-3"}
              >
                {author ? (
                  <>
                    <ChatAvatar seed={author.avatar} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {author.name}
                      </span>
                      {content}
                    </div>
                  </>
                ) : (
                  content
                )}
              </Message>
            )
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl p-4 pt-0">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea />
          </PromptInputBody>
          <PromptInputFooter className={bots ? undefined : "justify-end"}>
            {bots && (
              <PromptInputTools>
                <BotSelect bots={bots} value={botId} onChange={onBotChange} />
              </PromptInputTools>
            )}
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

/** Picks which bot in a group chat answers the next message. */
function BotSelect({
  bots,
  value,
  onChange,
}: {
  bots: ChatBot[]
  value: string
  onChange: (botId: string) => void
}) {
  return (
    <PromptInputSelect
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
      items={bots.map((bot) => ({ value: bot.id, label: bot.name }))}
    >
      <PromptInputSelectTrigger size="sm" aria-label="Bot to talk to">
        <PromptInputSelectValue>
          {(id: string) => {
            const bot = bots.find((b) => b.id === id)
            return (
              bot && (
                <>
                  <ChatAvatar seed={bot.avatar} className="size-4" />
                  {bot.name}
                </>
              )
            )
          }}
        </PromptInputSelectValue>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {bots.map((bot) => (
          <PromptInputSelectItem key={bot.id} value={bot.id}>
            <ChatAvatar seed={bot.avatar} className="size-4" />
            {bot.name}
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  )
}
