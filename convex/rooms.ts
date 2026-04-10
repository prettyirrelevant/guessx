import { v } from "convex/values";

import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

function generateRoomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${l1}${l2}-${num}`;
}

async function createRoom(
  ctx: MutationCtx,
  args: {
    hostId: string;
    mode: "music" | "place" | "actor" | "flag";
    maxPlayers: number;
    totalRounds: number;
    roundDuration: number;
    artist?: string;
    country?: string;
    actorCategory?: string;
    continent?: string;
    hostName: string;
    hostAvatar: string;
  },
) {
  const roomCode = generateRoomCode();
  const now = Date.now();

  const roomId = await ctx.db.insert("rooms", {
    roomId: roomCode,
    hostId: args.hostId,
    state: "preparing",
    mode: args.mode,
    maxPlayers: args.maxPlayers,
    totalRounds: args.totalRounds,
    roundDuration: args.roundDuration,
    currentRound: 0,
    artist: args.artist,
    country: args.country,
    actorCategory: args.actorCategory,
    continent: args.continent,
    prepStartedAt: now,
    lastActivityAt: now,
  });

  await ctx.db.insert("players", {
    roomId,
    userId: args.hostId,
    displayName: args.hostName,
    avatar: args.hostAvatar,
    status: "connected",
    totalScore: 0,
    streak: 0,
    joinedAt: now,
    lastSeenAt: now,
  });

  await ctx.scheduler.runAfter(60_000, internal.scheduling.abandonIfStillPreparing, {
    roomId,
  });

  return { roomCode, roomId };
}

export const create = mutation({
  args: {
    hostId: v.string(),
    mode: v.union(v.literal("music"), v.literal("place"), v.literal("actor"), v.literal("flag")),
    maxPlayers: v.number(),
    totalRounds: v.number(),
    roundDuration: v.number(),
    artist: v.optional(v.string()),
    country: v.optional(v.string()),
    actorCategory: v.optional(v.string()),
    continent: v.optional(v.string()),
    hostName: v.string(),
    hostAvatar: v.string(),
  },
  handler: async (ctx, args) => {
    return createRoom(ctx, args);
  },
});

export const completePreparation = mutation({
  args: {
    roomId: v.id("rooms"),
    rounds: v.array(
      v.object({
        roundNumber: v.number(),
        correctAnswer: v.string(),
        options: v.array(v.string()),
        mediaUrl: v.string(),
        mediaTitle: v.optional(v.string()),
        mediaArtist: v.optional(v.string()),
        isFinal: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.state !== "preparing") return;

    for (const round of args.rounds) {
      await ctx.db.insert("rounds", {
        roomId: args.roomId,
        ...round,
        state: "pending",
      });
    }

    await ctx.db.patch(args.roomId, {
      state: "waiting",
      lastActivityAt: Date.now(),
    });

    await ctx.scheduler.runAfter(30 * 60_000, internal.scheduling.abandonIdleRoom, {
      roomId: args.roomId,
    });
  },
});

export const close = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.userId) return;
    if (room.state === "finished" || room.state === "abandoned") return;

    await ctx.db.patch(args.roomId, { state: "abandoned" });
  },
});

export const join = mutation({
  args: {
    roomCode: v.string(),
    userId: v.string(),
    displayName: v.string(),
    avatar: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomCode))
      .unique();

    if (!room) return { error: "room not found" };
    if (room.state !== "waiting" && room.state !== "preparing") {
      return { error: "game already in progress" };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
      .collect();

    if (players.length >= room.maxPlayers) return { error: "room is full" };

    const existing = players.find((p) => p.userId === args.userId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "connected",
        disconnectedAt: undefined,
        lastSeenAt: Date.now(),
      });
      return { roomId: room._id, roomCode: room.roomId };
    }

    const now = Date.now();
    await ctx.db.insert("players", {
      roomId: room._id,
      userId: args.userId,
      displayName: args.displayName,
      avatar: args.avatar,
      status: "connected",
      totalScore: 0,
      streak: 0,
      joinedAt: now,
      lastSeenAt: now,
    });

    await ctx.db.patch(room._id, { lastActivityAt: now });

    return { roomId: room._id, roomCode: room.roomId };
  },
});

export const start = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return { error: "room not found" };
    if (room.hostId !== args.userId) return { error: "only the host can start" };
    if (room.state !== "waiting") return { error: "game not in waiting state" };

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("status"), "connected"))
      .collect();

    if (players.length < 2) return { error: "need at least 2 players" };

    const now = Date.now();
    await ctx.db.patch(args.roomId, {
      state: "in_progress",
      currentRound: 1,
      lastActivityAt: now,
    });

    const firstRound = await ctx.db
      .query("rounds")
      .withIndex("by_roomId_roundNumber", (q) => q.eq("roomId", args.roomId).eq("roundNumber", 1))
      .unique();

    if (firstRound) {
      await ctx.db.patch(firstRound._id, {
        state: "active",
        startedAt: now,
        endsAt: now + room.roundDuration,
      });

      await ctx.scheduler.runAt(now + room.roundDuration, internal.scheduling.endRound, {
        roundId: firstRound._id,
      });
    }

    return { success: true };
  },
});

export const playAgain = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
    hostName: v.string(),
    hostAvatar: v.string(),
  },
  handler: async (ctx, args) => {
    const oldRoom = await ctx.db.get(args.roomId);
    if (!oldRoom) return { error: "room not found" };
    if (oldRoom.state !== "finished") return { error: "game not finished" };
    if (oldRoom.hostId !== args.userId) return { error: "only the host can restart" };
    if (oldRoom.nextRoomId) return { roomCode: oldRoom.nextRoomId };

    const result = await createRoom(ctx, {
      hostId: args.userId,
      mode: oldRoom.mode,
      maxPlayers: oldRoom.maxPlayers,
      totalRounds: oldRoom.totalRounds,
      roundDuration: oldRoom.roundDuration,
      artist: oldRoom.artist,
      country: oldRoom.country,
      actorCategory: oldRoom.actorCategory,
      continent: oldRoom.continent,
      hostName: args.hostName,
      hostAvatar: args.hostAvatar,
    });

    await ctx.db.patch(args.roomId, { nextRoomId: result.roomCode });

    return result;
  },
});

export const nextRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    return room?.nextRoomId ?? null;
  },
});

export const get = query({
  args: { roomCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomCode))
      .unique();
  },
});

export const getById = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.roomId);
  },
});
