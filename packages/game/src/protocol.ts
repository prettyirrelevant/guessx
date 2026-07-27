import type { PublicAnswer, PublicPlayer, PublicRoom, PublicRound } from "./models";

export type RoomSnapshot = {
  room: PublicRoom;
  players: PublicPlayer[];
  round: PublicRound | null;
  answers: PublicAnswer[];
  leaderboard: PublicPlayer[];
  nextRoomCode: string | null;
};

export const COMMAND_NAMES = ["start", "close", "submitAnswer", "skipReveal", "playAgain"] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

export type CommandArgs = {
  roundId?: string;
  selectedOption?: string;
  hostName?: string;
  hostAvatar?: string;
};

export type ClientMessage = {
  type: "command";
  requestId: string;
  command: CommandName;
  args?: CommandArgs;
};

export type CommandResult = {
  success?: true;
  roomCode?: string;
  error?: string;
};

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "commandResult"; requestId: string; result: CommandResult }
  | { type: "roomNotFound" }
  | { type: "error"; error: string };
