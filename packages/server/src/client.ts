/// <reference types="@cloudflare/workers-types" />

import { hc } from "hono/client";
import type { CreateRoomInput, JoinRoomInput } from "@guessx/game";

import type { ApiType } from "./app";

function createHonoClient(
  fetch: typeof globalThis.fetch,
  token?: string,
  baseUrl = "https://guessx.internal/api",
) {
  return hc<ApiType>(baseUrl, {
    fetch,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

type HonoClient = ReturnType<typeof createHonoClient>;

export type GameSession = {
  token: string;
  expiresAt: number;
};

export type GameRequestOptions = {
  signal?: AbortSignal;
};

type SessionStore = {
  get: () => Promise<GameSession | null>;
  set: (session: GameSession) => Promise<void>;
};

type ClientOptions = {
  baseUrl: string;
  cacheSession?: boolean;
  fetch: typeof globalThis.fetch;
  sessionStore: SessionStore;
};

const SESSION_REFRESH_SKEW_SECONDS = 60;

const requestOptions = (options?: GameRequestOptions) =>
  options?.signal ? { init: { signal: options.signal } } : undefined;

function isGameSession(value: unknown): value is GameSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameSession>;
  return (
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    typeof candidate.expiresAt === "number" &&
    Number.isInteger(candidate.expiresAt)
  );
}

async function responseError(
  response: { json: () => Promise<unknown> },
  fallback: string,
): Promise<Error> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return new Error(body.error);
    }
  } catch {}
  return new Error(fallback);
}

export function createClient({ baseUrl, cacheSession = true, fetch, sessionStore }: ClientOptions) {
  const apiUrl = `${baseUrl.replace(/\/+$/, "")}/api`;
  let session: GameSession | null = null;
  let sessionPromise: Promise<GameSession> | null = null;

  const api = (token?: string): HonoClient => createHonoClient(fetch, token, apiUrl);

  const fresh = (value: GameSession) =>
    value.expiresAt > Date.now() / 1_000 + SESSION_REFRESH_SKEW_SECONDS;

  const createSession = async (previousToken?: string): Promise<GameSession> => {
    const response = await api(previousToken).sessions.$post();
    if (!response.ok) throw new Error("could not create a game session");
    const result: unknown = await response.json();
    if (!isGameSession(result)) throw new Error("the server returned an invalid session");
    await sessionStore.set(result);
    return result;
  };

  const getSession = async (forceRefresh = false): Promise<GameSession> => {
    if (!cacheSession) {
      const stored = await sessionStore.get();
      return !forceRefresh && stored && fresh(stored) ? stored : createSession(stored?.token);
    }

    if (!forceRefresh && session && fresh(session)) return session;
    if (sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
      const stored = await sessionStore.get();
      const current = session ?? stored;
      const next =
        !forceRefresh && current && fresh(current) ? current : await createSession(current?.token);
      session = next;
      return next;
    })();

    try {
      return await sessionPromise;
    } finally {
      sessionPromise = null;
    }
  };

  const request = async <T extends { status: number }>(
    run: (client: HonoClient) => Promise<T>,
  ): Promise<T> => {
    const response = await run(api((await getSession()).token));
    if (response.status !== 401) return response;
    return run(api((await getSession(true)).token));
  };

  const joinRoom = async (input: JoinRoomInput, options?: GameRequestOptions): Promise<string> => {
    const response = await request((client) =>
      client.rooms[":roomCode"].join.$post(
        {
          param: { roomCode: input.roomCode },
          json: input,
        },
        requestOptions(options),
      ),
    );
    if (!response.ok) throw await responseError(response, "could not join room");
    const result = await response.json();
    if (!("roomCode" in result) || typeof result.roomCode !== "string") {
      throw new Error("the server returned an invalid room");
    }
    return result.roomCode;
  };

  return {
    async createRoom(input: CreateRoomInput, options?: GameRequestOptions): Promise<string> {
      const response = await request((client) =>
        client.rooms.$post({ json: input }, requestOptions(options)),
      );
      if (!response.ok) throw await responseError(response, "could not create room");
      const result = await response.json();
      if (!("roomCode" in result) || typeof result.roomCode !== "string") {
        throw new Error("the server returned an invalid room");
      }
      return result.roomCode;
    },

    joinRoom,

    async getRoomSocketTicket(input: JoinRoomInput, options?: GameRequestOptions): Promise<string> {
      await joinRoom(input, options);
      const response = await request((client) =>
        client.rooms[":roomCode"]["socket-ticket"].$post(
          {
            param: { roomCode: input.roomCode },
          },
          requestOptions(options),
        ),
      );
      if (!response.ok) throw await responseError(response, "could not authorize room connection");
      const result = await response.json();
      if (!("ticket" in result)) throw new Error("the server returned an invalid socket ticket");
      return result.ticket;
    },

    async prepareGame(roomCode: string, options?: GameRequestOptions): Promise<void> {
      const response = await request((client) =>
        client.rooms[":roomCode"].preparation.$post(
          { param: { roomCode } },
          requestOptions(options),
        ),
      );
      if (!response.ok) throw await responseError(response, "could not prepare room");
    },

    async searchArtists(query: string, options?: GameRequestOptions) {
      const response = await request((client) =>
        client.artists.$get({ query: { query } }, requestOptions(options)),
      );
      if (!response.ok) throw await responseError(response, "could not search artists");
      return (await response.json()).artists;
    },
  };
}
