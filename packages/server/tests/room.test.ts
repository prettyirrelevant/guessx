import { afterEach, describe, expect, it } from "vitest";
import { getServerByName } from "partyserver";
import { env } from "cloudflare:workers";
import { evictDurableObject, reset, SELF } from "cloudflare:test";
import {
  decodeMediaKey,
  MEDIA_IV_BYTES,
  unpackMediaFrame,
  type CommandArgs,
  CommandName,
  type CreateRoomInput,
  type RoomSnapshot,
  type RoundContent,
  type ServerMessage,
} from "@guessx/game";

import { AUTHENTICATED_USER_HEADER, GuessRoom } from "../src/room";
import type { Env } from "../src/env";

const HOST = {
  userId: "host-session",
  displayName: "Host",
  avatar: "host-avatar",
};
const GUEST = {
  userId: "guest-session",
  displayName: "Guest",
  avatar: "guest-avatar",
};
const ROUND: RoundContent = {
  roundNumber: 1,
  correctAnswer: "Correct",
  options: ["Correct", "Wrong A", "Wrong B", "Wrong C"],
  mediaUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg viewBox="0 0 1 1"/>')}`,
  isFinal: true,
};

afterEach(() => reset());

function roomInput(): CreateRoomInput {
  return {
    hostName: HOST.displayName,
    hostAvatar: HOST.avatar,
    mode: "place",
    maxPlayers: 6,
    totalRounds: 1,
    roundDuration: 20_000,
  };
}

async function createRoom(code: string) {
  const testEnv = env as Env;
  const stub = await getServerByName<Env, GuessRoom>(testEnv.GUESS_ROOM, code);
  expect(await stub.initialize(roomInput(), HOST.userId)).toEqual({ success: true });
  return stub;
}

async function connect(stub: DurableObjectStub<GuessRoom>, identity: typeof HOST) {
  const response = await stub.fetch("https://guessx.test/socket", {
    headers: {
      [AUTHENTICATED_USER_HEADER]: identity.userId,
      Upgrade: "websocket",
    },
  });
  expect(response.status).toBe(101);

  const socket = response.webSocket;
  if (!socket) throw new Error("WebSocket upgrade did not return a socket");
  socket.accept();

  const message = await waitForMessage(socket, (current) => current.type === "snapshot");
  if (message.type !== "snapshot") throw new Error("Expected a snapshot");
  return { socket, snapshot: message.snapshot };
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", receive);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 2_000);
    const receive = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", receive);
      resolve(message);
    };
    socket.addEventListener("message", receive);
  });
}

async function command(
  socket: WebSocket,
  name: CommandName,
  args?: CommandArgs,
  snapshotMatches: (snapshot: RoomSnapshot) => boolean = () => true,
): Promise<RoomSnapshot> {
  const requestId = crypto.randomUUID();
  const resultPromise = waitForMessage(
    socket,
    (message) => message.type === "commandResult" && message.requestId === requestId,
  );
  const snapshotPromise = waitForMessage(
    socket,
    (message) => message.type === "snapshot" && snapshotMatches(message.snapshot),
  );
  socket.send(JSON.stringify({ type: "command", requestId, command: name, args }));

  const result = await resultPromise;
  if (result.type !== "commandResult") throw new Error("Expected a command result");
  expect(result.result.error).toBeUndefined();

  const snapshot = await snapshotPromise;
  if (snapshot.type !== "snapshot") throw new Error("Expected a snapshot");
  return snapshot.snapshot;
}

describe("GuessRoom", () => {
  it("rejects invalid room settings and duplicate initialization", async () => {
    const testEnv = env as Env;
    const stub = await getServerByName<Env, GuessRoom>(testEnv.GUESS_ROOM, "AB-1000");

    expect(await stub.initialize({ ...roomInput(), maxPlayers: 1 }, HOST.userId)).toEqual({
      error: "invalid room settings",
    });
    expect(await stub.initialize(roomInput(), HOST.userId)).toEqual({ success: true });
    expect(await stub.initialize(roomInput(), HOST.userId)).toEqual({
      error: "room already exists",
    });
  });

  it("serializes preparation and releases failed attempts", async () => {
    const stub = await createRoom("AB-1003");
    const first = await stub.beginPreparation(HOST.userId);
    if ("error" in first) throw new Error(first.error);

    expect(await stub.beginPreparation(HOST.userId)).toEqual({
      error: "room preparation already started",
    });
    await stub.cancelPreparation(first.claimId);
    expect(await stub.beginPreparation(HOST.userId)).not.toHaveProperty("error");
  });

  it("keeps answers private during play and scores atomically", async () => {
    const stub = await createRoom("AB-1001");
    expect(
      await stub.join(GUEST.userId, {
        roomCode: "AB-1001",
        displayName: GUEST.displayName,
        avatar: GUEST.avatar,
      }),
    ).toMatchObject({ success: true });
    const preparation = await stub.beginPreparation(HOST.userId);
    if ("error" in preparation) throw new Error(preparation.error);
    expect(await stub.completePreparation(preparation.claimId, [ROUND])).toEqual({
      success: true,
    });

    const { socket: hostSocket } = await connect(stub, HOST);
    const { socket: guestSocket } = await connect(stub, GUEST);
    const active = await command(
      hostSocket,
      "start",
      undefined,
      (snapshot) => snapshot.round?.state === "active",
    );
    expect(active.round?.state).toBe("active");
    expect(active.round).not.toHaveProperty("correctAnswer");

    const hostPlayer = active.players.find((player) => player.isCurrent);
    if (!hostPlayer || !active.round) throw new Error("Missing host or active round");
    expect(
      await rawCommand(hostSocket, "submitAnswer", {
        roundId: active.round._id,
        selectedOption: "Correct",
      }),
    ).toEqual({ error: "round has not started" });
    await new Promise((resolve) =>
      setTimeout(resolve, (active.round?.startedAt ?? 0) - Date.now()),
    );
    const afterHostAnswer = await command(
      hostSocket,
      "submitAnswer",
      {
        roundId: active.round._id,
        selectedOption: "Correct",
      },
      (snapshot) => snapshot.round?.state === "active" && snapshot.answers.length === 1,
    );
    expect(afterHostAnswer.round?.state).toBe("active");
    expect(afterHostAnswer.answers).toEqual([
      expect.objectContaining({ playerId: hostPlayer._id, hasAnswered: true }),
    ]);
    expect(afterHostAnswer.answers[0]).not.toHaveProperty("selectedOption");

    const revealed = await command(
      guestSocket,
      "submitAnswer",
      {
        roundId: active.round._id,
        selectedOption: "Wrong A",
      },
      (snapshot) => snapshot.round?.state === "revealing",
    );
    expect(revealed.round?.state).toBe("revealing");
    expect(revealed.round).toHaveProperty("revealEndsAt");
    expect(revealed.round).toHaveProperty("correctAnswer", "Correct");
    expect(revealed.leaderboard.map((player) => player.totalScore)).toEqual([20, -2]);

    hostSocket.close();
    guestSocket.close();
  }, 10_000);

  it("serves round media only as ciphertext that the round key opens", async () => {
    const stub = await createRoom("AB-1004");
    await stub.join(GUEST.userId, {
      roomCode: "AB-1004",
      displayName: GUEST.displayName,
      avatar: GUEST.avatar,
    });
    const preparation = await stub.beginPreparation(HOST.userId);
    if ("error" in preparation) throw new Error(preparation.error);
    await stub.completePreparation(preparation.claimId, [ROUND]);
    const { socket: hostSocket, snapshot: lobby } = await connect(stub, HOST);
    const { socket: guestSocket } = await connect(stub, GUEST);

    expect(lobby.round).toBeNull();
    expect(lobby.prefetch).toHaveLength(1);
    const response = await SELF.fetch(`https://worker.test${lobby.prefetch[0]}`);
    expect(response.status).toBe(200);
    const blob = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(blob)).not.toContain("svg");

    const active = await command(hostSocket, "start", undefined, (current) => !!current.round);
    const keyBytes = decodeMediaKey(active.round?.media.key ?? "");
    if (!keyBytes) throw new Error("Missing media key");
    expect(active.round?.media.path).toBe(lobby.prefetch[0]);
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    const frame = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.subarray(0, MEDIA_IV_BYTES) },
      key,
      blob.subarray(MEDIA_IV_BYTES),
    );
    const media = unpackMediaFrame(new Uint8Array(frame));
    expect(media?.contentType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(media?.bytes)).toBe('<svg viewBox="0 0 1 1"/>');

    const missing = await SELF.fetch(
      "https://worker.test/api/media/AB-1004/00000000-0000-0000-0000-000000000000",
    );
    expect(missing.status).toBe(404);
    hostSocket.close();
    guestSocket.close();
  });
  it("retains connection identity across hibernation", async () => {
    const stub = await createRoom("AB-1002");
    const { socket } = await connect(stub, HOST);

    await evictDurableObject(stub);
    const snapshot = await command(
      socket,
      "close",
      undefined,
      (current) => current.room.state === "abandoned",
    );
    expect(snapshot.room.state).toBe("abandoned");
    socket.close();
  });
});

async function rawCommand(socket: WebSocket, name: CommandName, args?: CommandArgs) {
  const requestId = crypto.randomUUID();
  const result = waitForMessage(
    socket,
    (message) => message.type === "commandResult" && message.requestId === requestId,
  );
  socket.send(JSON.stringify({ type: "command", requestId, command: name, args }));
  const message = await result;
  return message.type === "commandResult" ? message.result : null;
}
