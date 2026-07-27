"use server";

import { apiRequest } from "./api";

export async function prepareGame(roomId: string) {
  try {
    const response = await apiRequest((client) =>
      client.rooms[":roomCode"].preparation.$post({ param: { roomCode: roomId } }),
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error("error" in result ? result.error : "failed to prepare the room");
    }
    return { success: true as const };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "failed to prepare the room" };
  }
}
