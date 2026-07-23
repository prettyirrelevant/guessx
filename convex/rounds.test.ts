/// <reference types="vite/client" />

import { describe, it, expect } from "vitest";
import { convexTest, type TestConvex } from "convex-test";

import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

type Ctx = TestConvex<typeof schema>;

async function listPlayers(t: Ctx, roomId: Id<"rooms">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .collect(),
  );
}

async function submitAnswer(
  t: Ctx,
  args: { roundId: Id<"rounds">; playerId: Id<"players">; selectedOption: string },
) {
  const player = await t.run(async (ctx) => ctx.db.get(args.playerId));
  if (!player) throw new Error("player not found");
  return t.mutation(api.rounds.submitAnswer, { ...args, userId: player.userId });
}

async function disconnectPlayer(t: Ctx, playerId: Id<"players">) {
  const player = await t.run(async (ctx) => ctx.db.get(playerId));
  if (!player) throw new Error("player not found");
  return t.mutation(api.players.markDisconnected, {
    roomId: player.roomId,
    userId: player.userId,
  });
}

const SONGS = [
  { answer: "Song A", options: ["Song A", "Song B", "Song C", "Song D"] },
  { answer: "Song E", options: ["Song E", "Song F", "Song G", "Song H"] },
  { answer: "Song I", options: ["Song I", "Song J", "Song K", "Song L"] },
];

async function setupActiveRound(t: Ctx, overrides?: Record<string, unknown>) {
  const totalRounds = (overrides?.totalRounds as number) ?? 3;

  const { roomId, roomCode } = await t.mutation(api.rooms.create, {
    hostId: "user-host",
    mode: "music" as const,
    maxPlayers: 4,
    totalRounds,
    roundDuration: 15_000,
    hostName: "Host",
    hostAvatar: "avatar-1",
    ...overrides,
  });

  await t.mutation(internal.preparation.complete, {
    roomId,
    userId: "user-host",
    rounds: Array.from({ length: totalRounds }, (_, i) => ({
      roundNumber: i + 1,
      correctAnswer: SONGS[i % SONGS.length].answer,
      options: SONGS[i % SONGS.length].options,
      mediaUrl: `https://example.com/${i + 1}`,
      isFinal: i === totalRounds - 1,
    })),
  });

  await t.mutation(api.rooms.join, {
    roomCode,
    userId: "user-2",
    displayName: "Player 2",
    avatar: "avatar-2",
  });

  await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

  const players = await listPlayers(t, roomId);
  const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

  return { roomId, roomCode, players, roundId: round!._id };
}

describe("round queries", () => {
  it("starts a single final round's answer timer after the intro", async () => {
    const t = convexTest(schema, modules);
    const beforeStart = Date.now();
    const { roomId } = await setupActiveRound(t, { totalRounds: 1, roundDuration: 10_000 });

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    expect(round?.startedAt).toBeGreaterThanOrEqual(beforeStart + 3_000);
    expect(round?.endsAt! - round?.startedAt!).toBe(10_000);
  });

  it("hides correctAnswer while a future round is pending", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupActiveRound(t);

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 2 });

    expect(round).toBeNull();
  });

  it("hides correctAnswer while round is active", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupActiveRound(t);

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    expect(round).toBeDefined();
    expect(round).not.toHaveProperty("correctAnswer");
    expect(round?.options).toBeDefined();
  });

  it("exposes correctAnswer after round leaves active state", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupActiveRound(t);

    // transition round to revealing
    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });
    await t.run(async (ctx) => {
      await ctx.db.patch(round!._id, { state: "revealing" });
    });

    const revealed = await t.query(api.rounds.get, { roomId, roundNumber: 1 });
    expect((revealed as any)?.correctAnswer).toBe("Song A");
  });

  it("returns null for a non-existent round number", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupActiveRound(t);

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 99 });
    expect(round).toBeNull();
  });
});

describe("answer submission", () => {
  it("rejects a valid player ID paired with another player's capability", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);
    const player2 = players.find((p) => p.userId === "user-2")!;

    const result = await t.mutation(api.rounds.submitAnswer, {
      roundId,
      playerId: player2._id,
      userId: "user-host",
      selectedOption: "Song A",
    });

    expect(result).toEqual({ error: "player not found in room" });
  });

  it("accepts a correct answer", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    const result = await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    expect(result).toEqual({ success: true });
  });

  it("accepts a wrong answer", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    const result = await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song B",
    });

    expect(result).toEqual({ success: true });
  });

  it("rejects duplicate answer from same player", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    const result = await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song B",
    });

    expect(result).toEqual({ error: "already answered" });
  });

  it("rejects answer when round is not active", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(roundId, { state: "revealing" });
    });

    const host = players.find((p) => p.userId === "user-host")!;
    const result = await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    expect(result).toEqual({ error: "round is not active" });
  });

  it("rejects answer submitted after endsAt", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    // set endsAt to the past
    await t.run(async (ctx) => {
      await ctx.db.patch(roundId, { endsAt: Date.now() - 1000 });
    });

    const host = players.find((p) => p.userId === "user-host")!;
    const result = await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    expect(result).toEqual({ error: "time's up" });
  });
});

describe("answer visibility", () => {
  it("only reveals that a player answered during active round, not what they picked", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    const answers = await t.query(api.rounds.answers, { roundId });
    expect(answers).toHaveLength(1);
    expect(answers[0]).toHaveProperty("hasAnswered", true);
    expect(answers[0]).not.toHaveProperty("selectedOption");
    expect(answers[0]).not.toHaveProperty("correct");
  });

  it("reveals full answer details after round leaves active state", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(roundId, { state: "revealing" });
    });

    const answers = await t.query(api.rounds.answers, { roundId });
    expect(answers).toHaveLength(1);
    const answer = answers[0] as any;
    expect(answer.selectedOption).toBe("Song A");
    expect(answer.correct).toBe(true);
  });
});

describe("early round end", () => {
  it("ends round early when all connected players have answered", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    const player2 = players.find((p) => p.userId === "user-2")!;

    await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });
    await submitAnswer(t, {
      roundId,
      playerId: player2._id,
      selectedOption: "Song B",
    });

    const round = await t.run(async (ctx) => ctx.db.get(roundId));
    expect(round?.state).toBe("revealing");
  });

  it("recovers when a completed round misses the inline transition", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    await t.run(async (ctx) => {
      for (const [index, player] of players.entries()) {
        await ctx.db.insert("answers", {
          roundId,
          playerId: player._id,
          selectedOption: index === 0 ? "Song A" : "Song B",
          correct: index === 0,
          submittedAt: Date.now() + index,
          pointsAwarded: 0,
        });
      }
    });

    const ended = await t.mutation(internal.scheduling.endRoundIfReady, { roundId });
    const round = await t.run(async (ctx) => ctx.db.get(roundId));

    expect(ended).toBe(true);
    expect(round?.state).toBe("revealing");
  });

  it("ends when every player answered during a temporary presence gap", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);
    const host = players.find((player) => player.userId === "user-host")!;
    const player2 = players.find((player) => player.userId === "user-2")!;

    await disconnectPlayer(t, host._id);
    await disconnectPlayer(t, player2._id);
    await submitAnswer(t, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });
    await submitAnswer(t, {
      roundId,
      playerId: player2._id,
      selectedOption: "Song B",
    });

    const round = await t.run(async (ctx) => ctx.db.get(roundId));
    expect(round?.state).toBe("revealing");
  });

  it("does not end round early when only some players have answered", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await t.mutation(api.rooms.create, {
      hostId: "user-host",
      mode: "music" as const,
      maxPlayers: 4,
      totalRounds: 3,
      roundDuration: 15_000,
      hostName: "Host",
      hostAvatar: "avatar-1",
    });

    await t.mutation(internal.preparation.complete, {
      roomId,
      userId: "user-host",
      rounds: [
        {
          roundNumber: 1,
          correctAnswer: "Song A",
          options: ["Song A", "Song B", "Song C", "Song D"],
          mediaUrl: "https://example.com/1",
          isFinal: false,
        },
        {
          roundNumber: 2,
          correctAnswer: "Song E",
          options: ["Song E", "Song F", "Song G", "Song H"],
          mediaUrl: "https://example.com/2",
          isFinal: false,
        },
        {
          roundNumber: 3,
          correctAnswer: "Song I",
          options: ["Song I", "Song J", "Song K", "Song L"],
          mediaUrl: "https://example.com/3",
          isFinal: true,
        },
      ],
    });

    await t.mutation(api.rooms.join, {
      roomCode,
      userId: "user-2",
      displayName: "Player 2",
      avatar: "avatar-2",
    });
    await t.mutation(api.rooms.join, {
      roomCode,
      userId: "user-3",
      displayName: "Player 3",
      avatar: "avatar-3",
    });

    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    const players = await listPlayers(t, roomId);
    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    await submitAnswer(t, {
      roundId: round!._id,
      playerId: players.find((p) => p.userId === "user-host")!._id,
      selectedOption: "Song A",
    });
    await submitAnswer(t, {
      roundId: round!._id,
      playerId: players.find((p) => p.userId === "user-2")!._id,
      selectedOption: "Song B",
    });

    const roundAfter = await t.run(async (ctx) => ctx.db.get(round!._id));
    expect(roundAfter?.state).toBe("active");
  });

  it("counts only connected players for early end check", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roomCode } = await t.mutation(api.rooms.create, {
      hostId: "user-host",
      mode: "music" as const,
      maxPlayers: 4,
      totalRounds: 3,
      roundDuration: 15_000,
      hostName: "Host",
      hostAvatar: "avatar-1",
    });

    await t.mutation(internal.preparation.complete, {
      roomId,
      userId: "user-host",
      rounds: [
        {
          roundNumber: 1,
          correctAnswer: "Song A",
          options: ["Song A", "Song B", "Song C", "Song D"],
          mediaUrl: "https://example.com/1",
          isFinal: false,
        },
        {
          roundNumber: 2,
          correctAnswer: "Song E",
          options: ["Song E", "Song F", "Song G", "Song H"],
          mediaUrl: "https://example.com/2",
          isFinal: false,
        },
        {
          roundNumber: 3,
          correctAnswer: "Song I",
          options: ["Song I", "Song J", "Song K", "Song L"],
          mediaUrl: "https://example.com/3",
          isFinal: true,
        },
      ],
    });

    await t.mutation(api.rooms.join, {
      roomCode,
      userId: "user-2",
      displayName: "Player 2",
      avatar: "avatar-2",
    });
    await t.mutation(api.rooms.join, {
      roomCode,
      userId: "user-3",
      displayName: "Player 3",
      avatar: "avatar-3",
    });

    await t.mutation(api.rooms.start, { roomId, userId: "user-host" });

    const players = await listPlayers(t, roomId);
    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    // disconnect player 3
    const player3 = players.find((p) => p.userId === "user-3")!;
    await disconnectPlayer(t, player3._id);

    // only 2 connected, both answer
    await submitAnswer(t, {
      roundId: round!._id,
      playerId: players.find((p) => p.userId === "user-host")!._id,
      selectedOption: "Song A",
    });
    await submitAnswer(t, {
      roundId: round!._id,
      playerId: players.find((p) => p.userId === "user-2")!._id,
      selectedOption: "Song B",
    });

    const roundAfter = await t.run(async (ctx) => ctx.db.get(round!._id));
    expect(roundAfter?.state).toBe("revealing");
  });
});

describe("skip reveal", () => {
  it("host can skip reveal to advance to next round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roundId } = await setupActiveRound(t);

    await t.mutation(internal.scheduling.endRound, { roundId });

    const round = await t.run(async (ctx) => ctx.db.get(roundId));
    expect(round?.state).toBe("revealing");

    await t.mutation(api.rounds.skipReveal, { roundId, userId: "user-host" });

    const roundAfter = await t.run(async (ctx) => ctx.db.get(roundId));
    expect(roundAfter?.state).toBe("complete");

    const room = await t.run(async (ctx) => ctx.db.get(roomId));
    expect(room?.currentRound).toBe(2);

    const round2 = await t.query(api.rounds.get, { roomId, roundNumber: 2 });
    expect(round2?.state).toBe("active");
  });

  it("host can skip reveal on final round to finish game", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupActiveRound(t, { totalRounds: 1 });

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });
    await t.mutation(internal.scheduling.endRound, { roundId: round!._id });

    await t.mutation(api.rounds.skipReveal, { roundId: round!._id, userId: "user-host" });

    const roundAfter = await t.run(async (ctx) => ctx.db.get(round!._id));
    expect(roundAfter?.state).toBe("complete");

    const room = await t.run(async (ctx) => ctx.db.get(roomId));
    expect(room?.state).toBe("finished");
  });

  it("non-host cannot skip reveal", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await setupActiveRound(t);

    await t.mutation(internal.scheduling.endRound, { roundId });

    const result = await t.mutation(api.rounds.skipReveal, { roundId, userId: "user-2" });
    expect(result).toEqual({ error: "only the host can skip" });
  });

  it("skip reveal is idempotent", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roundId } = await setupActiveRound(t);

    await t.mutation(internal.scheduling.endRound, { roundId });
    await t.mutation(api.rounds.skipReveal, { roundId, userId: "user-host" });

    const result = await t.mutation(api.rounds.skipReveal, { roundId, userId: "user-host" });
    expect(result).toEqual({ error: "round not revealing" });

    const room = await t.run(async (ctx) => ctx.db.get(roomId));
    expect(room?.currentRound).toBe(2);
  });

  it("rejects skip when round is not in revealing state", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await setupActiveRound(t);

    const result = await t.mutation(api.rounds.skipReveal, { roundId, userId: "user-host" });
    expect(result).toEqual({ error: "round not revealing" });
  });
});
