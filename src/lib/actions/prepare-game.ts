"use server";

import { ConvexHttpClient } from "convex/browser";

import type { Id } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

import { limitPreparation } from "./rate-limit";
import { prepareMusicContent } from "./music";
import { prepareLandmarkContent } from "./landmark";
import { prepareFlagContent } from "./flag";
import { prepareActorContent } from "./actor";

export async function prepareGame(access: { roomId: Id<"rooms">; userId: string }) {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");

    const client = new ConvexHttpClient(convexUrl);
    const config = await client.query(api.rooms.preparationConfig, access);
    if (!config) throw new Error("room preparation is not authorized");

    await limitPreparation(access.userId);

    let rounds;
    switch (config.mode) {
      case "music":
        rounds = await prepareMusicContent(config.artist ?? "", config.totalRounds);
        break;
      case "actor":
        rounds = await prepareActorContent(config.actorCategory ?? "", config.totalRounds);
        break;
      case "flag":
        rounds = await prepareFlagContent(config.continent ?? "", config.totalRounds);
        break;
      case "place":
        rounds = await prepareLandmarkContent(config.country ?? "", config.totalRounds);
        break;
    }

    const result = await client.mutation(api.rooms.completePreparation, { ...access, rounds });
    if (result?.error) throw new Error(result.error);
    return { success: true as const };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "failed to prepare the room" };
  }
}
