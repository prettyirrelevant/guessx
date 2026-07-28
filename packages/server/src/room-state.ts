import {
  isValidCreateRoomInput,
  isValidProfile,
  type CommandResult,
  type CreateRoomInput,
  type JoinRoomInput,
  type PublicAnswer,
  type PublicPlayer,
  type PublicRoom,
  type PublicRound,
  type RoomSnapshot,
  type RoundContent,
} from "@guessx/game";

const REVEAL_DURATION_MS = 10_000;
export const DISCONNECT_GRACE_MS = 45_000;
const PREPARATION_TIMEOUT_MS = 60_000;
const IDLE_ROOM_TIMEOUT_MS = 30 * 60_000;
const CLOSED_ROOM_RETENTION_MS = 10 * 60_000;
const BASE_POINTS = [10, 7, 5, 3];
const STREAK_THRESHOLD = 3;
const STREAK_BONUS = 2;

type StoredPlayer = {
  id: string;
  userId: string;
  displayName: string;
  avatar: string;
  totalScore: number;
  streak: number;
  joinedAt: number;
  status: "connected" | "disconnected";
  disconnectedAt?: number;
};

type StoredRound = RoundContent & {
  id: string;
  state: "pending" | "active" | "revealing" | "complete";
  startedAt?: number;
  endsAt?: number;
};

type StoredAnswer = {
  id: string;
  roundId: string;
  playerId: string;
  selectedOption: string;
  correct: boolean;
  submittedAt: number;
  pointsAwarded: number;
  position?: number;
};

export type StoredGame = {
  version: 1;
  roomCode: string;
  replayOf?: string;
  hostId: string;
  state: "preparing" | "waiting" | "in_progress" | "finished" | "abandoned";
  mode: "music" | "place" | "actor" | "flag";
  maxPlayers: number;
  totalRounds: number;
  roundDuration: number;
  currentRound: number;
  artist?: string;
  actorCategory?: string;
  continent?: string;
  prepStartedAt: number;
  preparationClaimId?: string;
  lastActivityAt: number;
  nextRoomId?: string;
  players: StoredPlayer[];
  rounds: StoredRound[];
  answers: StoredAnswer[];
  phaseDeadline?: number;
  purgeAt?: number;
  disconnectDeadlines: Record<string, number>;
};

function isHttpsUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedMediaUrl(value: string): boolean {
  const isInlineLogo =
    value.length <= 32_768 && value.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg%20");
  return isInlineLogo || isHttpsUrl(value);
}

function areValidRounds(rounds: RoundContent[], game: StoredGame): boolean {
  if (rounds.length !== game.totalRounds) return false;
  return rounds.every((round, index) => {
    if (round.roundNumber !== index + 1) return false;
    if (round.isFinal !== (index === game.totalRounds - 1)) return false;
    if (round.options.length !== 4 || new Set(round.options).size !== 4) return false;
    if (!round.options.includes(round.correctAnswer)) return false;
    if (!round.options.every((option) => option.length > 0 && option.length <= 200)) return false;
    if (!isAllowedMediaUrl(round.mediaUrl)) return false;
    if (round.attributionUrl && !isHttpsUrl(round.attributionUrl)) return false;
    if (round.licenseUrl && !isHttpsUrl(round.licenseUrl)) return false;
    if (round.attribution && round.attribution.length > 500) return false;
    if (round.license && round.license.length > 100) return false;
    return true;
  });
}

function currentRound(game: StoredGame): StoredRound | undefined {
  return game.rounds.find((round) => round.roundNumber === game.currentRound);
}

function touchWaitingRoom(game: StoredGame, now: number): void {
  game.lastActivityAt = now;
  if (game.state === "waiting") game.phaseDeadline = now + IDLE_ROOM_TIMEOUT_MS;
}

function retainClosedRoom(game: StoredGame, now: number): void {
  game.state = "abandoned";
  game.phaseDeadline = undefined;
  game.purgeAt = now + CLOSED_ROOM_RETENTION_MS;
  game.disconnectDeadlines = {};
}

function finishGame(game: StoredGame, now: number): void {
  game.state = "finished";
  game.phaseDeadline = undefined;
  game.purgeAt = now + CLOSED_ROOM_RETENTION_MS;
  game.disconnectDeadlines = {};
}

function scoreRound(game: StoredGame, round: StoredRound, now: number): void {
  if (round.state !== "active") return;

  const answers = game.answers.filter((answer) => answer.roundId === round.id);
  const playerOrder = game.players.toSorted((a, b) => b.totalScore - a.totalScore);
  const leaderboardPosition = new Map(playerOrder.map((player, index) => [player.id, index]));
  const correctAnswers = answers
    .filter((answer) => answer.correct)
    .toSorted((a, b) => a.submittedAt - b.submittedAt);
  const answeredPlayerIds = new Set(answers.map((answer) => answer.playerId));

  for (const [index, answer] of correctAnswers.entries()) {
    const player = game.players.find((entry) => entry.id === answer.playerId);
    if (!player) continue;

    let points = BASE_POINTS[Math.min(index, BASE_POINTS.length - 1)];
    const streak = player.streak + 1;
    if (streak >= STREAK_THRESHOLD) points += STREAK_BONUS;

    const position = leaderboardPosition.get(player.id) ?? game.players.length;
    if (position === 0) points = Math.round(points * 0.8);
    else if (position === 1) points = Math.round(points * 0.9);
    if (round.isFinal) points *= 2;

    answer.pointsAwarded = points;
    answer.position = index + 1;
    player.totalScore += points;
    player.streak = streak;
  }

  for (const answer of answers) {
    if (answer.correct) continue;
    const player = game.players.find((entry) => entry.id === answer.playerId);
    if (!player) continue;
    const penalty = round.isFinal ? -2 : -1;
    answer.pointsAwarded = penalty;
    player.totalScore += penalty;
    player.streak = 0;
  }

  for (const player of game.players) {
    if (!answeredPlayerIds.has(player.id)) player.streak = 0;
  }

  round.state = "revealing";
  game.phaseDeadline = now + REVEAL_DURATION_MS;
}

function scoreIfReady(game: StoredGame, now: number): void {
  const round = currentRound(game);
  if (!round || round.state !== "active") return;

  const answeredPlayerIds = new Set(
    game.answers.filter((answer) => answer.roundId === round.id).map((answer) => answer.playerId),
  );
  const everyoneAnswered =
    game.players.length > 0 && game.players.every((player) => answeredPlayerIds.has(player.id));
  const connectedPlayers = game.players.filter((player) => player.status === "connected");
  const connectedPlayersAnswered =
    connectedPlayers.length > 0 &&
    connectedPlayers.every((player) => answeredPlayerIds.has(player.id));

  if (everyoneAnswered || connectedPlayersAnswered) scoreRound(game, round, now);
}

function advanceRound(game: StoredGame, round: StoredRound, now: number): void {
  if (round.state !== "revealing") return;
  round.state = "complete";

  if (round.isFinal) {
    finishGame(game, now);
    return;
  }

  const nextRound = game.rounds.find((entry) => entry.roundNumber === round.roundNumber + 1);
  if (!nextRound) {
    finishGame(game, now);
    return;
  }

  const introDuration = nextRound.isFinal ? 3_000 : 0;
  nextRound.state = "active";
  nextRound.startedAt = now + introDuration;
  nextRound.endsAt = nextRound.startedAt + game.roundDuration;
  game.currentRound = nextRound.roundNumber;
  game.lastActivityAt = now;
  game.phaseDeadline = nextRound.endsAt;
}

function toPublicRound(game: StoredGame): PublicRound | null {
  const round = currentRound(game);
  if (!round) return null;

  const publicFields = {
    _id: round.id,
    roomId: game.roomCode,
    roundNumber: round.roundNumber,
    options: round.options,
    mediaUrl: round.mediaUrl,
    isFinal: round.isFinal,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
  };
  if (round.state === "pending" || round.state === "active") {
    return { ...publicFields, state: round.state };
  }
  return {
    ...publicFields,
    state: round.state,
    revealEndsAt: round.state === "revealing" ? game.phaseDeadline : undefined,
    correctAnswer: round.correctAnswer,
    mediaTitle: round.mediaTitle,
    mediaArtist: round.mediaArtist,
    attribution: round.attribution,
    attributionUrl: round.attributionUrl,
    license: round.license,
    licenseUrl: round.licenseUrl,
  };
}

/** Creates the persisted state for a new room, or rejects invalid room settings. */
export function createGame(
  roomCode: string,
  hostId: string,
  input: CreateRoomInput,
  replayOf?: string,
  now = Date.now(),
): StoredGame | null {
  if (hostId.length < 1 || hostId.length > 100) return null;
  if (!isValidCreateRoomInput(input)) return null;
  return {
    version: 1,
    roomCode,
    replayOf,
    hostId,
    state: "preparing",
    mode: input.mode,
    maxPlayers: input.maxPlayers,
    totalRounds: input.totalRounds,
    roundDuration: input.roundDuration,
    currentRound: 0,
    artist: input.artist,
    actorCategory: input.actorCategory,
    continent: input.continent,
    prepStartedAt: now,
    lastActivityAt: now,
    players: [
      {
        id: crypto.randomUUID(),
        userId: hostId,
        displayName: input.hostName,
        avatar: input.hostAvatar,
        totalScore: 0,
        streak: 0,
        joinedAt: now,
        status: "disconnected",
      },
    ],
    rounds: [],
    answers: [],
    phaseDeadline: now + PREPARATION_TIMEOUT_MS,
    disconnectDeadlines: {},
  };
}

/** Adds a player while the room is open, treating a repeated user ID as an idempotent join. */
export function joinGame(game: StoredGame, userId: string, input: JoinRoomInput): CommandResult {
  if (input.roomCode !== game.roomCode) return { error: "invalid room code" };
  if (userId.length < 1 || userId.length > 100) return { error: "invalid player profile" };
  if (!isValidProfile(input.displayName, input.avatar)) {
    return { error: "invalid player profile" };
  }

  const now = Date.now();
  const existing = game.players.find((player) => player.userId === userId);
  if (existing) {
    existing.displayName = input.displayName;
    existing.avatar = input.avatar;
    touchWaitingRoom(game, now);
    return { success: true, roomCode: game.roomCode };
  }
  if (game.state !== "waiting" && game.state !== "preparing") {
    return { error: "game already in progress" };
  }
  if (game.players.length >= game.maxPlayers) return { error: "room is full" };

  game.players.push({
    id: crypto.randomUUID(),
    userId,
    displayName: input.displayName,
    avatar: input.avatar,
    totalScore: 0,
    streak: 0,
    joinedAt: now,
    status: "disconnected",
  });
  touchWaitingRoom(game, now);
  return { success: true, roomCode: game.roomCode };
}

/** Attaches an authenticated connection to an existing room member. */
export function connectPlayer(game: StoredGame, userId: string): CommandResult {
  const player = game.players.find((entry) => entry.userId === userId);
  if (!player) return { error: "join the room before connecting" };

  player.status = "connected";
  player.disconnectedAt = undefined;
  delete game.disconnectDeadlines[player.id];
  touchWaitingRoom(game, Date.now());
  return { success: true };
}

/** Claims content generation so duplicate requests cannot fan out to external providers. */
export function beginPreparation(game: StoredGame, userId: string) {
  if (game.hostId !== userId) return { error: "only the host can prepare" } as const;
  if (game.state !== "preparing") return { error: "room not preparing" } as const;
  if (game.preparationClaimId) return { error: "room preparation already started" } as const;

  const claimId = crypto.randomUUID();
  game.preparationClaimId = claimId;
  game.phaseDeadline = Date.now() + PREPARATION_TIMEOUT_MS;
  return {
    claimId,
    config: {
      mode: game.mode,
      totalRounds: game.totalRounds,
      artist: game.artist,
      actorCategory: game.actorCategory,
      continent: game.continent,
    },
  };
}

/** Releases a failed content-generation claim so the host can retry. */
export function releasePreparationClaim(
  game: StoredGame,
  userId: string,
  claimId: string,
): CommandResult {
  if (game.hostId !== userId || game.preparationClaimId !== claimId) {
    return { error: "invalid preparation claim" };
  }
  game.preparationClaimId = undefined;
  game.phaseDeadline = Date.now() + PREPARATION_TIMEOUT_MS;
  return { success: true };
}

/** Validates generated content and transitions a prepared room into the waiting state. */
export function completePreparation(
  game: StoredGame,
  userId: string,
  claimId: string,
  rounds: RoundContent[],
): CommandResult {
  if (game.hostId !== userId) return { error: "only the host can prepare" };
  if (game.state !== "preparing") return { error: "room not preparing" };
  if (game.preparationClaimId !== claimId) return { error: "invalid preparation claim" };
  if (!areValidRounds(rounds, game)) return { error: "invalid rounds" };

  const now = Date.now();
  game.rounds = rounds.map((round) => ({
    ...round,
    id: crypto.randomUUID(),
    state: "pending",
  }));
  game.state = "waiting";
  game.preparationClaimId = undefined;
  game.lastActivityAt = now;
  game.phaseDeadline = now + IDLE_ROOM_TIMEOUT_MS;
  return { success: true };
}

/** Starts the first round after verifying host authority and connected player count. */
export function startGame(game: StoredGame, userId: string): CommandResult {
  if (game.hostId !== userId) return { error: "only the host can start" };
  if (game.state !== "waiting") return { error: "game not in waiting state" };
  if (game.players.filter((player) => player.status === "connected").length < 2) {
    return { error: "need at least 2 players" };
  }

  const firstRound = game.rounds.find((round) => round.roundNumber === 1);
  if (!firstRound) return { error: "first round not found" };

  const now = Date.now();
  const introDuration = firstRound.isFinal ? 3_000 : 0;
  firstRound.state = "active";
  firstRound.startedAt = now + introDuration;
  firstRound.endsAt = firstRound.startedAt + game.roundDuration;
  game.state = "in_progress";
  game.currentRound = 1;
  game.lastActivityAt = now;
  game.phaseDeadline = firstRound.endsAt;
  return { success: true };
}

/** Closes a room and retains its final state until the cleanup alarm fires. */
export function closeGame(game: StoredGame, userId: string): CommandResult {
  if (game.hostId !== userId) return { error: "only the host can close the room" };
  if (game.state === "finished" || game.state === "abandoned") {
    return { error: "room is already closed" };
  }
  retainClosedRoom(game, Date.now());
  return { success: true };
}

/** Records one answer per player and scores immediately when every connected player has answered. */
export function submitAnswer(
  game: StoredGame,
  userId: string,
  roundId?: string,
  selectedOption?: string,
): CommandResult {
  const round = game.rounds.find((entry) => entry.id === roundId);
  if (!round || round.state !== "active") return { error: "round is not active" };

  const now = Date.now();
  if (round.endsAt && now > round.endsAt) return { error: "time's up" };
  if (!selectedOption || !round.options.includes(selectedOption)) {
    return { error: "invalid option" };
  }

  const player = game.players.find((entry) => entry.userId === userId);
  if (!player) return { error: "player not found in room" };
  const alreadyAnswered = game.answers.some(
    (answer) => answer.roundId === round.id && answer.playerId === player.id,
  );
  if (alreadyAnswered) return { error: "already answered" };

  game.answers.push({
    id: crypto.randomUUID(),
    roundId: round.id,
    playerId: player.id,
    selectedOption,
    correct: selectedOption === round.correctAnswer,
    submittedAt: now,
    pointsAwarded: 0,
  });
  scoreIfReady(game, now);
  return { success: true };
}

/** Lets the host end the reveal phase without waiting for its alarm. */
export function skipReveal(game: StoredGame, userId: string, roundId?: string): CommandResult {
  const round = game.rounds.find((entry) => entry.id === roundId);
  if (!round || round.state !== "revealing") return { error: "round not revealing" };
  if (game.hostId !== userId) return { error: "only the host can skip" };
  advanceRound(game, round, Date.now());
  return { success: true };
}

/** Starts a grace period before a disconnected player can affect host ownership or room lifetime. */
export function disconnectPlayer(game: StoredGame, userId: string, now = Date.now()): boolean {
  const player = game.players.find((entry) => entry.userId === userId);
  if (!player || player.status === "disconnected") return false;

  player.status = "disconnected";
  player.disconnectedAt = now;
  game.disconnectDeadlines[player.id] = now + DISCONNECT_GRACE_MS;
  if (game.state === "in_progress") scoreIfReady(game, now);
  return true;
}

/**
 * Applies every deadline due at `now`.
 * Returns `delete` only when the Durable Object should remove the persisted room.
 */
export function processAlarm(game: StoredGame, now = Date.now()): "updated" | "delete" {
  if (game.purgeAt && game.purgeAt <= now) return "delete";

  if (game.phaseDeadline && game.phaseDeadline <= now) {
    if (game.state === "preparing" || game.state === "waiting") {
      retainClosedRoom(game, now);
    } else if (game.state === "in_progress") {
      const round = currentRound(game);
      if (round?.state === "active") scoreRound(game, round, now);
      else if (round?.state === "revealing") advanceRound(game, round, now);
    }
  }

  for (const [playerId, deadline] of Object.entries(game.disconnectDeadlines)) {
    if (deadline > now) continue;
    delete game.disconnectDeadlines[playerId];

    const player = game.players.find((entry) => entry.id === playerId);
    if (!player || player.status !== "disconnected") continue;
    const connectedPlayers = game.players.filter((entry) => entry.status === "connected");
    if (connectedPlayers.length === 0 && game.state !== "finished" && game.state !== "abandoned") {
      retainClosedRoom(game, now);
      break;
    }
    if (game.hostId !== player.userId) continue;
    const nextHost = connectedPlayers.toSorted((a, b) => a.joinedAt - b.joinedAt)[0];
    if (nextHost) game.hostId = nextHost.userId;
  }
  return "updated";
}

/** Returns the earliest deadline represented by the Durable Object's single alarm. */
export function nextAlarm(game: StoredGame): number | undefined {
  const deadlines = [
    game.phaseDeadline,
    game.purgeAt,
    ...Object.values(game.disconnectDeadlines),
  ].filter((value): value is number => typeof value === "number");
  return deadlines.length > 0 ? Math.min(...deadlines) : undefined;
}

/** Builds validated creation input for a host replay while preserving the previous room settings. */
export function replayInput(
  game: StoredGame,
  userId: string,
  hostName: string,
  hostAvatar: string,
): CreateRoomInput | { error: string } {
  if (!isValidProfile(hostName, hostAvatar)) return { error: "invalid player profile" };
  if (game.state !== "finished") return { error: "game not finished" };
  if (game.hostId !== userId) return { error: "only the host can restart" };
  return {
    hostName,
    hostAvatar,
    mode: game.mode,
    maxPlayers: game.maxPlayers,
    totalRounds: game.totalRounds,
    roundDuration: game.roundDuration,
    artist: game.artist,
    actorCategory: game.actorCategory,
    continent: game.continent,
  };
}

/**
 * Builds a player-specific public view.
 * Correct answers and answer details remain hidden until the reveal phase.
 */
export function snapshotFor(game: StoredGame, userId: string): RoomSnapshot {
  const room: PublicRoom = {
    _id: game.roomCode,
    roomId: game.roomCode,
    state: game.state,
    mode: game.mode,
    maxPlayers: game.maxPlayers,
    totalRounds: game.totalRounds,
    roundDuration: game.roundDuration,
    currentRound: game.currentRound,
    artist: game.artist,
    actorCategory: game.actorCategory,
    continent: game.continent,
    prepStartedAt: game.prepStartedAt,
    lastActivityAt: game.lastActivityAt,
    nextRoomId: game.nextRoomId,
    isHost: game.hostId === userId,
  };
  const players: PublicPlayer[] = game.players.map((player) => ({
    _id: player.id,
    roomId: game.roomCode,
    displayName: player.displayName,
    avatar: player.avatar,
    totalScore: player.totalScore,
    streak: player.streak,
    joinedAt: player.joinedAt,
    status: player.status,
    disconnectedAt: player.disconnectedAt,
    isCurrent: player.userId === userId,
    isHost: player.userId === game.hostId,
  }));

  const round = currentRound(game);
  let answers: PublicAnswer[] = [];
  if (round) {
    const roundAnswers = game.answers.filter((answer) => answer.roundId === round.id);
    answers =
      round.state === "active"
        ? roundAnswers.map((answer) => ({
            _id: answer.id,
            playerId: answer.playerId,
            hasAnswered: true,
          }))
        : roundAnswers.map((answer) => ({
            _id: answer.id,
            roundId: answer.roundId,
            playerId: answer.playerId,
            selectedOption: answer.selectedOption,
            correct: answer.correct,
            submittedAt: answer.submittedAt,
            pointsAwarded: answer.pointsAwarded,
            position: answer.position,
          }));
  }

  return {
    room,
    players,
    round: toPublicRound(game),
    answers,
    leaderboard: players.toSorted((a, b) => b.totalScore - a.totalScore),
    nextRoomCode: game.nextRoomId ?? null,
  };
}
