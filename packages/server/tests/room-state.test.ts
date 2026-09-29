import { describe, expect, it } from "vitest";

import {
  connectPlayer,
  createGame,
  DISCONNECT_GRACE_MS,
  disconnectPlayer,
  joinGame,
  processAlarm,
} from "../src/room-state";

function lobby() {
  const game = createGame("AB-2000", "host", {
    hostName: "  Host   Name ",
    hostAvatar: "felix",
    mode: "place",
    maxPlayers: 2,
    totalRounds: 1,
    roundDuration: 20_000,
  });
  if (!game) throw new Error("Expected a game");
  game.state = "waiting";
  return game;
}

describe("room lobby", () => {
  it("frees the seat of a player who leaves the lobby", () => {
    const game = lobby();
    connectPlayer(game, "host");
    joinGame(game, "guest", { roomCode: "AB-2000", displayName: "Guest", avatar: "nova" });
    expect(
      joinGame(game, "late", { roomCode: "AB-2000", displayName: "Late", avatar: "nova" }),
    ).toEqual({ error: "room is full" });

    const now = Date.now();
    connectPlayer(game, "guest");
    disconnectPlayer(game, "guest", now);
    processAlarm(game, now + DISCONNECT_GRACE_MS);

    expect(game.players.map((player) => player.userId)).toEqual(["host"]);
    expect(
      joinGame(game, "late", { roomCode: "AB-2000", displayName: "Late", avatar: "nova" }),
    ).toMatchObject({ success: true });
  });

  it("stores normalized display names", () => {
    const game = lobby();
    joinGame(game, "guest", { roomCode: "AB-2000", displayName: " Ada   B ", avatar: "nova" });
    expect(game.players.map((player) => player.displayName)).toEqual(["Host Name", "Ada B"]);
  });
});
