import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  rooms: defineTable({
    roomId: v.string(),
    hostId: v.string(),
    state: v.union(
      v.literal("preparing"),
      v.literal("waiting"),
      v.literal("in_progress"),
      v.literal("finished"),
      v.literal("abandoned"),
    ),
    mode: v.union(v.literal("music"), v.literal("place"), v.literal("actor"), v.literal("flag")),
    maxPlayers: v.number(),
    totalRounds: v.number(),
    roundDuration: v.number(),
    currentRound: v.number(),
    artist: v.optional(v.string()),
    country: v.optional(v.string()),
    actorCategory: v.optional(v.string()),
    continent: v.optional(v.string()),
    prepStartedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    nextRoomId: v.optional(v.string()),
  })
    .index("by_roomId", ["roomId"])
    .index("by_state", ["state"]),

  players: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    displayName: v.string(),
    avatar: v.string(),
    status: v.union(v.literal("connected"), v.literal("disconnected")),
    totalScore: v.number(),
    streak: v.number(),
    joinedAt: v.number(),
    disconnectedAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_userId", ["roomId", "userId"]),

  rounds: defineTable({
    roomId: v.id("rooms"),
    roundNumber: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("revealing"),
      v.literal("complete"),
    ),
    correctAnswer: v.string(),
    options: v.array(v.string()),
    mediaUrl: v.string(),
    mediaTitle: v.optional(v.string()),
    mediaArtist: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    isFinal: v.boolean(),
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_roundNumber", ["roomId", "roundNumber"]),

  answers: defineTable({
    roundId: v.id("rounds"),
    playerId: v.id("players"),
    selectedOption: v.string(),
    correct: v.boolean(),
    submittedAt: v.number(),
    pointsAwarded: v.number(),
    position: v.optional(v.number()),
  })
    .index("by_roundId", ["roundId"])
    .index("by_roundId_playerId", ["roundId", "playerId"]),
});
