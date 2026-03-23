import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const get = query({
  args: {
    roomId: v.id("rooms"),
    roundNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_roomId_roundNumber", (q) =>
        q.eq("roomId", args.roomId).eq("roundNumber", args.roundNumber),
      )
      .unique();

    if (!round) return null;

    // never expose the correct answer while the round is active
    if (round.state === "active") {
      const { correctAnswer: _, ...safe } = round;
      return safe;
    }

    return round;
  },
});

export const mediaUrls = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    return rounds.map((r) => r.mediaUrl);
  },
});

export const answers = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) return [];

    const allAnswers = await ctx.db
      .query("answers")
      .withIndex("by_roundId", (q) => q.eq("roundId", args.roundId))
      .collect();

    // while active, only reveal that a player answered (not what they picked)
    if (round.state === "active") {
      return allAnswers.map((a) => ({
        _id: a._id,
        playerId: a.playerId,
        hasAnswered: true,
      }));
    }

    return allAnswers;
  },
});

export const submitAnswer = mutation({
  args: {
    roundId: v.id("rounds"),
    playerId: v.id("players"),
    selectedOption: v.string(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round || round.state !== "active") {
      return { error: "round is not active" };
    }

    const now = Date.now();
    if (round.endsAt && now > round.endsAt) {
      return { error: "time's up" };
    }

    const existing = await ctx.db
      .query("answers")
      .withIndex("by_roundId_playerId", (q) =>
        q.eq("roundId", args.roundId).eq("playerId", args.playerId),
      )
      .unique();

    if (existing) return { error: "already answered" };

    await ctx.db.insert("answers", {
      roundId: args.roundId,
      playerId: args.playerId,
      selectedOption: args.selectedOption,
      correct: args.selectedOption === round.correctAnswer,
      submittedAt: now,
      pointsAwarded: 0,
    });

    return { success: true };
  },
});
