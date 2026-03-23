import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();
  },
});

export const leaderboard = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    return players.sort((a, b) => b.totalScore - a.totalScore);
  },
});

export const heartbeat = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_roomId_userId", (q) =>
        q.eq("roomId", args.roomId).eq("userId", args.userId)
      )
      .unique();

    if (!player) return;

    const now = Date.now();

    await ctx.db.patch(player._id, {
      status: "connected",
      lastSeenAt: now,
      ...(player.status === "disconnected" ? { disconnectedAt: undefined } : {}),
    });
  },
});

export const markDisconnected = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player || player.status === "disconnected") return;

    const now = Date.now();
    await ctx.db.patch(args.playerId, {
      status: "disconnected",
      disconnectedAt: now,
    });

    await ctx.scheduler.runAfter(45_000, internal.scheduling.checkDisconnect, {
      playerId: args.playerId,
      roomId: player.roomId,
    });
  },
});
