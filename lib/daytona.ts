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
