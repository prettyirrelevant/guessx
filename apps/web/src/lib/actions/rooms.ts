"use server";

import type { CreateRoomInput, JoinRoomInput } from "@guessx/game";

import { apiRequest } from "./api";

export async function createRoom(input: CreateRoomInput) {
  const response = await apiRequest((client) => client.rooms.$post({ json: input }));
  const result = await response.json();
  if (!("roomCode" in result)) throw new Error(result.error ?? "could not create room");
  return { roomCode: result.roomCode };
}

export async function joinRoom(input: JoinRoomInput) {
  const response = await apiRequest((client) =>
    client.rooms[":roomCode"].join.$post({
      param: { roomCode: input.roomCode },
      json: input,
    }),
  );
  return response.json();
}

export async function getRoomSocketTicket(input: JoinRoomInput): Promise<string> {
  const joined = await joinRoom(input);
  if (joined.error) throw new Error(joined.error);

  const response = await apiRequest((client) =>
    client.rooms[":roomCode"]["socket-ticket"].$post({
      param: { roomCode: input.roomCode },
    }),
  );
  const result = await response.json();
  if (!("ticket" in result)) throw new Error(result.error ?? "could not authorize room connection");
  return result.ticket;
}
