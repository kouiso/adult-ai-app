import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { userTable } from "./user";

export const characterTable = sqliteTable(
  "character",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id),
    name: text("name").notNull(),
    avatar: text("avatar"),
    systemPrompt: text("system_prompt").notNull(),
    greeting: text("greeting").notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("character_user_id_idx").on(table.userId)],
);
