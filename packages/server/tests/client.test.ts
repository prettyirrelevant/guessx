import { describe, expect, it, vi } from "vitest";

import { createClient, type GameSession } from "../src/client";

const future = Math.floor(Date.now() / 1_000) + 3_600;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createClient", () => {
  it("creates and reuses an anonymous session", async () => {
    let stored: GameSession | null = null;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/api/sessions")) {
        return json({ token: "session-1", expiresAt: future }, 201);
      }
      expect(request.headers.get("Authorization")).toBe("Bearer session-1");
      return json({ roomCode: "AB-1234" });
    });
    const client = createClient({
      baseUrl: "https://example.com",
      fetch,
      sessionStore: {
        get: async () => stored,
        set: async (value) => {
          stored = value;
        },
      },
    });

    const input = {
      mode: "place" as const,
      maxPlayers: 4,
      totalRounds: 5,
      roundDuration: 20_000,
      hostName: "Ada",
      hostAvatar: "nova",
    };
    await expect(client.createRoom(input)).resolves.toBe("AB-1234");
    await expect(client.createRoom(input)).resolves.toBe("AB-1234");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(stored).toEqual({ token: "session-1", expiresAt: future });
  });

  it("refreshes once after an unauthorized response", async () => {
    let stored: GameSession | null = { token: "expired", expiresAt: future };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith("/api/sessions")) {
        expect(request.headers.get("Authorization")).toBe("Bearer expired");
        return json({ token: "fresh", expiresAt: future }, 201);
      }
      if (request.headers.get("Authorization") === "Bearer expired") {
        return json({ error: "unauthorized" }, 401);
      }
      return json({ artists: [] });
    });
    const client = createClient({
      baseUrl: "https://example.com",
      fetch,
      sessionStore: {
        get: async () => stored,
        set: async (value) => {
          stored = value;
        },
      },
    });

    await expect(client.searchArtists("Tems")).resolves.toEqual([]);
    expect(stored).toEqual({ token: "fresh", expiresAt: future });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
