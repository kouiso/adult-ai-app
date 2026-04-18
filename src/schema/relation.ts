import { relations } from "drizzle-orm";

import { characterTable } from "./character";
import { conversationTable } from "./conversation";
import { memoryNoteTable } from "./memory-note";
import { messageTable } from "./message";
import { userTable } from "./user";

export const userRelations = relations(userTable, ({ many }) => ({
  characters: many(characterTable),
  conversations: many(conversationTable),
  memoryNotes: many(memoryNoteTable),
  messages: many(messageTable),
}));

export const characterRelations = relations(characterTable, ({ one, many }) => ({
  user: one(userTable, { fields: [characterTable.userId], references: [userTable.id] }),
  conversations: many(conversationTable),
  messages: many(messageTable),
}));

export const conversationRelations = relations(conversationTable, ({ one, many }) => ({
  user: one(userTable, { fields: [conversationTable.userId], references: [userTable.id] }),
  character: one(characterTable, {
    fields: [conversationTable.characterId],
    references: [characterTable.id],
  }),
  messages: many(messageTable),
}));

export const messageRelations = relations(messageTable, ({ one }) => ({
  user: one(userTable, { fields: [messageTable.userId], references: [userTable.id] }),
  conversation: one(conversationTable, {
    fields: [messageTable.conversationId],
    references: [conversationTable.id],
  }),
  character: one(characterTable, {
    fields: [messageTable.characterId],
    references: [characterTable.id],
  }),
}));

export const memoryNoteRelations = relations(memoryNoteTable, ({ one }) => ({
  user: one(userTable, { fields: [memoryNoteTable.userId], references: [userTable.id] }),
  sourceMessage: one(messageTable, {
    fields: [memoryNoteTable.sourceMessageId],
    references: [messageTable.id],
  }),
}));
