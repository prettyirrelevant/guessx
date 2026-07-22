import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

import {
  presenceStatusValidator,
  roomModeValidator,
  roomStateValidator,
  roundContentValidator,
  roundStateValidator,
} from "./model";

export default defineSchema({
  rooms: defineTable({
    roomId: v.string(),
    // Bearer capability for host-only operations. Never return this from public queries.
    hostId: v.string(),
    state: roomStateValidator,
    mode: roomModeValidator,
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
  }).index("by_roomId", ["roomId"]),

  players: defineTable({
    roomId: v.id("rooms"),
    // Anonymous session capability. Public player queries must strip this field.
    userId: v.string(),
    displayName: v.string(),
    avatar: v.string(),
    totalScore: v.number(),
    streak: v.number(),
    joinedAt: v.number(),
    // Deprecated presence fields. Keep optional during the online migration,
    // then remove after existing documents have been cleaned up.
    status: v.optional(presenceStatusValidator),
    disconnectedAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_and_userId", ["roomId", "userId"]),

  playerPresence: defineTable({
    playerId: v.id("players"),
    roomId: v.id("rooms"),
    status: presenceStatusValidator,
    disconnectedAt: v.optional(v.number()),
  })
    .index("by_playerId", ["playerId"])
    .index("by_roomId", ["roomId"]),

  playerHeartbeats: defineTable({
    playerId: v.id("players"),
    lastSeenAt: v.number(),
  }).index("by_playerId", ["playerId"]),

  rounds: defineTable({
    roomId: v.id("rooms"),
    ...roundContentValidator.fields,
    state: roundStateValidator,
    startedAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  }).index("by_roomId_and_roundNumber", ["roomId", "roundNumber"]),

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
    .index("by_roundId_and_playerId", ["roundId", "playerId"]),
});
