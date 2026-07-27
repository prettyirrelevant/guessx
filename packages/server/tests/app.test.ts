import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

async function createSession(): Promise<string> {
  const response = await SELF.fetch("https://worker.test/api/sessions", { method: "POST" });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { token: string };
  return body.token;
}

describe("worker boundaries", () => {
  it("requires a valid user session", async () => {
    const response = await SELF.fetch("https://worker.test/api/rooms", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(401);
  });

  it("serves authenticated artist searches", async () => {
    const token = await createSession();
    const response = await SELF.fetch("https://worker.test/api/artists?query=a", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ artists: [] });
  });

  it("rejects missing provider settings before creating a room", async () => {
    const token = await createSession();
    const response = await SELF.fetch("https://worker.test/api/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostName: "Host",
        hostAvatar: "host-avatar",
        mode: "music",
        maxPlayers: 6,
        totalRounds: 5,
        roundDuration: 20_000,
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid room settings" });
  });

  it("creates rooms from server-derived identity and issues scoped socket tickets", async () => {
    const token = await createSession();
    const authorization = { Authorization: `Bearer ${token}` };
    const created = await SELF.fetch("https://worker.test/api/rooms", {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        hostName: "Host",
        hostAvatar: "host-avatar",
        mode: "place",
        maxPlayers: 6,
        totalRounds: 1,
        roundDuration: 20_000,
      }),
    });
    expect(created.status).toBe(200);
    const { roomCode } = (await created.json()) as { roomCode: string };

    const prepared = await SELF.fetch(`https://worker.test/api/rooms/${roomCode}/preparation`, {
      method: "POST",
      headers: authorization,
    });
    expect(prepared.status).toBe(200);

    const authorized = await SELF.fetch(`https://worker.test/api/rooms/${roomCode}/socket-ticket`, {
      method: "POST",
      headers: authorization,
    });
    expect(authorized.status).toBe(200);
    const { ticket } = (await authorized.json()) as { ticket: string };

    const socket = await SELF.fetch(
      `https://worker.test/parties/guess-room/${roomCode}?ticket=${encodeURIComponent(ticket)}`,
      {
        headers: {
          Origin: "https://worker.test",
          Upgrade: "websocket",
        },
      },
    );
    expect(socket.status).toBe(101);
    if (!socket.webSocket) throw new Error("WebSocket upgrade did not return a socket");
    socket.webSocket.accept();
    socket.webSocket.close();
  });

  it("rejects WebSocket connections from unknown origins", async () => {
    const response = await SELF.fetch("https://worker.test/parties/guess-room/AB-1234", {
      headers: {
        Origin: "https://attacker.example",
        Upgrade: "websocket",
      },
    });
    expect(response.status).toBe(403);
  });
});
