import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { messageTable } from "./message";
import { userTable } from "./user";

export const memoryNoteTable = sqliteTable(
  "memory_note",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull(),
    content: text("content").notNull(),
    sourceMessageId: text("source_message_id").references(() => messageTable.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("memory_note_user_id_character_id_idx").on(table.userId, table.characterId)],
);
