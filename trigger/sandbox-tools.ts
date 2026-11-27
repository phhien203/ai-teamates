import { Daytona } from "@daytona/sdk"
import { DaytonaNotFoundError, type Sandbox } from "@daytona/sdk/v0"
import { tool, type ToolSet } from "ai"
import { z } from "zod"

// Daytona v0 (app.daytona.io). Reads DAYTONA_API_KEY from env.
const daytona = new Daytona()

const HOME = "/home/daytona"
// Created blank with the sandbox (lib/daytona.ts, BOT_MEMORY_PATH).
export const MEMORY_PATH = `${HOME}/MEMORY.md`
const MAX_MEMORY_CHARS = 8_000
const MAX_OUTPUT_CHARS = 20_000
const COMMAND_TIMEOUT_SECONDS = 120

function truncate(text: string) {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… [truncated ${text.length - MAX_OUTPUT_CHARS} characters]`
}

/**
 * Runs before every use of a sandbox. Throws to refuse the use (e.g. when the
 * user is out of sandbox time); the error reaches the model as a tool error.
 */
export type SandboxGuard = () => Promise<void>

/**
 * Lazily connects to a bot's sandbox, starting it (and its desktop) only when
 * a tool first needs it. v0 sandboxes auto-stop when idle.
 */
function sandboxConnection(sandboxId: string, guard: SandboxGuard) {
  let sandbox: Promise<Sandbox> | undefined
  let desktop: Promise<unknown> | undefined

  async function get() {
    await guard()
    sandbox ??= (async () => {
      const s = await daytona.v0.get(sandboxId)
      if (s.state !== "started") await s.start()
      return s
    })().catch((error) => {
      sandbox = undefined
      throw error
    })
    return sandbox
  }

  async function getDesktop() {
    const s = await get()
    // start() is idempotent: it brings up Xvfb/xfce4/VNC if they aren't running.
    desktop ??= s.computerUse.start().catch((error) => {
      desktop = undefined
      throw error
    })
    await desktop
    return s
  }

  return { get, getDesktop }
}

const screenshotOutput = z.object({
  mediaType: z.literal("image/jpeg"),
  data: z.string(), // base64
})
type Screenshot = z.infer<typeof screenshotOutput>

async function screenshot(sandbox: Sandbox): Promise<Screenshot> {
  const shot = await sandbox.computerUse.screenshot.takeCompressed({
    format: "jpeg",
    quality: 70,
    showCursor: true,
  })
  if (!shot.screenshot) throw new Error("The screenshot came back empty.")
  return { mediaType: "image/jpeg", data: shot.screenshot }
}

// The model sees the screenshot as an image, not as a base64 string.
const screenshotToModel = ({ output }: { output: Screenshot }) => ({
  type: "content" as const,
  value: [
    {
      type: "file" as const,
      mediaType: output.mediaType,
      data: { type: "data" as const, data: output.data },
    },
  ],
})

const point = {
  x: z.number().int().min(0).describe("X coordinate in pixels"),
  y: z.number().int().min(0).describe("Y coordinate in pixels"),
}

// One connection per sandbox per worker, shared by its tools and memory reads.
const connections = new Map<string, ReturnType<typeof sandboxConnection>>()

// A sandbox belongs to one bot, so its guard is the same on every call.
function connectionFor(sandboxId: string, guard: SandboxGuard) {
  let conn = connections.get(sandboxId)
  if (!conn) {
    conn = sandboxConnection(sandboxId, guard)
    connections.set(sandboxId, conn)
  }
  return conn
}

async function readMemoryFile(sandbox: Sandbox) {
  try {
    return (await sandbox.fs.downloadFile(MEMORY_PATH)).toString("utf8")
  } catch (error) {
    // Bots created before memory existed have no file yet: that's empty.
    if (error instanceof DaytonaNotFoundError) return ""
    throw error
  }
}

/** The bot's memory file, starting its sandbox if needed. */
export async function readMemory(sandboxId: string, guard: SandboxGuard) {
  return readMemoryFile(await connectionFor(sandboxId, guard).get())
}

export function createSandboxTools(sandboxId: string, guard: SandboxGuard) {
  const conn = connectionFor(sandboxId, guard)

  return {
    getMemory: tool({
      description: `Read your memory (${MEMORY_PATH}): what you've saved about the person you work for and your work, from all your chats. It's already in your instructions at the start of each turn; call this to re-read it after it may have changed.`,
      inputSchema: z.object({}),
      execute: async () => ({
        content: await readMemoryFile(await conn.get()),
      }),
    }),

    setMemory: tool({
      description: `Replace your memory (${MEMORY_PATH}) with new contents. It's how you remember things across all your chats, including group chats. This overwrites the whole file, so pass everything you want to keep: the current memory with your additions, edits, and removals applied.`,
      inputSchema: z.object({
        content: z
          .string()
          .max(MAX_MEMORY_CHARS)
          .describe(
            "The complete new memory, in markdown: short bullets under headings."
          ),
      }),
      execute: async ({ content }) => {
        const sandbox = await conn.get()
        await sandbox.fs.uploadFile(Buffer.from(content, "utf8"), MEMORY_PATH)
        return { saved: true }
      },
    }),

    bash: tool({
      description: `Run a shell command in your sandbox and get its combined stdout/stderr and exit code. Runs in ${HOME} by default. Commands time out after ${COMMAND_TIMEOUT_SECONDS}s, so start long-running or GUI programs in the background (e.g. \`nohup chromium https://example.com >/dev/null 2>&1 &\`). DISPLAY is set, so GUI programs open on the screen.`,
      inputSchema: z.object({
        command: z.string().min(1).describe("The shell command to run"),
        cwd: z
          .string()
          .optional()
          .describe(`Working directory (default ${HOME})`),
      }),
      execute: async ({ command, cwd }) => {
        // The desktop must be up for GUI programs launched from the shell.
        const sandbox = await conn.getDesktop()
        const res = await sandbox.process.executeCommand(
          command,
          cwd,
          { DISPLAY: ":0" },
          COMMAND_TIMEOUT_SECONDS
        )
        return { exitCode: res.exitCode, output: truncate(res.result) }
      },
    }),

    readFile: tool({
      description: "Read a text file from your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe(`File path, absolute or relative to ${HOME}`),
      }),
      execute: async ({ path }) => {
        const sandbox = await conn.get()
        const content = (await sandbox.fs.downloadFile(path)).toString("utf8")
        return { path, content: truncate(content) }
      },
    }),

    writeFile: tool({
      description:
        "Create or overwrite a text file in your sandbox. Missing parent directories are created.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe(`File path, absolute or relative to ${HOME}`),
        content: z.string().describe("The full file contents"),
      }),
      execute: async ({ path, content }) => {
        const sandbox = await conn.get()
        const buffer = Buffer.from(content, "utf8")
        await sandbox.fs.uploadFile(buffer, path)
        return { path, bytes: buffer.byteLength }
      },
    }),

    listFiles: tool({
      description:
        "List the files and directories in a directory of your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .default(HOME)
          .describe(`Directory path (default ${HOME})`),
      }),
      execute: async ({ path }) => {
        const sandbox = await conn.get()
        const files = await sandbox.fs.listFiles(path)
        return {
          path,
          entries: files.map((f) => ({
            name: f.name,
            isDir: f.isDir,
            size: f.size,
          })),
        }
      },
    }),

    mouseClick: tool({
      description: "Click the mouse at a point on the screen.",
      inputSchema: z.object({
        ...point,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false).describe("Double-click"),
      }),
      execute: async ({ x, y, button, double }) => {
        const sandbox = await conn.getDesktop()
        await sandbox.computerUse.mouse.click(x, y, button, double)
        return { x, y, button, double }
      },
    }),

    mouseMove: tool({
      description: "Move the mouse cursor to a point on the screen.",
      inputSchema: z.object(point),
      execute: async ({ x, y }) => {
        const sandbox = await conn.getDesktop()
        await sandbox.computerUse.mouse.move(x, y)
        return { x, y }
      },
    }),

    mouseScroll: tool({
      description: "Scroll the mouse wheel at a point on the screen.",
      inputSchema: z.object({
        ...point,
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(3)
          .describe("Number of wheel ticks"),
      }),
      execute: async ({ x, y, direction, amount }) => {
        const sandbox = await conn.getDesktop()
        await sandbox.computerUse.mouse.scroll(x, y, direction, amount)
        return { x, y, direction, amount }
      },
    }),

    keyboardType: tool({
      description:
        "Type text with the keyboard into whatever has focus. Newlines press Enter.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) => {
        const sandbox = await conn.getDesktop()
        await sandbox.computerUse.keyboard.type(text)
        return { text }
      },
    }),

    keyboardPress: tool({
      description:
        "Press a single key, optionally with modifiers (e.g. key 'enter', or key 'l' with modifiers ['ctrl']). Key names: enter, escape, tab, backspace, delete, space, up/down/left/right, home, end, pageup, pagedown, f1–f24, letters, digits, punctuation.",
      inputSchema: z.object({
        key: z.string().min(1),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).default([]),
      }),
      execute: async ({ key, modifiers }) => {
        const sandbox = await conn.getDesktop()
        await sandbox.computerUse.keyboard.press(key, modifiers)
        return { key, modifiers }
      },
    }),

    viewScreen: tool({
      description:
        "Take a screenshot so YOU can see what's on the screen (1024×768). Use it before and after GUI actions to find coordinates and check results. The user does not see this screenshot.",
      inputSchema: z.object({}),
      outputSchema: screenshotOutput,
      execute: async () => screenshot(await conn.getDesktop()),
      toModelOutput: screenshotToModel,
    }),

    showScreen: tool({
      description:
        "Take a screenshot and show it to the user in the chat. Use it when the user asks to see your screen or what you're looking at.",
      inputSchema: z.object({}),
      outputSchema: screenshotOutput,
      execute: async () => screenshot(await conn.getDesktop()),
      toModelOutput: screenshotToModel,
    }),
  } satisfies ToolSet
}

export type SandboxTools = ReturnType<typeof createSandboxTools>
