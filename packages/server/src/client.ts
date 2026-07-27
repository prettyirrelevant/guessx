import { hc } from "hono/client";

import type { ApiType } from "./app";

export function createApiClient(fetch: typeof globalThis.fetch, token?: string) {
  return hc<ApiType>("https://guessx.internal/api", {
    fetch,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
