import type { GameSession } from "@guessx/server/client";

export function parseGameSession(stored: string | null): GameSession | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (
      value &&
      typeof value === "object" &&
      "token" in value &&
      typeof value.token === "string" &&
      value.token.length > 0 &&
      "expiresAt" in value &&
      typeof value.expiresAt === "number" &&
      Number.isInteger(value.expiresAt)
    ) {
      return { token: value.token, expiresAt: value.expiresAt };
    }
  } catch {}
  return null;
}
