import { v } from "convex/values";

import { disconnectPresence, listPlayersWithPresence, touchPresence } from "./presence";
import { DISCONNECT_GRACE_MS, MAX_PLAYERS, PRESENCE_TIMEOUT_MS } from "./model";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export const list = query({
  args: { roomId: v.id("rooms"), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const [room, entries] = await Promise.all([
      ctx.db.get(args.roomId),
      listPlayersWithPresence(ctx.db, args.roomId),
    ]);

    return entries.map(({ player, status, disconnectedAt }) => {
      const { userId, ...publicPlayer } = player;
      return {
        ...publicPlayer,
        status,
        disconnectedAt,
        isCurrent: userId === args.userId,
        isHost: userId === room?.hostId,
      };
    });
  },
});

export const leaderboard = query({
  args: { roomId: v.id("rooms"), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .take(MAX_PLAYERS);

    return [...players]
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((player) => {
        const { userId, ...publicPlayer } = player;
        return { ...publicPlayer, isCurrent: userId === args.userId };
      });
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
      .withIndex("by_roomId_and_userId", (q) =>
        q.eq("roomId", args.roomId).eq("userId", args.userId),
      )
      .unique();
    if (!player) return null;

    const now = Date.now();
    const needsWatchdog = await touchPresence(ctx, player._id, player.roomId, now);
    if (needsWatchdog) {
      await ctx.scheduler.runAfter(PRESENCE_TIMEOUT_MS, internal.scheduling.expirePresence, {
        playerId: player._id,
      });

      const room = await ctx.db.get(player.roomId);
      if (room?.state === "in_progress") {
        const round = await ctx.db
          .query("rounds")
          .withIndex("by_roomId_and_roundNumber", (q) =>
            q.eq("roomId", room._id).eq("roundNumber", room.currentRound),
          )
          .unique();
        if (round?.state === "active") {
          await ctx.scheduler.runAfter(0, internal.scheduling.endRoundIfReady, {
            roundId: round._id,
          });
        }
      }
    }
    return null;
  },
});

export const markDisconnected = mutation({
  args: { roomId: v.id("rooms"), userId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_roomId_and_userId", (q) =>
        q.eq("roomId", args.roomId).eq("userId", args.userId),
      )
      .unique();
    if (!player) return null;

    const disconnected = await disconnectPresence(ctx, player._id, Date.now());
    if (disconnected) {
      await ctx.scheduler.runAfter(DISCONNECT_GRACE_MS, internal.scheduling.checkDisconnect, {
        playerId: player._id,
        roomId: player.roomId,
      });
    }
    return null;
  },
});
