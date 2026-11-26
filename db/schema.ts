import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";
import { nanoid } from "nanoid";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("bots_user_id_idx").on(t.userId)],
);

export const insertBotSchema = createInsertSchema(bots, {
  name: (s) => s.trim().min(1, "Give your bot a name.").max(50),
  avatar: (s) => s.min(1),
  job: (s) => s.trim().min(1, "Describe the bot's job.").max(100),
  instructions: (s) => s.trim().max(2000),
}).omit({ id: true, userId: true, sandboxId: true, createdAt: true });

export type InsertBot = z.infer<typeof insertBotSchema>;

export const chatKind = pgEnum("chat_kind", ["direct", "group"]);

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
  (t) => [index("chats_user_id_idx").on(t.userId)],
);

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
  ],
);

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}));

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
  bot: one(bots, { fields: [chatMembers.botId], references: [bots.id] }),
}));
