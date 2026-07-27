import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createApiClient, type ApiClient } from "@guessx/server/client";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-guessx-session" : "guessx-session";

type SessionResponse = {
  token: string;
  expiresAt: number;
};

function client(token?: string): ApiClient {
  const worker = getCloudflareContext().env.WORKER_SELF_REFERENCE;
  if (!worker) throw new Error("WORKER_SELF_REFERENCE is not configured");
  return createApiClient(worker.fetch.bind(worker) as typeof globalThis.fetch, token);
}

async function createSession(): Promise<string> {
  const response = await client().sessions.$post();
  if (!response.ok) throw new Error("could not create a game session");

  const session: Partial<SessionResponse> = await response.json();
  if (
    !session.token ||
    typeof session.expiresAt !== "number" ||
    !Number.isInteger(session.expiresAt)
  ) {
    throw new Error("API returned an invalid session");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt * 1_000),
  });
  return session.token;
}

async function sessionToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const existing = (await cookies()).get(SESSION_COOKIE)?.value;
    if (existing) return existing;
  }
  return createSession();
}

/** Calls the authenticated API and refreshes one expired anonymous session. */
export async function apiRequest<T extends { status: number }>(
  request: (client: ApiClient) => Promise<T>,
): Promise<T> {
  const response = await request(client(await sessionToken()));
  if (response.status !== 401) return response;
  return request(client(await sessionToken(true)));
}
