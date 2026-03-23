import Dexie, { type EntityTable } from "dexie";

import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const QUERY_CACHE_ENTRY_ID = "react-query-cache";

interface QueryCacheEntry {
  id: string;
  payload: PersistedClient;
  updatedAt: number;
}

class QueryCacheDatabase extends Dexie {
  queryCache!: EntityTable<QueryCacheEntry, "id">;

  constructor() {
    super("ai-chat-query-cache");
    this.version(1).stores({
      queryCache: "id, updatedAt",
    });
  }
}

const queryCacheDatabase = new QueryCacheDatabase();

export const queryPersister: Persister = {
  persistClient: async (client) => {
    await queryCacheDatabase.queryCache.put({
      id: QUERY_CACHE_ENTRY_ID,
      payload: client,
      updatedAt: Date.now(),
    });
  },
  restoreClient: async () => {
    const cached = await queryCacheDatabase.queryCache.get(QUERY_CACHE_ENTRY_ID);
    return cached?.payload;
  },
  removeClient: async () => {
    await queryCacheDatabase.queryCache.delete(QUERY_CACHE_ENTRY_ID);
  },
};
