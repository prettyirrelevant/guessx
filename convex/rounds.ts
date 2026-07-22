import { v } from "convex/values";

import { endRoundHandler, endRevealHandler } from "./scheduling";
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

    const room = await ctx.db.get(args.roomId);
    if (!room || (round.state === "pending" && room.currentRound !== round.roundNumber)) {
      return null;
    }

    // Never expose answers before the reveal begins.
    if (round.state === "pending" || round.state === "active") {
      const {
        correctAnswer: _,
        mediaTitle: _mediaTitle,
        mediaArtist: _mediaArtist,
        attribution: _attribution,
        attributionUrl: _attributionUrl,
        license: _license,
        licenseUrl: _licenseUrl,
        ...safe
      } = round;
      return safe;
    }

    return round;
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
    userId: v.string(),
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

    if (!round.options.includes(args.selectedOption)) {
      return { error: "invalid option" };
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_roomId_userId", (q) => q.eq("roomId", round.roomId).eq("userId", args.userId))
      .unique();

    if (!player || player._id !== args.playerId) return { error: "player not found in room" };

    const existing = await ctx.db
      .query("answers")
      .withIndex("by_roundId_playerId", (q) =>
        q.eq("roundId", args.roundId).eq("playerId", player._id),
      )
      .unique();

    if (existing) return { error: "already answered" };

    await ctx.db.insert("answers", {
      roundId: args.roundId,
      playerId: player._id,
      selectedOption: args.selectedOption,
      correct: args.selectedOption === round.correctAnswer,
      submittedAt: now,
      pointsAwarded: 0,
    });

    // check if all connected players have answered to end round early
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", round.roomId))
      .collect();

    const connectedPlayerIds = new Set(
      players.filter((p) => p.status === "connected").map((p) => p._id),
    );
    const connectedCount = connectedPlayerIds.size;
    if (connectedCount > 0) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_roundId", (q) => q.eq("roundId", args.roundId))
        .collect();

      const connectedAnswerCount = answers.filter((answer) =>
        connectedPlayerIds.has(answer.playerId),
      ).length;
      if (connectedAnswerCount >= connectedCount) {
        await endRoundHandler(ctx, args.roundId);
      }
    }

    return { success: true };
  },
});

export const skipReveal = mutation({
  args: {
    roundId: v.id("rounds"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round || round.state !== "revealing") return { error: "round not revealing" };

    const room = await ctx.db.get(round.roomId);
    if (!room) return { error: "room not found" };
    if (room.hostId !== args.userId) return { error: "only the host can skip" };

    await endRevealHandler(ctx, args.roundId);

    return { success: true };
  },
});
