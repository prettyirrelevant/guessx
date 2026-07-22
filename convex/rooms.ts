import { v } from "convex/values";

import { listPlayersWithPresence, touchPresence } from "./presence";
import { MAX_PLAYERS, MAX_ROUNDS, PRESENCE_TIMEOUT_MS, roomModeValidator } from "./model";
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

  const hostPlayerId = await ctx.db.insert("players", {
    roomId,
    userId: args.hostId,
    displayName: args.hostName,
    avatar: args.hostAvatar,
    totalScore: 0,
    streak: 0,
    joinedAt: now,
  });
  await touchPresence(ctx, hostPlayerId, roomId, now);

  await ctx.scheduler.runAfter(PRESENCE_TIMEOUT_MS, internal.scheduling.expirePresence, {
    playerId: hostPlayerId,
  });

  await ctx.scheduler.runAfter(60_000, internal.scheduling.abandonIfStillPreparing, {
    roomId,
  });

  return { roomCode, roomId };
}

export const create = mutation({
  args: {
    hostId: v.string(),
    mode: roomModeValidator,
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
    if (
      args.hostId.length < 1 ||
      args.hostId.length > 100 ||
      args.hostName.trim().length < 1 ||
      args.hostName.length > 20 ||
      args.hostAvatar.length > 100 ||
      !Number.isInteger(args.maxPlayers) ||
      args.maxPlayers < 2 ||
      args.maxPlayers > MAX_PLAYERS ||
      !Number.isInteger(args.totalRounds) ||
      args.totalRounds < 1 ||
      args.totalRounds > MAX_ROUNDS ||
      ![10_000, 15_000, 20_000, 30_000].includes(args.roundDuration)
    ) {
      throw new Error("invalid room settings");
    }
    return createRoom(ctx, args);
  },
});

export const close = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return { error: "room not found" };
    if (room.hostId !== args.userId) return { error: "only the host can close the room" };
    if (room.state === "finished" || room.state === "abandoned") {
      return { error: "room is already closed" };
    }

    await ctx.db.patch(args.roomId, { state: "abandoned" });
    return { success: true };
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
    if (
      args.displayName.trim().length < 1 ||
      args.displayName.length > 20 ||
      args.avatar.length < 1 ||
      args.avatar.length > 100
    ) {
      return { error: "invalid player profile" };
    }

    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomCode))
      .unique();

    if (!room) return { error: "room not found" };
    if (room.state !== "waiting" && room.state !== "preparing") {
      return { error: "game already in progress" };
    }

    const existing = await ctx.db
      .query("players")
      .withIndex("by_roomId_and_userId", (q) => q.eq("roomId", room._id).eq("userId", args.userId))
      .unique();

    if (existing) {
      const now = Date.now();
      const needsWatchdog = await touchPresence(ctx, existing._id, room._id, now);
      if (needsWatchdog) {
        await ctx.scheduler.runAfter(PRESENCE_TIMEOUT_MS, internal.scheduling.expirePresence, {
          playerId: existing._id,
        });
      }
      await ctx.db.patch(room._id, { lastActivityAt: now });
      return { roomId: room._id, roomCode: room.roomId };
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
      .take(room.maxPlayers);
    if (players.length >= room.maxPlayers) return { error: "room is full" };

    const now = Date.now();
    const playerId = await ctx.db.insert("players", {
      roomId: room._id,
      userId: args.userId,
      displayName: args.displayName,
      avatar: args.avatar,
      totalScore: 0,
      streak: 0,
      joinedAt: now,
    });
    await touchPresence(ctx, playerId, room._id, now);

    await ctx.db.patch(room._id, { lastActivityAt: now });
    await ctx.scheduler.runAfter(PRESENCE_TIMEOUT_MS, internal.scheduling.expirePresence, {
      playerId,
    });

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

    const players = (await listPlayersWithPresence(ctx.db, args.roomId)).filter(
      ({ status }) => status === "connected",
    );

    if (players.length < 2) return { error: "need at least 2 players" };

    const firstRound = await ctx.db
      .query("rounds")
      .withIndex("by_roomId_and_roundNumber", (q) =>
        q.eq("roomId", args.roomId).eq("roundNumber", 1),
      )
      .unique();

    if (!firstRound) return { error: "first round not found" };

    const now = Date.now();
    const introDuration = firstRound.isFinal ? 3_000 : 0;
    const startedAt = now + introDuration;
    const endsAt = startedAt + room.roundDuration;
    await ctx.db.patch(args.roomId, {
      state: "in_progress",
      currentRound: 1,
      lastActivityAt: now,
    });

    await ctx.db.patch(firstRound._id, {
      state: "active",
      startedAt,
      endsAt,
    });

    await ctx.scheduler.runAt(endsAt, internal.scheduling.endRound, {
      roundId: firstRound._id,
    });

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
  args: { roomCode: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomCode))
      .unique();
    if (!room) return null;
    const { hostId, ...safeRoom } = room;
    return { ...safeRoom, isHost: args.userId === hostId };
  },
});
