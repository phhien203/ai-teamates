import { relations } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { z } from "zod"
import { nanoid } from "nanoid"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user ID
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()), // seed for the bot's face
    job: text("job").notNull(), // what the bot is for, in a phrase
    instructions: text("instructions"), // how it should go about the job
    sandboxId: text("sandbox_id").notNull().unique(), // Daytona sandbox, created with the bot
    // Last metered use of the sandbox: the start of the running time not yet
    // charged to the usage ledger (see lib/usage.ts).
    sandboxActiveAt: timestamp("sandbox_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("bots_user_id_idx").on(t.userId)]
)

export const insertBotSchema = createInsertSchema(bots, {
  name: (s) => s.trim().min(1, "Give your bot a name.").max(50),
  avatar: (s) => s.min(1),
  job: (s) => s.trim().min(1, "Describe the bot's job.").max(100),
  instructions: (s) => s.trim().max(2000),
}).omit({
  id: true,
  userId: true,
  sandboxId: true,
  sandboxActiveAt: true,
  createdAt: true,
})

export type InsertBot = z.infer<typeof insertBotSchema>

export const chatKind = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user ID
    kind: chatKind("kind").notNull().default("direct"),
    name: text("name"), // null for direct chats, which use the bot's name
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("chats_user_id_idx").on(t.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.botId] }),
    index("chat_members_bot_id_idx").on(t.botId),
  ]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
  bot: one(bots, { fields: [chatMembers.botId], references: [bots.id] }),
}))

// `name` is nullable on the table (direct chats use the bot's name), so it's
// overridden with a schema rather than refined: groups always have a name.
export const insertGroupChatSchema = createInsertSchema(chats, {
  name: z.string().trim().min(1, "Give the group a name.").max(50),
})
  .pick({ name: true })
  .extend({
    botIds: z.array(z.string()).min(2, "Pick at least two bots."),
  })

export type InsertGroupChat = z.infer<typeof insertGroupChatSchema>

// Usage-based billing (lib/usage.ts). The paid plan's allowance per billing
// period is set in lib/billing.ts; the ledger records what was spent.

/**
 * The user's current paid subscription period, cached from Clerk Billing so
 * the chat agent can read it without a Clerk session. No row: no paid plan.
 */
export const subscriptions = pgTable("subscriptions", {
  userId: text("user_id").primaryKey(), // Clerk user ID
  plan: text("plan").notNull(), // Clerk plan slug
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const usageMetric = pgEnum("usage_metric", ["ai", "sandbox"])

/**
 * Append-only record of metered usage. `amount` is in the metric's unit:
 * `ai` in micro-USD of model cost, `sandbox` in seconds of sandbox run time.
 * Not tied to bots or chats by foreign key: deleting them refunds nothing.
 */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(), // Clerk user ID
    metric: usageMetric("metric").notNull(),
    amount: integer("amount").notNull(),
    botId: text("bot_id"),
    chatId: text("chat_id"),
    detail: jsonb("detail"), // e.g. the token counts behind an `ai` charge
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("usage_ledger_user_created_idx").on(t.userId, t.createdAt)]
)
