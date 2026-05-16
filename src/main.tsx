import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";
import { AuthProvider } from "./contexts/AuthContext.js";
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from "./shared/constants.js";
import "./index.css";

/**
 * Global TanStack Query client.
 *
 * Defaults are conservative:
 *   - `staleTime: 30s` — most listings (companies / deals) don't change
 *     under your nose; 30s avoids triple-firing the same fetch on a
 *     tab focus + a route remount in quick succession.
 *   - `gcTime: 5min` — keep responses around so back-button feels
 *     instant without re-fetching.
 *   - `retry: 1` — one retry on transient network error, then surface
 *     the failure (Query's exponential backoff helps if the backend
 *     just restarted). 401 is handled by the api/client interceptor
 *     before Query sees it.
 *   - `refetchOnWindowFocus: false` — operators tend to keep this tab
 *     in the background; refetching every tab-switch is more annoying
 *     than helpful for our read-heavy listings.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      gcTime: QUERY_GC_TIME_MS,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
