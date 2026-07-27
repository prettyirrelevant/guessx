"use server";

import { limitPreparation } from "./rate-limit";
import { gameServerRequest } from "./game-server";

export async function prepareGame(roomId: string) {
  try {
    await limitPreparation(roomId);
    const response = await gameServerRequest(
      `/api/rooms/${encodeURIComponent(roomId)}/preparation`,
      { method: "POST" },
    );
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "failed to prepare the room");
    return { success: true as const };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "failed to prepare the room" };
  }
}
