import type { JoinRoomInput } from "@guessx/game";

import * as actions from "./actions";

async function unwrap<T>(pending: Promise<actions.ActionResult<T>>): Promise<T> {
  const result = await pending;
  if ("error" in result) throw new Error(result.error);
  return result.value;
}

export const createRoom = (input: Parameters<typeof actions.createRoom>[0]) =>
  unwrap(actions.createRoom(input));
export const joinRoom = (input: JoinRoomInput) => unwrap(actions.joinRoom(input));
export const getRoomSocketTicket = (input: JoinRoomInput) =>
  unwrap(actions.getRoomSocketTicket(input));
export const prepareGame = (roomCode: string) => unwrap(actions.prepareGame(roomCode));
export const searchArtists = (query: string) => unwrap(actions.searchArtists(query));
