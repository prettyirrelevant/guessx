import { describe, it, expect } from "vitest";
import { convexTest, type TestConvex } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

type Ctx = TestConvex<typeof schema>;

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

  await t.mutation(api.rooms.completePreparation, {
    roomId,
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

  const players = await t.query(api.players.list, { roomId });
  const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

  return { roomId, roomCode, players, roundId: round!._id };
}

describe("round queries", () => {
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

  it("returns all media urls for preloading", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupActiveRound(t);

    const urls = await t.query(api.rounds.mediaUrls, { roomId });
    expect(urls).toHaveLength(3);
    expect(urls).toEqual([
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
    ]);
  });
});

describe("answer submission", () => {
  it("accepts a correct answer", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupActiveRound(t);

    const host = players.find((p) => p.userId === "user-host")!;
    const result = await t.mutation(api.rounds.submitAnswer, {
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
    const result = await t.mutation(api.rounds.submitAnswer, {
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
    await t.mutation(api.rounds.submitAnswer, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });

    const result = await t.mutation(api.rounds.submitAnswer, {
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
    const result = await t.mutation(api.rounds.submitAnswer, {
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
    const result = await t.mutation(api.rounds.submitAnswer, {
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
    await t.mutation(api.rounds.submitAnswer, {
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
    await t.mutation(api.rounds.submitAnswer, {
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

    await t.mutation(api.rounds.submitAnswer, {
      roundId,
      playerId: host._id,
      selectedOption: "Song A",
    });
    await t.mutation(api.rounds.submitAnswer, {
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

    await t.mutation(api.rooms.completePreparation, {
      roomId,
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

    const players = await t.query(api.players.list, { roomId });
    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    await t.mutation(api.rounds.submitAnswer, {
      roundId: round!._id,
      playerId: players.find((p) => p.userId === "user-host")!._id,
      selectedOption: "Song A",
    });
    await t.mutation(api.rounds.submitAnswer, {
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

    await t.mutation(api.rooms.completePreparation, {
      roomId,
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

    const players = await t.query(api.players.list, { roomId });
    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    // disconnect player 3
    const player3 = players.find((p) => p.userId === "user-3")!;
    await t.mutation(api.players.markDisconnected, { playerId: player3._id });

    // only 2 connected, both answer
    await t.mutation(api.rounds.submitAnswer, {
      roundId: round!._id,
      playerId: players.find((p) => p.userId === "user-host")!._id,
      selectedOption: "Song A",
    });
    await t.mutation(api.rounds.submitAnswer, {
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

    const room = await t.query(api.rooms.getById, { roomId });
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

    const room = await t.query(api.rooms.getById, { roomId });
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

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.currentRound).toBe(2);
  });

  it("rejects skip when round is not in revealing state", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await setupActiveRound(t);

    const result = await t.mutation(api.rounds.skipReveal, { roundId, userId: "user-host" });
    expect(result).toEqual({ error: "round not revealing" });
  });
});
