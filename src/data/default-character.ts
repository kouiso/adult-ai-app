import type { characterTable } from "@/schema";

export type CharacterDefinition = Pick<
  typeof characterTable.$inferInsert,
  "id" | "name" | "avatar" | "systemPrompt" | "greeting" | "tags"
>;

export const DEFAULT_CHARACTER = {
  id: "default-character",
  name: "Sakura",
  avatar: null,
  systemPrompt: "",
  greeting: "",
  tags: ["色白の大学生", "ナンパシナリオ"],
} satisfies CharacterDefinition;
