import * as SecureStore from "expo-secure-store";
import { createClient, type GameSession } from "@guessx/server/client";

import { parseGameSession } from "@/lib/game-session";
import { API_URL } from "@/lib/config";

const SESSION_KEY = "guessx-api-session";

async function getStoredSession(): Promise<GameSession | null> {
  return parseGameSession(await SecureStore.getItemAsync(SESSION_KEY));
}

export const gameClient = createClient({
  baseUrl: API_URL,
  fetch: globalThis.fetch,
  sessionStore: {
    get: getStoredSession,
    set: (session) => SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session)),
  },
});

export const { createRoom, joinRoom, getRoomSocketTicket, prepareGame, searchArtists } = gameClient;
