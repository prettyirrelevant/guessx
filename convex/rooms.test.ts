import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

function makeHost(overrides?: Record<string, unknown>) {
  return {
    hostId: "user-host",
    mode: "music" as const,
    maxPlayers: 4,
    totalRounds: 3,
    roundDuration: 15_000,
    hostName: "Host",
    hostAvatar: "avatar-1",
    ...overrides,
  };
}

function makeRounds(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    roundNumber: i + 1,
    correctAnswer: `Answer ${i + 1}`,
    options: [`Answer ${i + 1}`, "Wrong A", "Wrong B", "Wrong C"],
    mediaUrl: `https://example.com/media-${i + 1}`,
    isFinal: i === count - 1,
  }));
}

async function createWaitingRoom(
  t: ReturnType<typeof convexTest>,
  overrides?: Record<string, unknown>,
) {
  const host = makeHost(overrides);
  const { roomId, roomCode } = await t.mutation(api.rooms.create, host);
  await t.mutation(api.rooms.completePreparation, {
    roomId,
    rounds: makeRounds(host.totalRounds as number),
  });
  return { roomId, roomCode };
}

async function addPlayer(t: ReturnType<typeof convexTest>, roomCode: string, userId: string) {
  return t.mutation(api.rooms.join, {
    roomCode,
    userId,
    displayName: `Player ${userId}`,
    avatar: `avatar-${userId}`,
  });
}

describe("room creation", () => {
  it("creates a room in preparing state with host as first player", async () => {
    const t = convexTest(schema, modules);
    const { roomCode, roomId } = await t.mutation(api.rooms.create, makeHost());

    expect(roomCode).toMatch(/^[A-Z]{2}-\d{4}$/);

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("preparing");
    expect(room?.hostId).toBe("user-host");
    expect(room?.currentRound).toBe(0);

    const players = await t.query(api.players.list, { roomId });
    expect(players).toHaveLength(1);
    expect(players[0].userId).toBe("user-host");
    expect(players[0].status).toBe("connected");
    expect(players[0].totalScore).toBe(0);
  });
});

describe("room preparation", () => {
  it("transitions to waiting after rounds are inserted", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await t.mutation(api.rooms.create, makeHost());

    await t.mutation(api.rooms.completePreparation, {
      roomId,
      rounds: makeRounds(3),
    });

    const room = await t.query(api.rooms.get, { roomCode });
    expect(room?.state).toBe("waiting");

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });
    expect(round?.state).toBe("pending");
  });

  it("ignores completePreparation if room already left preparing state", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    // calling again while in "waiting" should not insert more rounds
    await t.mutation(api.rooms.completePreparation, {
      roomId,
      rounds: makeRounds(5),
    });

    const urls = await t.query(api.rounds.mediaUrls, { roomId });
    expect(urls).toHaveLength(3);
  });

  it("abandons room if still preparing after scheduled timeout", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await t.mutation(api.rooms.create, makeHost());

    // room is still in "preparing", simulate the scheduled job firing
    await t.mutation(internal.scheduling.abandonIfStillPreparing, { roomId });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("abandoned");
  });
});

describe("joining rooms", () => {
  it("allows a player to join a waiting room", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);

    const result = await addPlayer(t, roomCode, "user-2");

    expect(result).toMatchObject({ roomId, roomCode });

    const players = await t.query(api.players.list, { roomId });
    expect(players).toHaveLength(2);
  });

  it("rejects joining a non-existent room", async () => {
    const t = convexTest(schema, modules);

    const result = await addPlayer(t, "ZZ-9999", "user-1");
    expect(result).toEqual({ error: "room not found" });
  });

  it("rejects joining a room that is in progress", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);

    await addPlayer(t, roomCode, "user-2");
    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    const result = await addPlayer(t, roomCode, "user-3");
    expect(result).toEqual({ error: "game already in progress" });
  });

  it("rejects joining a full room", async () => {
    const t = convexTest(schema, modules);
    const { roomCode } = await createWaitingRoom(t, { maxPlayers: 2 });

    await addPlayer(t, roomCode, "user-2");

    const result = await addPlayer(t, roomCode, "user-3");
    expect(result).toEqual({ error: "room is full" });
  });

  it("reconnects a disconnected player instead of creating a duplicate", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);

    await addPlayer(t, roomCode, "user-2");

    // disconnect player 2
    const players = await t.query(api.players.list, { roomId });
    const player2 = players.find((p) => p.userId === "user-2")!;
    await t.mutation(api.players.markDisconnected, { playerId: player2._id });

    // rejoin with same userId
    await addPlayer(t, roomCode, "user-2");

    const afterRejoin = await t.query(api.players.list, { roomId });
    expect(afterRejoin).toHaveLength(2);

    const reconnected = afterRejoin.find((p) => p.userId === "user-2")!;
    expect(reconnected.status).toBe("connected");
  });
});

describe("starting a game", () => {
  it("only the host can start", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");

    const result = await t.mutation(api.rooms.start, { roomId, userId: "user-2" });
    expect(result).toEqual({ error: "only the host can start" });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("waiting");
  });

  it("requires at least 2 connected players", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    const result = await t.mutation(api.rooms.start, { roomId, userId: "user-host" });
    expect(result).toEqual({ error: "need at least 2 players" });
  });

  it("does not count disconnected players toward the 2-player minimum", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");

    const players = await t.query(api.players.list, { roomId });
    const player2 = players.find((p) => p.userId === "user-2")!;
    await t.mutation(api.players.markDisconnected, { playerId: player2._id });

    const result = await t.mutation(api.rooms.start, { roomId, userId: "user-host" });
    expect(result).toEqual({ error: "need at least 2 players" });
  });

  it("activates the first round with timer on start", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t, { roundDuration: 20_000 });
    await addPlayer(t, roomCode, "user-2");

    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("in_progress");
    expect(room?.currentRound).toBe(1);

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });
    expect(round?.state).toBe("active");
    expect(round?.startedAt).toBeDefined();
    expect(round?.endsAt).toBeDefined();
  });

  it("cannot start the same room twice", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");

    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });
    const result = await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    expect(result).toEqual({ error: "game not in waiting state" });
  });
});

describe("closing a room", () => {
  it("host can close a waiting room", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    await t.mutation(api.rooms.close, { roomId, userId: "user-host" });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("abandoned");
  });

  it("non-host cannot close a room", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    await t.mutation(api.rooms.close, { roomId, userId: "user-random" });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("waiting");
  });

  it("cannot close an already finished room", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await t.mutation(api.rooms.create, makeHost());

    await t.run(async (ctx) => {
      await ctx.db.patch(roomId, { state: "finished" });
    });

    await t.mutation(api.rooms.close, { roomId, userId: "user-host" });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("finished");
  });

  it("host can close a room that is in progress", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");
    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    await t.mutation(api.rooms.close, { roomId, userId: "user-host" });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("abandoned");
  });
});

describe("leaderboard", () => {
  it("returns players sorted by score descending", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");
    await addPlayer(t, roomCode, "user-3");

    const players = await t.query(api.players.list, { roomId });
    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { totalScore: 5 });
      await ctx.db.patch(players[1]._id, { totalScore: 20 });
      await ctx.db.patch(players[2]._id, { totalScore: 12 });
    });

    const leaderboard = await t.query(api.players.leaderboard, { roomId });
    expect(leaderboard.map((p) => p.totalScore)).toEqual([20, 12, 5]);
  });

  it("handles tied scores", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");

    const players = await t.query(api.players.list, { roomId });
    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { totalScore: 10 });
      await ctx.db.patch(players[1]._id, { totalScore: 10 });
    });

    const leaderboard = await t.query(api.players.leaderboard, { roomId });
    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0].totalScore).toBe(10);
    expect(leaderboard[1].totalScore).toBe(10);
  });
});

describe("heartbeat", () => {
  it("reconnects a disconnected player and clears disconnectedAt", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");

    const players = await t.query(api.players.list, { roomId });
    const player2 = players.find((p) => p.userId === "user-2")!;
    await t.mutation(api.players.markDisconnected, { playerId: player2._id });

    const disconnected = await t.run(async (ctx) => ctx.db.get(player2._id));
    expect(disconnected?.status).toBe("disconnected");
    expect(disconnected?.disconnectedAt).toBeDefined();

    await t.mutation(api.players.heartbeat, { roomId, userId: "user-2" });

    const reconnected = await t.run(async (ctx) => ctx.db.get(player2._id));
    expect(reconnected?.status).toBe("connected");
    expect(reconnected?.disconnectedAt).toBeUndefined();
  });

  it("is a no-op for a non-existent player", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    // should not throw
    await t.mutation(api.players.heartbeat, { roomId, userId: "ghost-user" });

    const players = await t.query(api.players.list, { roomId });
    expect(players).toHaveLength(1);
  });

  it("updates lastSeenAt on heartbeat", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    const before = await t.query(api.players.list, { roomId });
    const oldLastSeen = before[0].lastSeenAt;

    await t.mutation(api.players.heartbeat, { roomId, userId: "user-host" });

    const after = await t.query(api.players.list, { roomId });
    expect(after[0].lastSeenAt).toBeGreaterThanOrEqual(oldLastSeen!);
  });
});

describe("idle room abandonment", () => {
  it("abandons a waiting room idle for 30+ minutes", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(roomId, { lastActivityAt: Date.now() - 31 * 60_000 });
    });

    await t.mutation(internal.scheduling.abandonIdleRoom, { roomId });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("abandoned");
  });

  it("does not abandon a waiting room that is still active", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await createWaitingRoom(t);

    await t.mutation(internal.scheduling.abandonIdleRoom, { roomId });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("waiting");
  });

  it("skips rooms no longer in waiting state", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await createWaitingRoom(t);
    await addPlayer(t, roomCode, "user-2");
    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    await t.run(async (ctx) => {
      await ctx.db.patch(roomId, { lastActivityAt: Date.now() - 31 * 60_000 });
    });

    await t.mutation(internal.scheduling.abandonIdleRoom, { roomId });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("in_progress");
  });
});

describe("finished room cleanup", () => {
  it("marks a finished room as abandoned", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await t.mutation(api.rooms.create, makeHost());

    await t.run(async (ctx) => {
      await ctx.db.patch(roomId, { state: "finished" });
    });

    await t.mutation(internal.scheduling.cleanupFinishedRoom, { roomId });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("abandoned");
  });
});
