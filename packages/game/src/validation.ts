import { COMMAND_NAMES, type ClientMessage, type CommandArgs, type CommandName } from "./protocol";
import type { CreateRoomInput, JoinRoomInput } from "./models";
import {
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  ROOM_CODE_PATTERN,
  ROOM_DURATIONS,
  ROOM_MODES,
} from "./constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

/** Validates the canonical human-readable room-code format. */
export function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && ROOM_CODE_PATTERN.test(value);
}

export function isValidProfile(displayName: unknown, avatar: unknown): boolean {
  return (
    typeof displayName === "string" &&
    typeof avatar === "string" &&
    displayName.trim().length >= 1 &&
    displayName.length <= 20 &&
    avatar.length >= 1 &&
    avatar.length <= 100
  );
}

/** Validates untrusted room-creation input and narrows it to the shared protocol type. */
export function isValidCreateRoomInput(input: unknown): input is CreateRoomInput {
  if (!isRecord(input)) return false;
  if ("hostId" in input) return false;
  if (!isValidProfile(input.hostName, input.hostAvatar)) return false;
  if (!ROOM_MODES.some((mode) => mode === input.mode)) return false;
  if (
    !Number.isInteger(input.maxPlayers) ||
    Number(input.maxPlayers) < 2 ||
    Number(input.maxPlayers) > MAX_PLAYERS
  ) {
    return false;
  }
  if (
    !Number.isInteger(input.totalRounds) ||
    Number(input.totalRounds) < MIN_ROUNDS ||
    Number(input.totalRounds) > MAX_ROUNDS
  ) {
    return false;
  }
  if (!ROOM_DURATIONS.some((duration) => duration === input.roundDuration)) return false;
  return (
    isOptionalString(input.artist) &&
    isOptionalString(input.actorCategory) &&
    isOptionalString(input.continent)
  );
}

/** Validates join input and rejects client-supplied identity fields. */
export function isValidJoinRoomInput(input: unknown): input is JoinRoomInput {
  if (!isRecord(input) || "userId" in input) return false;
  return isRoomCode(input.roomCode) && isValidProfile(input.displayName, input.avatar);
}

function isCommandName(value: unknown): value is CommandName {
  return COMMAND_NAMES.some((command) => command === value);
}

function isCommandArgs(value: unknown): value is CommandArgs | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.roundId) &&
    isOptionalString(value.selectedOption) &&
    isOptionalString(value.hostName) &&
    isOptionalString(value.hostAvatar)
  );
}

/** Validates and narrows an untrusted WebSocket payload before command dispatch. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value) || value.type !== "command") return false;
  return (
    typeof value.requestId === "string" && isCommandName(value.command) && isCommandArgs(value.args)
  );
}
