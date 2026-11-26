"use client"

import { EyeIcon } from "lucide-react"
import type { BundledLanguage } from "shiki"

import { CodeBlock } from "@/components/ai-elements/code-block"
import { Image } from "@/components/ai-elements/image"
import {
  Terminal,
  TerminalContent,
  TerminalHeader,
  TerminalTitle,
} from "@/components/ai-elements/terminal"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import { Shimmer } from "@/components/ai-elements/shimmer"
import type { ChatUIMessage } from "@/trigger/chat"

type ToolPart = Extract<
  ChatUIMessage["parts"][number],
  { type: `tool-${string}` }
>

const LANGUAGES: Record<string, BundledLanguage> = {
  css: "css",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
}

function languageFor(path: string): BundledLanguage {
  return LANGUAGES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "log"
}

function describe(part: ToolPart): string {
  switch (part.type) {
    case "tool-bash":
      return part.input?.command ? `$ ${part.input.command}` : "Run command"
    case "tool-readFile":
      return `Read ${part.input?.path ?? "file"}`
    case "tool-writeFile":
      return `Write ${part.input?.path ?? "file"}`
    case "tool-listFiles":
      return `List ${part.input?.path ?? "files"}`
    case "tool-mouseClick":
      return part.input?.x === undefined
        ? "Click"
        : `${part.input.double ? "Double-click" : "Click"} at (${part.input.x}, ${part.input.y})`
    case "tool-mouseMove":
      return part.input?.x === undefined
        ? "Move mouse"
        : `Move mouse to (${part.input.x}, ${part.input.y})`
    case "tool-mouseScroll":
      return `Scroll ${part.input?.direction ?? ""}`.trim()
    case "tool-keyboardType":
      return part.input?.text ? `Type “${part.input.text}”` : "Type"
    case "tool-keyboardPress":
      return part.input?.key
        ? `Press ${[...(part.input.modifiers ?? []), part.input.key].join("+")}`
        : "Press key"
    case "tool-viewScreen":
      return "Look at the screen"
    case "tool-showScreen":
      return "Show the screen"
    default:
      // Tools injected outside this set (e.g. agent skills).
      return (part as { type: string }).type.slice("tool-".length)
  }
}

function Details({ part }: { part: ToolPart }) {
  if (part.state === "output-error") {
    return <ToolOutput output={undefined} errorText={part.errorText} />
  }
  if (part.state !== "output-available") {
    return <ToolInput input={part.input} />
  }

  switch (part.type) {
    case "tool-bash":
      return (
        <Terminal output={part.output.output}>
          <TerminalHeader>
            <TerminalTitle>Exit code {part.output.exitCode}</TerminalTitle>
          </TerminalHeader>
          <TerminalContent />
        </Terminal>
      )
    case "tool-readFile":
      return (
        <CodeBlock
          code={part.output.content}
          language={languageFor(part.output.path)}
          className="max-h-96"
        />
      )
    case "tool-writeFile":
      return (
        <CodeBlock
          code={part.input.content}
          language={languageFor(part.input.path)}
          className="max-h-96"
        />
      )
    case "tool-listFiles":
      return (
        <ul className="max-h-96 overflow-auto font-mono text-xs">
          {part.output.entries.map((entry) => (
            <li key={entry.name} className="flex justify-between gap-4 py-0.5">
              <span>
                {entry.name}
                {entry.isDir && "/"}
              </span>
              {!entry.isDir && (
                <span className="text-muted-foreground">{entry.size} B</span>
              )}
            </li>
          ))}
        </ul>
      )
    default:
      return <ToolInput input={part.input} />
  }
}

export function ToolCall({ part }: { part: ToolPart }) {
  // The bot's own look at the screen: a status line only, never the image.
  if (part.type === "tool-viewScreen") {
    const done = part.state === "output-available"
    const failed = part.state === "output-error"
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <EyeIcon className="size-4" />
        {done ? (
          "Looked at the screen"
        ) : failed ? (
          "Couldn't see the screen"
        ) : (
          <Shimmer>Looking at the screen</Shimmer>
        )}
      </div>
    )
  }

  // Shown to the user, so the screenshot goes straight into the message.
  if (part.type === "tool-showScreen" && part.state === "output-available") {
    return (
      <Image
        base64={part.output.data}
        mediaType={part.output.mediaType}
        uint8Array={new Uint8Array()}
        alt="Screenshot of the sandbox screen"
        className="border"
      />
    )
  }

  return (
    <Tool>
      <ToolHeader
        type={part.type}
        state={part.state}
        title={describe(part)}
        className="[&_span]:truncate [&>div]:min-w-0"
      />
      <ToolContent>
        <Details part={part} />
      </ToolContent>
    </Tool>
  )
}
