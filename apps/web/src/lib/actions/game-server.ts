import { cookies } from "next/headers";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-guessx-session" : "guessx-session";

type SessionResponse = {
  token: string;
  expiresAt: number;
};

function gameServerUrl(path: string): URL {
  const configuredUrl = process.env.GAME_SERVER_URL;
  if (!configuredUrl) throw new Error("GAME_SERVER_URL is not configured");
  return new URL(path, configuredUrl);
}

async function createSession(): Promise<string> {
  const response = await fetch(gameServerUrl("/api/sessions"), {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("could not create a game session");

  const session = (await response.json()) as Partial<SessionResponse>;
  if (
    !session.token ||
    typeof session.expiresAt !== "number" ||
    !Number.isInteger(session.expiresAt)
  ) {
    throw new Error("game server returned an invalid session");
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

async function authenticatedFetch(path: string, init: RequestInit, token: string) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(gameServerUrl(path), { ...init, headers, cache: "no-store" });
}

/** Calls the game API with the current anonymous session and refreshes one expired session. */
export async function gameServerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await authenticatedFetch(path, init, await sessionToken());
  if (response.status !== 401) return response;
  return authenticatedFetch(path, init, await sessionToken(true));
}
