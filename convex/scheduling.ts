import { v } from "convex/values";

import { listPlayersWithPresence } from "./presence";
import { DISCONNECT_GRACE_MS, MAX_PLAYERS, PRESENCE_TIMEOUT_MS } from "./model";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const BASE_POINTS = [10, 7, 5, 3];
const STREAK_THRESHOLD = 3;
const STREAK_BONUS = 2;
const IDLE_ROOM_TIMEOUT = 30 * 60_000;

export const abandonIfStillPreparing = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (room?.state === "preparing") {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
    }
    return null;
  },
});

export const abandonIdleRoom = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.state !== "waiting") return null;

    const remaining = IDLE_ROOM_TIMEOUT - (Date.now() - room.lastActivityAt);
    if (remaining <= 0) {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
      return null;
    }

    await ctx.scheduler.runAfter(remaining, internal.scheduling.abandonIdleRoom, {
      roomId: args.roomId,
    });
    return null;
  },
});

export async function endRoundHandler(ctx: MutationCtx, roundId: Id<"rounds">) {
  const round = await ctx.db.get(roundId);
  if (!round || round.state !== "active") return null;

  const room = await ctx.db.get(round.roomId);
  if (!room) return null;

  const answers = await ctx.db
    .query("answers")
    .withIndex("by_roundId", (q) => q.eq("roundId", roundId))
    .take(MAX_PLAYERS);

  const players = await ctx.db
    .query("players")
    .withIndex("by_roomId", (q) => q.eq("roomId", round.roomId))
    .take(MAX_PLAYERS);

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
  return null;
}

export const endRound = internalMutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => endRoundHandler(ctx, args.roundId),
});

export async function endRevealHandler(ctx: MutationCtx, roundId: Id<"rounds">) {
  const round = await ctx.db.get(roundId);
  if (!round || round.state !== "revealing") return null;

  await ctx.db.patch(roundId, { state: "complete" });

  const room = await ctx.db.get(round.roomId);
  if (!room) return null;

  // if this was the final round, end the game
  if (round.isFinal) {
    await ctx.db.patch(room._id, { state: "finished" });
    await ctx.scheduler.runAfter(10 * 60_000, internal.scheduling.cleanupFinishedRoom, {
      roomId: room._id,
    });
    return null;
  }

  // advance to next round
  const nextRound = await ctx.db
    .query("rounds")
    .withIndex("by_roomId_and_roundNumber", (q) =>
      q.eq("roomId", round.roomId).eq("roundNumber", round.roundNumber + 1),
    )
    .unique();

  if (!nextRound) {
    await ctx.db.patch(room._id, { state: "finished" });
    await ctx.scheduler.runAfter(10 * 60_000, internal.scheduling.cleanupFinishedRoom, {
      roomId: room._id,
    });
    return null;
  }

  const now = Date.now();
  const introDuration = nextRound.isFinal ? 3_000 : 0;
  const startedAt = now + introDuration;
  const endsAt = startedAt + room.roundDuration;
  await ctx.db.patch(nextRound._id, {
    state: "active",
    startedAt,
    endsAt,
  });

  await ctx.db.patch(room._id, {
    currentRound: nextRound.roundNumber,
    lastActivityAt: now,
  });

  await ctx.scheduler.runAt(endsAt, internal.scheduling.endRound, {
    roundId: nextRound._id,
  });
  return null;
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
    if (!player) return null;

    const presence = await ctx.db
      .query("playerPresence")
      .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
      .unique();
    if (presence?.status !== "disconnected") return null;

    const room = await ctx.db.get(args.roomId);
    if (!room || room.state === "abandoned" || room.state === "finished") return null;

    const connected = (await listPlayersWithPresence(ctx.db, args.roomId))
      .filter(({ status }) => status === "connected")
      .map(({ player: connectedPlayer }) => connectedPlayer);

    if (connected.length === 0) {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
      return null;
    }

    // promote next host if the disconnected player was the host
    if (room.hostId === player.userId) {
      const nextHost = [...connected].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (nextHost) {
        await ctx.db.patch(args.roomId, { hostId: nextHost.userId });
      }
    }
    return null;
  },
});

async function expirePresenceHandler(ctx: MutationCtx, playerId: Id<"players">) {
  const player = await ctx.db.get(playerId);
  if (!player) return null;

  const [presence, heartbeat] = await Promise.all([
    ctx.db
      .query("playerPresence")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .unique(),
    ctx.db
      .query("playerHeartbeats")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .unique(),
  ]);
  if (presence?.status !== "connected") return null;

  const lastSeenAt = heartbeat?.lastSeenAt ?? 0;
  const remaining = PRESENCE_TIMEOUT_MS - (Date.now() - lastSeenAt);
  if (remaining > 0) {
    await ctx.scheduler.runAfter(remaining, internal.scheduling.expirePresence, { playerId });
    return null;
  }

  const now = Date.now();
  if (presence) {
    await ctx.db.patch(presence._id, { status: "disconnected", disconnectedAt: now });
  } else {
    await ctx.db.insert("playerPresence", {
      playerId,
      roomId: player.roomId,
      status: "disconnected",
      disconnectedAt: now,
    });
  }

  const room = await ctx.db.get(player.roomId);
  if (room?.state === "in_progress") {
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_roomId_and_roundNumber", (q) =>
        q.eq("roomId", room._id).eq("roundNumber", room.currentRound),
      )
      .unique();
    if (round?.state === "active") {
      const [players, answers] = await Promise.all([
        listPlayersWithPresence(ctx.db, room._id),
        ctx.db
          .query("answers")
          .withIndex("by_roundId", (q) => q.eq("roundId", round._id))
          .take(MAX_PLAYERS),
      ]);
      const connectedPlayerIds = new Set(
        players
          .filter(({ status }) => status === "connected")
          .map(({ player: candidate }) => candidate._id),
      );
      const connectedAnswerCount = answers.filter((answer) =>
        connectedPlayerIds.has(answer.playerId),
      ).length;
      if (connectedPlayerIds.size > 0 && connectedAnswerCount >= connectedPlayerIds.size) {
        await endRoundHandler(ctx, round._id);
      }
    }
  }

  await ctx.scheduler.runAfter(DISCONNECT_GRACE_MS, internal.scheduling.checkDisconnect, {
    playerId: player._id,
    roomId: player.roomId,
  });
  return null;
}

export const expirePresence = internalMutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => expirePresenceHandler(ctx, args.playerId),
});

export const cleanupFinishedRoom = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (room) {
      await ctx.db.patch(args.roomId, { state: "abandoned" });
    }
    return null;
  },
});
