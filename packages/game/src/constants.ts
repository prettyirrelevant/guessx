export const MAX_PLAYERS = 20;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 10;
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z]{2}-\d{4}$/;
export const ROOM_DURATIONS = [10_000, 15_000, 20_000, 30_000] as const;
export const ROOM_MODES = ["music", "place", "actor", "flag"] as const;
export const ROOM_STATES = [
  "preparing",
  "waiting",
  "in_progress",
  "finished",
  "abandoned",
] as const;
export const ROUND_STATES = ["pending", "active", "revealing", "complete"] as const;
export const PRESENCE_STATUSES = ["connected", "disconnected"] as const;
export const ROUND_LEAD_IN_MS = 2_000;
export const ANSWER_GRACE_MS = 750;
export const MEDIA_MAX_BYTES = 4 * 1024 * 1024;
