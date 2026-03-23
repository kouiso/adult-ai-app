import Dexie, { type EntityTable } from 'dexie'

export interface Character {
  id: string
  name: string
  avatar?: string
  systemPrompt: string
  greeting: string
  tags: string[]
  createdAt: number
}

export interface Message {
  id: string
  characterId: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  imageUrl?: string
  createdAt: number
}

export interface Conversation {
  id: string
  characterId: string
  title: string
  createdAt: number
  updatedAt: number
}

const db = new Dexie('ai-chat') as Dexie & {
  characters: EntityTable<Character, 'id'>
  messages: EntityTable<Message, 'id'>
  conversations: EntityTable<Conversation, 'id'>
}

db.version(1).stores({
  characters: 'id, name, createdAt',
  messages: 'id, conversationId, characterId, createdAt',
  conversations: 'id, characterId, updatedAt',
})

export { db }
