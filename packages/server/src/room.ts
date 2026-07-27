import {
  getServerByName,
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import {
  isClientMessage,
  type CommandArgs,
  type CommandName,
  type CommandResult,
  type CreateRoomInput,
  type JoinRoomInput,
  type RoundContent,
  type ServerMessage,
} from "@guessx/game";

import {
  beginPreparation,
  closeGame,
  completePreparation,
  connectPlayer,
  createGame,
  disconnectPlayer,
  joinGame,
  nextAlarm,
  processAlarm,
  releasePreparationClaim,
  replayInput,
  skipReveal,
  snapshotFor,
  startGame,
  submitAnswer,
  type StoredGame,
} from "./room-state";
import type { Env } from "./env";

const GAME_KEY = "game";
const MAX_CLIENT_MESSAGE_BYTES = 8_192;
const ROOM_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const messageEncoder = new TextEncoder();
export const AUTHENTICATED_USER_HEADER = "x-guessx-user-id";

type ConnectionIdentity = {
  userId: string;
};

type ReplayReservation =
  | { error: string }
  | {
      roomCode: string;
      input: CreateRoomInput;
    };

export function generateRoomCode(): string {
  const random = crypto.getRandomValues(new Uint32Array(3));
  const first = ROOM_CODE_LETTERS[random[0] % ROOM_CODE_LETTERS.length];
  const second = ROOM_CODE_LETTERS[random[1] % ROOM_CODE_LETTERS.length];
  return `${first}${second}-${1000 + (random[2] % 9000)}`;
}

function parseMessage(message: WSMessage) {
  if (typeof message !== "string" || message.length > MAX_CLIENT_MESSAGE_BYTES) return null;
  if (messageEncoder.encode(message).byteLength > MAX_CLIENT_MESSAGE_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(message);
    return isClientMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export class GuessRoom extends Server<Env> {
  static options = { hibernate: true };

  /** Writes the game and keeps its single Durable Object alarm aligned with the next deadline. */
  private async persist(transaction: DurableObjectTransaction, game: StoredGame): Promise<void> {
    await transaction.put(GAME_KEY, game);
    const deadline = nextAlarm(game);
    if (deadline === undefined) {
      await transaction.deleteAlarm();
      return;
    }
    await transaction.setAlarm(deadline);
  }

  /** Applies a state transition atomically and persists only successful mutations. */
  private async mutateGame(mutate: (game: StoredGame) => CommandResult): Promise<CommandResult> {
    return this.ctx.storage.transaction(async (transaction) => {
      const game = await transaction.get<StoredGame>(GAME_KEY);
      if (!game) return { error: "room not found" };

      const result = mutate(game);
      if (!result.success) return result;
      await this.persist(transaction, game);
      return result;
    });
  }

  private send(connection: Connection, message: ServerMessage): void {
    if (connection.readyState !== WebSocket.OPEN) return;
    try {
      connection.send(JSON.stringify(message));
    } catch {
      // The peer can close between the ready-state check and send.
    }
  }

  private close(connection: Connection, code: number, reason: string): void {
    try {
      connection.close(code, reason);
    } catch {
      // The peer may close before the server finishes handling the event.
    }
  }

  /** Sends each authenticated connection a snapshot filtered for that player's view. */
  private async broadcastSnapshots(): Promise<void> {
    const game = await this.ctx.storage.get<StoredGame>(GAME_KEY);
    if (!game) return;

    for (const connection of this.getConnections<ConnectionIdentity>()) {
      const userId = connection.state?.userId;
      if (!userId) continue;
      this.send(connection, { type: "snapshot", snapshot: snapshotFor(game, userId) });
    }
  }

  private notifyRoomRemoved(): void {
    for (const connection of this.getConnections()) {
      this.send(connection, { type: "roomNotFound" });
      this.close(connection, 1000, "room expired");
    }
  }

  /**
   * Creates this room once. Repeated replay initialization from the same source room is idempotent.
   */
  async initialize(
    input: CreateRoomInput,
    hostId: string,
    replayOf?: string,
  ): Promise<CommandResult> {
    return this.ctx.storage.transaction(async (transaction) => {
      const existing = await transaction.get<StoredGame>(GAME_KEY);
      if (existing) {
        if (replayOf && existing.replayOf === replayOf) return { success: true };
        return { error: "room already exists" };
      }

      const game = createGame(this.name, hostId, input, replayOf);
      if (!game) return { error: "invalid room settings" };
      await this.persist(transaction, game);
      return { success: true };
    });
  }

  async join(userId: string, input: JoinRoomInput): Promise<CommandResult> {
    const result = await this.mutateGame((game) => joinGame(game, userId, input));
    if (result.success) await this.broadcastSnapshots();
    return result;
  }

  /** Confirms room membership before the Worker issues a socket capability. */
  async hasPlayer(userId: string): Promise<boolean> {
    const game = await this.ctx.storage.get<StoredGame>(GAME_KEY);
    return game?.players.some((player) => player.userId === userId) ?? false;
  }

  /** Atomically claims provider work so concurrent preparation requests cannot fan out. */
  async beginPreparation(userId: string) {
    return this.ctx.storage.transaction(async (transaction) => {
      const game = await transaction.get<StoredGame>(GAME_KEY);
      if (!game) return { error: "room not found" } as const;

      const result = beginPreparation(game, userId);
      if ("error" in result) return result;
      await this.persist(transaction, game);
      return result;
    });
  }

  async cancelPreparation(userId: string, claimId: string): Promise<void> {
    await this.mutateGame((game) => releasePreparationClaim(game, userId, claimId));
  }

  async completePreparation(
    userId: string,
    claimId: string,
    rounds: RoundContent[],
  ): Promise<CommandResult> {
    const result = await this.mutateGame((game) =>
      completePreparation(game, userId, claimId, rounds),
    );
    if (result.success) await this.broadcastSnapshots();
    return result;
  }

  /** Connects a verified room member and persists their identity across hibernation. */
  async onConnect(
    connection: Connection<ConnectionIdentity>,
    context: ConnectionContext,
  ): Promise<void> {
    const userId = context.request.headers.get(AUTHENTICATED_USER_HEADER);
    if (!userId) {
      this.close(connection, 1008, "authentication required");
      return;
    }

    const result = await this.mutateGame((game) => connectPlayer(game, userId));
    if (result.error) {
      this.send(
        connection,
        result.error === "room not found"
          ? { type: "roomNotFound" }
          : { type: "error", error: result.error },
      );
      this.close(connection, 1008, result.error);
      return;
    }

    connection.setState({ userId });
    await this.broadcastSnapshots();
  }

  /** Handles validated client protocol messages for an identified room connection. */
  async onMessage(
    connection: Connection<ConnectionIdentity>,
    rawMessage: WSMessage,
  ): Promise<void> {
    const message = parseMessage(rawMessage);
    if (!message) {
      this.send(connection, { type: "error", error: "invalid message" });
      return;
    }

    const userId = connection.state?.userId;
    if (!userId) {
      this.send(connection, {
        type: "commandResult",
        requestId: message.requestId,
        result: { error: "connection is not authenticated" },
      });
      return;
    }

    let result: CommandResult;
    try {
      result = await this.runCommand(userId, message.command, message.args);
    } catch (error) {
      console.error("Room command failed", error);
      result = { error: "request failed" };
    }

    this.send(connection, { type: "commandResult", requestId: message.requestId, result });
    if (result.success) await this.broadcastSnapshots();
  }

  private runCommand(
    userId: string,
    command: CommandName,
    args?: CommandArgs,
  ): Promise<CommandResult> {
    switch (command) {
      case "start":
        return this.mutateGame((game) => startGame(game, userId));
      case "close":
        return this.mutateGame((game) => closeGame(game, userId));
      case "submitAnswer":
        return this.mutateGame((game) =>
          submitAnswer(game, userId, args?.roundId, args?.selectedOption),
        );
      case "skipReveal":
        return this.mutateGame((game) => skipReveal(game, userId, args?.roundId));
      case "playAgain":
        return this.createReplay(userId, args?.hostName, args?.hostAvatar);
    }
  }

  /**
   * Reserves a replay code in the current room before initializing the destination room.
   * Persisting the reservation makes retries safe after an interrupted Durable Object RPC.
   */
  private async reserveReplay(
    userId: string,
    hostName: string,
    hostAvatar: string,
    candidateCode: string,
  ): Promise<ReplayReservation> {
    return this.ctx.storage.transaction(async (transaction) => {
      const game = await transaction.get<StoredGame>(GAME_KEY);
      if (!game) return { error: "room not found" };

      const input = replayInput(game, userId, hostName, hostAvatar);
      if ("error" in input) return input;

      game.nextRoomId ??= candidateCode;
      await this.persist(transaction, game);
      return { roomCode: game.nextRoomId, input };
    });
  }

  private async clearReplayReservation(roomCode: string): Promise<void> {
    await this.ctx.storage.transaction(async (transaction) => {
      const game = await transaction.get<StoredGame>(GAME_KEY);
      if (!game || game.nextRoomId !== roomCode) return;
      game.nextRoomId = undefined;
      await this.persist(transaction, game);
    });
  }

  /** Allocates and initializes a replay room, retrying only room-code collisions. */
  private async createReplay(
    userId: string,
    hostName?: string,
    hostAvatar?: string,
  ): Promise<CommandResult> {
    if (!hostName || !hostAvatar) return { error: "invalid player profile" };

    for (let attempt = 0; attempt < 5; attempt++) {
      const reservation = await this.reserveReplay(
        userId,
        hostName,
        hostAvatar,
        generateRoomCode(),
      );
      if ("error" in reservation) return reservation;

      const stub = await getServerByName<Env, GuessRoom>(this.env.GUESS_ROOM, reservation.roomCode);
      const initialized = await stub.initialize(reservation.input, userId, this.name);
      if (initialized.success) return { success: true, roomCode: reservation.roomCode };
      if (initialized.error !== "room already exists") return initialized;

      await this.clearReplayReservation(reservation.roomCode);
    }
    return { error: "could not allocate a room code" };
  }

  private hasAnotherConnection(userId: string, excludedConnectionId: string): boolean {
    for (const connection of this.getConnections<ConnectionIdentity>()) {
      if (connection.id === excludedConnectionId) continue;
      if (connection.readyState !== WebSocket.OPEN) continue;
      if (connection.state?.userId === userId) return true;
    }
    return false;
  }

  /** Marks a player disconnected only after their final live connection closes. */
  private async handleDisconnect(connection: Connection<ConnectionIdentity>): Promise<void> {
    const userId = connection.state?.userId;
    if (!userId || this.hasAnotherConnection(userId, connection.id)) return;

    const result = await this.mutateGame((game) =>
      disconnectPlayer(game, userId) ? { success: true } : { error: "already disconnected" },
    );
    if (result.success) await this.broadcastSnapshots();
  }

  async onClose(connection: Connection<ConnectionIdentity>): Promise<void> {
    await this.handleDisconnect(connection);
  }

  async onError(connection: Connection<ConnectionIdentity>): Promise<void> {
    await this.handleDisconnect(connection);
  }

  /** Advances expired phases, resolves disconnect deadlines, or removes an expired room. */
  async onAlarm(): Promise<void> {
    const result = await this.ctx.storage.transaction(async (transaction) => {
      const game = await transaction.get<StoredGame>(GAME_KEY);
      if (!game) {
        await transaction.deleteAlarm();
        return "missing";
      }

      const action = processAlarm(game);
      if (action === "delete") {
        await transaction.delete(GAME_KEY);
        await transaction.deleteAlarm();
        return "deleted";
      }

      await this.persist(transaction, game);
      return "updated";
    });

    if (result === "deleted") {
      this.notifyRoomRemoved();
      return;
    }
    if (result === "updated") await this.broadcastSnapshots();
  }
}
