import "server-only"

import { Daytona } from "@daytona/sdk"
import { DaytonaNotFoundError } from "@daytona/sdk/v0"

import { SANDBOX_AUTO_STOP_MINUTES } from "@/lib/billing"

// This project's Daytona organization is on Daytona v0 (app.daytona.io), so
// every call goes through the `v0` namespace. Reads DAYTONA_API_KEY from env.
const daytona = new Daytona()

/**
 * The bot's long-term memory, in its home directory. It's the only thing that
 * carries over between the bot's chats (its 1:1 chat and any group chats).
 * Keep in sync with the system prompt in trigger/chat.ts.
 */
export const BOT_MEMORY_PATH = "/home/daytona/MEMORY.md"

/**
 * Creates the sandbox that belongs to a bot, with a blank memory file, and
 * returns its ID.
 */
export async function createBotSandbox(bot: {
  id: string
  userId: string
}): Promise<string> {
  const sandbox = await daytona.v0.create({
    labels: { botId: bot.id, userId: bot.userId },
    // Sandbox time is metered on this assumption (lib/usage.ts).
    autoStopInterval: SANDBOX_AUTO_STOP_MINUTES,
  })

  try {
    await sandbox.fs.uploadFile(Buffer.from(""), BOT_MEMORY_PATH)
  } catch (error) {
    // A sandbox without its memory file isn't ready: don't leave it behind.
    await daytona.v0
      .delete(sandbox)
      .catch((cleanupError) =>
        console.error("Failed to clean up sandbox", sandbox.id, cleanupError)
      )
    throw error
  }

  return sandbox.id
}

/** Deletes a bot's sandbox. A sandbox that's already gone counts as deleted. */
export async function deleteBotSandbox(sandboxId: string): Promise<void> {
  try {
    const sandbox = await daytona.v0.get(sandboxId)
    await daytona.v0.delete(sandbox)
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) return
    throw error
  }
}

const NOVNC_PORT = 6080
const DESKTOP_URL_TTL_SECONDS = 60 * 60

/**
 * Starts a bot's sandbox and desktop if needed, and returns a signed WebSocket
 * URL to its VNC server (via websockify on the noVNC port). The token lives in
 * the host, so it's port-bound and expires. A WebSocket is used rather than
 * Daytona's vnc.html page because WebSocket connections skip the preview
 * warning page that browser page loads get.
 */
export async function getBotDesktopUrl(sandboxId: string): Promise<string> {
  const sandbox = await daytona.v0.get(sandboxId)
  if (sandbox.state !== "started") await sandbox.start()
  // Idempotent: brings up Xvfb/xfce4/x11vnc/novnc if they aren't running.
  await sandbox.computerUse.start()

  const { url } = await sandbox.getSignedPreviewUrl(
    NOVNC_PORT,
    DESKTOP_URL_TTL_SECONDS
  )
  const ws = new URL("/websockify", url)
  ws.protocol = ws.protocol === "http:" ? "ws:" : "wss:"
  return ws.toString()
}
