import { v } from "convex/values";

export const MAX_PLAYERS = 20;
export const MAX_ROUNDS = 10;
export const PRESENCE_TIMEOUT_MS = 30_000;
export const DISCONNECT_GRACE_MS = 45_000;

export const roomModeValidator = v.union(
  v.literal("music"),
  v.literal("place"), // Persisted identifier for logo mode.
  v.literal("actor"),
  v.literal("flag"),
);

export const roomStateValidator = v.union(
  v.literal("preparing"),
  v.literal("waiting"),
  v.literal("in_progress"),
  v.literal("finished"),
  v.literal("abandoned"),
);

export const roundStateValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("revealing"),
  v.literal("complete"),
);

export const presenceStatusValidator = v.union(v.literal("connected"), v.literal("disconnected"));

export const roundContentValidator = v.object({
  roundNumber: v.number(),
  correctAnswer: v.string(),
  options: v.array(v.string()),
  mediaUrl: v.string(),
  mediaTitle: v.optional(v.string()),
  mediaArtist: v.optional(v.string()),
  attribution: v.optional(v.string()),
  attributionUrl: v.optional(v.string()),
  license: v.optional(v.string()),
  licenseUrl: v.optional(v.string()),
  isFinal: v.boolean(),
});
