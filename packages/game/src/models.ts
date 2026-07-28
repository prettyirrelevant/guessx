import type { PRESENCE_STATUSES, ROOM_MODES, ROOM_STATES, ROUND_STATES } from "./constants";

export type RoomMode = (typeof ROOM_MODES)[number];
export type RoomState = (typeof ROOM_STATES)[number];
export type RoundState = (typeof ROUND_STATES)[number];
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export type RoomSettings = {
  mode: RoomMode;
  maxPlayers: number;
  totalRounds: number;
  roundDuration: number;
  artist?: string;
  actorCategory?: string;
  continent?: string;
};

export type CreateRoomInput = RoomSettings & {
  hostName: string;
  hostAvatar: string;
};

export type JoinRoomInput = {
  roomCode: string;
  displayName: string;
  avatar: string;
};

export type RoundContent = {
  roundNumber: number;
  correctAnswer: string;
  options: string[];
  mediaUrl: string;
  mediaTitle?: string;
  mediaArtist?: string;
  attribution?: string;
  attributionUrl?: string;
  license?: string;
  licenseUrl?: string;
  isFinal: boolean;
};

export type PublicRoom = RoomSettings & {
  _id: string;
  roomId: string;
  state: RoomState;
  currentRound: number;
  prepStartedAt?: number;
  lastActivityAt: number;
  nextRoomId?: string;
  isHost: boolean;
};

export type PublicPlayer = {
  _id: string;
  roomId: string;
  displayName: string;
  avatar: string;
  totalScore: number;
  streak: number;
  joinedAt: number;
  status: PresenceStatus;
  disconnectedAt?: number;
  isCurrent: boolean;
  isHost: boolean;
};

type PublicRoundBase = Pick<RoundContent, "roundNumber" | "options" | "mediaUrl" | "isFinal"> & {
  _id: string;
  roomId: string;
  startedAt?: number;
  endsAt?: number;
};

export type ActiveRound = PublicRoundBase & {
  state: "pending" | "active";
};

export type RevealedRound = PublicRoundBase & {
  state: "revealing" | "complete";
  revealEndsAt?: number;
  correctAnswer: string;
  mediaTitle?: string;
  mediaArtist?: string;
  attribution?: string;
  attributionUrl?: string;
  license?: string;
  licenseUrl?: string;
};

export type PublicRound = ActiveRound | RevealedRound;

export type HiddenAnswer = {
  _id: string;
  playerId: string;
  hasAnswered: true;
};

export type RevealedAnswer = {
  _id: string;
  roundId: string;
  playerId: string;
  selectedOption: string;
  correct: boolean;
  submittedAt: number;
  pointsAwarded: number;
  position?: number;
};

export type PublicAnswer = HiddenAnswer | RevealedAnswer;
