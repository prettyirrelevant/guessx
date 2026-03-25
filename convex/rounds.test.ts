import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function setupActiveRound(
  t: ReturnType<typeof convexTest>,
  overrides?: Record<string, unknown>,
) {
  const { roomId, roomCode } = await t.mutation(api.rooms.create, {
    hostId: "user-host",
    mode: "music" as const,
    maxPlayers: 4,
    totalRounds: 3,
    roundDuration: 15_000,
    hostName: "Host",
    hostAvatar: "avatar-1",
    ...overrides,
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
    expect(revealed?.correctAnswer).toBe("Song A");
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
    expect(answers[0].selectedOption).toBe("Song A");
    expect(answers[0].correct).toBe(true);
  });
});
