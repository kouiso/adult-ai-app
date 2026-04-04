import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { characterTable } from "./character";
import { conversationTable } from "./conversation";
import { userTable } from "./user";

export const messageTable = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationTable.id),
    characterId: text("character_id")
      .notNull()
      .references(() => characterTable.id),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    imageUrl: text("image_url"),
    // R2に保存された画像のオブジェクトキー（imageUrlはNovitaのTTL付きURL用、段階的にこちらへ移行）
    imageKey: text("image_key"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("message_conversation_id_created_at_idx").on(table.conversationId, table.createdAt),
    index("message_user_id_idx").on(table.userId),
  ],
);
