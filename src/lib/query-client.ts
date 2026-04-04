import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      networkMode: "online",
      retry: 1,
    },
  },
});
