import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { characterTable } from "./character";
import { userTable } from "./user";

export const conversationTable = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id),
    characterId: text("character_id")
      .notNull()
      .references(() => characterTable.id),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("conversation_user_id_updated_at_idx").on(table.userId, table.updatedAt)],
);
