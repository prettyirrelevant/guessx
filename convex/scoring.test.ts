import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function setupGame(
  t: ReturnType<typeof convexTest>,
  opts: { playerCount?: number; totalRounds?: number; roundDuration?: number } = {},
) {
  const { playerCount = 4, totalRounds = 3, roundDuration = 15_000 } = opts;

  const { roomId, roomCode } = await t.mutation(api.rooms.create, {
    hostId: "user-0",
    mode: "music" as const,
    maxPlayers: 20,
    totalRounds,
    roundDuration,
    hostName: "Player 0",
    hostAvatar: "avatar-0",
  });

  const rounds = Array.from({ length: totalRounds }, (_, i) => ({
    roundNumber: i + 1,
    correctAnswer: `Answer ${i + 1}`,
    options: [`Answer ${i + 1}`, "Wrong A", "Wrong B", "Wrong C"],
    mediaUrl: `https://example.com/${i + 1}`,
    isFinal: i === totalRounds - 1,
  }));

  await t.mutation(api.rooms.completePreparation, { roomId, rounds });

  for (let i = 1; i < playerCount; i++) {
    await t.mutation(api.rooms.join, {
      roomCode,
      userId: `user-${i}`,
      displayName: `Player ${i}`,
      avatar: `avatar-${i}`,
    });
  }

  await t.mutation(api.rooms.start, { roomId, userId: "user-0" });

  const players = await t.query(api.players.list, { roomId });
  const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

  return { roomId, players, roundId: round!._id };
}

describe("scoring: position-based points", () => {
  it("awards 10, 7, 5, 3 for 1st through 4th correct answers", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    // submit correct answers in order with staggered timestamps
    for (let i = 0; i < 4; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("answers", {
          roundId,
          playerId: players[i]._id,
          selectedOption: "Answer 1",
          correct: true,
          submittedAt: Date.now() + i * 100,
          pointsAwarded: 0,
        });
      });
    }

    // clear existing answers inserted by submitAnswer and use our manual ones
    // actually let's use the internal mutation directly
    await t.run(async (ctx) => {
      // first remove answers we just inserted
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_roundId", (q) => q.eq("roundId", roundId))
        .collect();
      for (const a of answers) await ctx.db.delete(a._id);
    });

    // insert answers with precise timing control
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("answers", {
          roundId,
          playerId: players[i]._id,
          selectedOption: "Answer 1",
          correct: true,
          submittedAt: now + i * 100,
          pointsAwarded: 0,
        });
      });
    }

    await t.mutation(internal.scheduling.endRound, { roundId });

    // everyone starts at 0, so leaderboard position matches insertion order
    // 1st place gets 20% reduction, 2nd gets 10%, rest get full points
    const basePoints = [10, 7, 5, 3];
    const leaderMultiplier = [0.8, 0.9, 1, 1];
    for (let i = 0; i < 4; i++) {
      const player = await t.run(async (ctx) => ctx.db.get(players[i]._id));
      const expected = Math.round(basePoints[i] * leaderMultiplier[i]);
      expect(player?.totalScore).toBe(expected);
    }
  });

  it("caps points at 3 for 5th+ correct answers", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t, { playerCount: 6 });

    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("answers", {
          roundId,
          playerId: players[i]._id,
          selectedOption: "Answer 1",
          correct: true,
          submittedAt: now + i * 100,
          pointsAwarded: 0,
        });
      });
    }

    await t.mutation(internal.scheduling.endRound, { roundId });

    // 5th and 6th place should both get 3 base points
    const player5 = await t.run(async (ctx) => ctx.db.get(players[4]._id));
    const player6 = await t.run(async (ctx) => ctx.db.get(players[5]._id));
    expect(player5?.totalScore).toBe(3);
    expect(player6?.totalScore).toBe(3);
  });
});

describe("scoring: wrong answers", () => {
  it("penalizes wrong answer with -1 point and resets streak", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    // give player 0 a streak first
    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { streak: 2 });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[0]._id,
        selectedOption: "Wrong A",
        correct: false,
        submittedAt: Date.now(),
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    expect(player?.totalScore).toBe(-1);
    expect(player?.streak).toBe(0);
  });

  it("penalizes wrong answer with -2 on the final round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t, { totalRounds: 1 });

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId: round!._id,
        playerId: players[0]._id,
        selectedOption: "Wrong A",
        correct: false,
        submittedAt: Date.now(),
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId: round!._id });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    expect(player?.totalScore).toBe(-2);
  });
});

describe("scoring: streaks", () => {
  it("awards streak bonus when streak reaches threshold of 3", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    // player already has a streak of 2 going in
    await t.run(async (ctx) => {
      await ctx.db.patch(players[1]._id, { streak: 2 });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[1]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: Date.now(),
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[1]._id));
    // 1st correct = 10 base, streak 2->3 triggers +2 bonus = 12
    // but leader diminishing: position 0 in sorted order (was at 0 score, now only player with answer)
    // actually player 0 (host) has 0 score, player 1 has 0 score, so position depends on sort
    // since both are 0, the sorted order is by insertion. player 0 is position 0 (leader)
    // player 1 is position 1, gets 90% = Math.round(12 * 0.9) = 11
    expect(player?.totalScore).toBe(11);
    expect(player?.streak).toBe(3);
  });

  it("does not award streak bonus below threshold", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    // player has streak of 1 (will become 2 after correct, below threshold of 3)
    await t.run(async (ctx) => {
      await ctx.db.patch(players[1]._id, { streak: 1 });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[1]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: Date.now(),
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[1]._id));
    // 1st correct, 2nd in leaderboard so 10% reduction, no streak bonus
    expect(player?.totalScore).toBe(9);
    expect(player?.streak).toBe(2);
  });

  it("resets streak for players who did not answer", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { streak: 5 });
    });

    // no answer submitted for player 0
    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    expect(player?.streak).toBe(0);
  });
});

describe("scoring: leader diminishing returns", () => {
  it("1st place player gets 80% of points", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    // make player 0 the clear leader
    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { totalScore: 50 });
      await ctx.db.patch(players[1]._id, { totalScore: 20 });
    });

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[0]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: now,
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    // 1st correct, leader gets 20% reduction
    expect(player?.totalScore).toBe(50 + 8);
  });

  it("2nd place player gets 90% of points", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { totalScore: 50 });
      await ctx.db.patch(players[1]._id, { totalScore: 30 });
      await ctx.db.patch(players[2]._id, { totalScore: 10 });
    });

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[1]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: now,
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[1]._id));
    // 1st correct, 2nd in leaderboard so 10% reduction
    expect(player?.totalScore).toBe(30 + 9);
  });

  it("3rd place and below get full points", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { totalScore: 50 });
      await ctx.db.patch(players[1]._id, { totalScore: 30 });
      await ctx.db.patch(players[2]._id, { totalScore: 10 });
    });

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[2]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: now,
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[2]._id));
    // 1st correct, 3rd in leaderboard so no reduction
    expect(player?.totalScore).toBe(10 + 10);
  });
});

describe("scoring: final round", () => {
  it("doubles all points on the final round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t, { totalRounds: 1 });

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });
    expect(round?.isFinal).toBe(true);

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId: round!._id,
        playerId: players[0]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: now,
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId: round!._id });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    // 1st correct, leader gets 20% reduction, final round doubles everything
    expect(player?.totalScore).toBe(16);
  });

  it("doubles the penalty for wrong answers on final round", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t, { totalRounds: 1 });
    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId: round!._id,
        playerId: players[0]._id,
        selectedOption: "Wrong A",
        correct: false,
        submittedAt: Date.now(),
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId: round!._id });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    expect(player?.totalScore).toBe(-2);
  });
});

describe("scoring: endRound idempotency", () => {
  it("does nothing if called twice on the same round", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[0]._id,
        selectedOption: "Answer 1",
        correct: true,
        submittedAt: now,
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const scoreAfterFirst = (await t.run(async (ctx) => ctx.db.get(players[0]._id)))?.totalScore;

    // second call should be a no-op since round is now "revealing"
    await t.mutation(internal.scheduling.endRound, { roundId });

    const scoreAfterSecond = (await t.run(async (ctx) => ctx.db.get(players[0]._id)))?.totalScore;
    expect(scoreAfterSecond).toBe(scoreAfterFirst);
  });
});

describe("round progression", () => {
  it("advances to next round after reveal ends", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roundId } = await setupGame(t);

    await t.mutation(internal.scheduling.endRound, { roundId });

    const round1 = await t.run(async (ctx) => ctx.db.get(roundId));
    expect(round1?.state).toBe("revealing");

    await t.mutation(internal.scheduling.endReveal, { roundId });

    const round1After = await t.run(async (ctx) => ctx.db.get(roundId));
    expect(round1After?.state).toBe("complete");

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.currentRound).toBe(2);
    expect(room?.state).toBe("in_progress");

    const round2 = await t.query(api.rounds.get, { roomId, roundNumber: 2 });
    expect(round2?.state).toBe("active");
  });

  it("finishes the game after the final round reveal", async () => {
    const t = convexTest(schema, modules);
    const { roomId } = await setupGame(t, { totalRounds: 1 });

    const round = await t.query(api.rounds.get, { roomId, roundNumber: 1 });

    await t.mutation(internal.scheduling.endRound, { roundId: round!._id });
    await t.mutation(internal.scheduling.endReveal, { roundId: round!._id });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("finished");
  });

  it("endReveal is idempotent", async () => {
    const t = convexTest(schema, modules);
    const { roomId, roundId } = await setupGame(t);

    await t.mutation(internal.scheduling.endRound, { roundId });
    await t.mutation(internal.scheduling.endReveal, { roundId });

    const roomAfterFirst = await t.query(api.rooms.getById, { roomId });

    // second call should no-op since round is now "complete"
    await t.mutation(internal.scheduling.endReveal, { roundId });

    const roomAfterSecond = await t.query(api.rooms.getById, { roomId });
    expect(roomAfterSecond?.currentRound).toBe(roomAfterFirst?.currentRound);
  });
});

describe("disconnect handling", () => {
  it("promotes a new host when current host disconnects", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t);

    const host = players.find((p) => p.userId === "user-0")!;
    await t.run(async (ctx) => {
      await ctx.db.patch(host._id, { status: "disconnected" });
    });

    await t.mutation(internal.scheduling.checkDisconnect, {
      playerId: host._id,
      roomId,
    });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.hostId).not.toBe("user-0");
    expect(room?.state).not.toBe("abandoned");
  });

  it("abandons room when all players disconnect", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t, { playerCount: 2 });

    // disconnect both players
    for (const player of players) {
      await t.run(async (ctx) => {
        await ctx.db.patch(player._id, { status: "disconnected" });
      });
    }

    await t.mutation(internal.scheduling.checkDisconnect, {
      playerId: players[0]._id,
      roomId,
    });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.state).toBe("abandoned");
  });

  it("does nothing if player reconnected before check fires", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t);

    const host = players.find((p) => p.userId === "user-0")!;

    // disconnect then immediately reconnect
    await t.run(async (ctx) => {
      await ctx.db.patch(host._id, { status: "disconnected" });
    });
    await t.mutation(api.players.heartbeat, { roomId, userId: "user-0" });

    // scheduled check fires but player is connected again
    await t.mutation(internal.scheduling.checkDisconnect, {
      playerId: host._id,
      roomId,
    });

    const room = await t.query(api.rooms.getById, { roomId });
    expect(room?.hostId).toBe("user-0");
    expect(room?.state).toBe("in_progress");
  });
});

describe("scoring: negative total score", () => {
  it("allows score to go further negative", async () => {
    const t = convexTest(schema, modules);
    const { roundId, players } = await setupGame(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(players[0]._id, { totalScore: -3 });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("answers", {
        roundId,
        playerId: players[0]._id,
        selectedOption: "Wrong A",
        correct: false,
        submittedAt: Date.now(),
        pointsAwarded: 0,
      });
    });

    await t.mutation(internal.scheduling.endRound, { roundId });

    const player = await t.run(async (ctx) => ctx.db.get(players[0]._id));
    expect(player?.totalScore).toBe(-4);
  });
});

describe("scoring: multi-round streak accumulation", () => {
  it("streak carries across rounds and triggers bonus on round 3", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t, { totalRounds: 3, playerCount: 2 });

    // player 1 answers correctly every round, building streak to 3
    for (let roundNum = 1; roundNum <= 3; roundNum++) {
      const round = await t.run(async (ctx) => {
        return ctx.db
          .query("rounds")
          .withIndex("by_roomId_roundNumber", (q) =>
            q.eq("roomId", roomId).eq("roundNumber", roundNum),
          )
          .unique();
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("answers", {
          roundId: round!._id,
          playerId: players[1]._id,
          selectedOption: `Answer ${roundNum}`,
          correct: true,
          submittedAt: Date.now(),
          pointsAwarded: 0,
        });
      });

      await t.mutation(internal.scheduling.endRound, { roundId: round!._id });

      if (roundNum < 3) {
        await t.mutation(internal.scheduling.endReveal, { roundId: round!._id });
      }
    }

    const player = await t.run(async (ctx) => ctx.db.get(players[1]._id));
    expect(player?.streak).toBe(3);

    // r1: 1st correct, 2nd in leaderboard so 10% reduction -> 9
    // r2: became leader after r1, 20% reduction -> 8
    // r3: streak hits 3 so +2 bonus, still leader, final round doubles -> 20
    expect(player?.totalScore).toBe(9 + 8 + 20);
  });

  it("wrong answer mid-streak resets it", async () => {
    const t = convexTest(schema, modules);
    const { roomId, players } = await setupGame(t, { totalRounds: 3, playerCount: 2 });

    async function getRound(num: number) {
      return t.run(async (ctx) => {
        return ctx.db
          .query("rounds")
          .withIndex("by_roomId_roundNumber", (q) => q.eq("roomId", roomId).eq("roundNumber", num))
          .unique();
      });
    }

    async function answer(roundId: Id<"rounds">, option: string, correct: boolean) {
      await t.run(async (ctx) => {
        await ctx.db.insert("answers", {
          roundId,
          playerId: players[1]._id,
          selectedOption: option,
          correct,
          submittedAt: Date.now(),
          pointsAwarded: 0,
        });
      });
    }

    // r1: correct, streak starts building
    const r1 = await getRound(1);
    await answer(r1!._id, "Answer 1", true);
    await t.mutation(internal.scheduling.endRound, { roundId: r1!._id });
    await t.mutation(internal.scheduling.endReveal, { roundId: r1!._id });

    // r2: wrong answer breaks the streak
    const r2 = await getRound(2);
    await answer(r2!._id, "Wrong A", false);
    await t.mutation(internal.scheduling.endRound, { roundId: r2!._id });

    const afterR2 = await t.run(async (ctx) => ctx.db.get(players[1]._id));
    expect(afterR2?.streak).toBe(0);

    await t.mutation(internal.scheduling.endReveal, { roundId: r2!._id });

    // r3: correct but streak restarted, not enough for bonus
    const r3 = await getRound(3);
    await answer(r3!._id, "Answer 3", true);
    await t.mutation(internal.scheduling.endRound, { roundId: r3!._id });

    const afterR3 = await t.run(async (ctx) => ctx.db.get(players[1]._id));
    expect(afterR3?.streak).toBe(1);

    // r1: 1st correct, 2nd in leaderboard so 10% reduction -> 9
    // r2: wrong answer, -1 penalty
    // r3: correct, now leader so 20% reduction, final round doubles -> 16
    expect(afterR3?.totalScore).toBe(9 - 1 + 16);
  });
});
