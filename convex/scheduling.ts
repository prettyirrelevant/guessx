import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const BASE_POINTS = [10, 7, 5, 3];
const STREAK_THRESHOLD = 3;
const STREAK_BONUS = 2;

export const abandonIfStillPreparing = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (room?.state === "preparing") {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
    }
  },
});

export const abandonIdleRoom = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.state !== "waiting") return;

    if (Date.now() - room.lastActivityAt >= 30 * 60_000) {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
    }
  },
});

export async function endRoundHandler(ctx: MutationCtx, roundId: Id<"rounds">) {
  const round = await ctx.db.get(roundId);
  if (!round || round.state !== "active") return;

  const room = await ctx.db.get(round.roomId);
  if (!room) return;

  const answers = await ctx.db
    .query("answers")
    .withIndex("by_roundId", (q) => q.eq("roundId", roundId))
    .collect();

  const players = await ctx.db
    .query("players")
    .withIndex("by_roomId", (q) => q.eq("roomId", round.roomId))
    .collect();

  // build leader position map for diminishing scoring
  const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
  const leaderPosition = new Map(sorted.map((p, i) => [p._id, i]));

  const correct = answers.filter((a) => a.correct).sort((a, b) => a.submittedAt - b.submittedAt);

  const wrong = answers.filter((a) => !a.correct);
  const answeredIds = new Set(answers.map((a) => a.playerId));

  // score correct answers
  for (let i = 0; i < correct.length; i++) {
    const answer = correct[i];
    const player = players.find((p) => p._id === answer.playerId);
    if (!player) continue;

    let points = BASE_POINTS[Math.min(i, BASE_POINTS.length - 1)];

    const newStreak = player.streak + 1;
    if (newStreak >= STREAK_THRESHOLD) {
      points += STREAK_BONUS;
    }

    // diminishing leader scoring
    const pos = leaderPosition.get(player._id) ?? players.length;
    if (pos === 0) points = Math.round(points * 0.8);
    else if (pos === 1) points = Math.round(points * 0.9);

    if (round.isFinal) points *= 2;

    await ctx.db.patch(answer._id, { pointsAwarded: points, position: i + 1 });
    await ctx.db.patch(player._id, {
      totalScore: player.totalScore + points,
      streak: newStreak,
    });
  }

  // score wrong answers
  for (const answer of wrong) {
    const player = players.find((p) => p._id === answer.playerId);
    if (!player) continue;

    const penalty = round.isFinal ? -2 : -1;
    await ctx.db.patch(answer._id, { pointsAwarded: penalty });
    await ctx.db.patch(player._id, {
      totalScore: player.totalScore + penalty,
      streak: 0,
    });
  }

  // reset streak for players who didn't answer
  for (const player of players) {
    if (!answeredIds.has(player._id)) {
      await ctx.db.patch(player._id, { streak: 0 });
    }
  }

  await ctx.db.patch(roundId, { state: "revealing" });
  await ctx.scheduler.runAfter(10_000, internal.scheduling.endReveal, {
    roundId,
  });
}

export const endRound = internalMutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => endRoundHandler(ctx, args.roundId),
});

export async function endRevealHandler(ctx: MutationCtx, roundId: Id<"rounds">) {
  const round = await ctx.db.get(roundId);
  if (!round || round.state !== "revealing") return;

  await ctx.db.patch(roundId, { state: "complete" });

  const room = await ctx.db.get(round.roomId);
  if (!room) return;

  // if this was the final round, end the game
  if (round.isFinal) {
    await ctx.db.patch(room._id, { state: "finished" });
    await ctx.scheduler.runAfter(10 * 60_000, internal.scheduling.cleanupFinishedRoom, {
      roomId: room._id,
    });
    return;
  }

  // advance to next round
  const nextRound = await ctx.db
    .query("rounds")
    .withIndex("by_roomId_roundNumber", (q) =>
      q.eq("roomId", round.roomId).eq("roundNumber", round.roundNumber + 1),
    )
    .unique();

  if (!nextRound) {
    await ctx.db.patch(room._id, { state: "finished" });
    await ctx.scheduler.runAfter(10 * 60_000, internal.scheduling.cleanupFinishedRoom, {
      roomId: room._id,
    });
    return;
  }

  const now = Date.now();
  await ctx.db.patch(nextRound._id, {
    state: "active",
    startedAt: now,
    endsAt: now + room.roundDuration,
  });

  await ctx.db.patch(room._id, {
    currentRound: nextRound.roundNumber,
    lastActivityAt: now,
  });

  await ctx.scheduler.runAt(now + room.roundDuration, internal.scheduling.endRound, {
    roundId: nextRound._id,
  });
}

export const endReveal = internalMutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => endRevealHandler(ctx, args.roundId),
});

export const checkDisconnect = internalMutation({
  args: {
    playerId: v.id("players"),
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player || player.status !== "disconnected") return;

    const room = await ctx.db.get(args.roomId);
    if (!room || room.state === "abandoned" || room.state === "finished") return;

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    const connected = players.filter((p) => p.status === "connected");

    if (connected.length === 0) {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
      return;
    }

    // promote next host if the disconnected player was the host
    if (room.hostId === player.userId) {
      const nextHost = [...connected].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (nextHost) {
        await ctx.db.patch(args.roomId, { hostId: nextHost.userId });
      }
    }
  },
});

export const cleanupFinishedRoom = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (room) {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
    }
  },
});
