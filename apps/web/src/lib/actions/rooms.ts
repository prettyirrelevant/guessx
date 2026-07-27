"use server";

import type { CreateRoomInput, JoinRoomInput } from "@guessx/game";

import { gameServerRequest } from "./game-server";

type ApiResult = {
  success?: true;
  roomCode?: string;
  error?: string;
};

async function callGameServer(path: string, body: unknown): Promise<ApiResult> {
  const response = await gameServerRequest(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = (await response.json()) as ApiResult;
  if (!response.ok && !result.error) throw new Error("game server request failed");
  return result;
}

export async function createRoom(input: CreateRoomInput) {
  const result = await callGameServer("/api/rooms", input);
  if (!result.roomCode) throw new Error(result.error ?? "could not create room");
  return { roomCode: result.roomCode };
}

export async function joinRoom(input: JoinRoomInput) {
  return callGameServer(`/api/rooms/${encodeURIComponent(input.roomCode)}/join`, input);
}

export async function getRoomSocketTicket(input: JoinRoomInput): Promise<string> {
  const joined = await joinRoom(input);
  if (joined.error) throw new Error(joined.error);

  const response = await gameServerRequest(
    `/api/rooms/${encodeURIComponent(input.roomCode)}/socket-ticket`,
    { method: "POST" },
  );
  const result = (await response.json()) as { ticket?: string; error?: string };
  if (!response.ok || !result.ticket) {
    throw new Error(result.error ?? "could not authorize room connection");
  }
  return result.ticket;
}
