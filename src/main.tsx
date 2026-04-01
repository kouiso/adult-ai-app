import { StrictMode } from "react";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { queryPersister } from "./lib/query-persister";

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24,
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
