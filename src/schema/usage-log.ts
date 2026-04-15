import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usageLogTable = sqliteTable(
  "usage_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    model: text("model"),
    estimatedCostCents: integer("estimated_cost_cents").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("usage_log_user_id_created_at_idx").on(table.userId, table.createdAt)],
);
