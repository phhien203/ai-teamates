import "server-only"

import { Daytona } from "@daytona/sdk"
import { DaytonaNotFoundError } from "@daytona/sdk/v0"

// This project's Daytona organization is on Daytona v0 (app.daytona.io), so
// every call goes through the `v0` namespace. Reads DAYTONA_API_KEY from env.
const daytona = new Daytona()

/** Creates the sandbox that belongs to a bot and returns its ID. */
export async function createBotSandbox(bot: {
  id: string
  userId: string
}): Promise<string> {
  const sandbox = await daytona.v0.create({
    labels: { botId: bot.id, userId: bot.userId },
  })
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
