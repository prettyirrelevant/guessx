"use server";

import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@guessx/server/client";
import type { CreateRoomInput, JoinRoomInput } from "@guessx/game";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-guessx-session" : "guessx-session";

const workerFetch: typeof globalThis.fetch = (input, init) => {
  const worker = getCloudflareContext().env.WORKER_SELF_REFERENCE;
  if (!worker) throw new Error("WORKER_SELF_REFERENCE is not configured");
  return (worker.fetch as typeof globalThis.fetch).call(worker, input, init);
};

const client = createClient({
  baseUrl: "https://guessx.internal",
  cacheSession: false,
  fetch: workerFetch,
  sessionStore: {
    async get() {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      return token ? { token, expiresAt: Number.MAX_SAFE_INTEGER } : null;
    },
    async set(session) {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE, session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(session.expiresAt * 1_000),
      });
    },
  },
});

export type ActionResult<T> = { value: T } | { error: string };

async function settle<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { value: await run() };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "request failed" };
  }
}

export async function createRoom(input: CreateRoomInput) {
  return settle(() => client.createRoom(input));
}

export async function joinRoom(input: JoinRoomInput) {
  return settle(() => client.joinRoom(input));
}

export async function getRoomSocketTicket(input: JoinRoomInput) {
  return settle(() => client.getRoomSocketTicket(input));
}

export async function prepareGame(roomCode: string) {
  return settle(() => client.prepareGame(roomCode));
}

export async function searchArtists(query: string) {
  return settle(() => client.searchArtists(query));
}
