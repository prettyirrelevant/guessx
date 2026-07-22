"use server";

import { ConvexHttpClient } from "convex/browser";

import type { Id } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

import { limitPreparation } from "./rate-limit";
import { prepareMusicContent } from "./music";
import { prepareLogoContent } from "./logo";
import { prepareFlagContent } from "./flag";
import { prepareActorContent } from "./actor";

export async function prepareGame(access: { roomId: Id<"rooms">; userId: string }) {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
    const serverSecret = process.env.PREPARATION_SECRET;
    if (!serverSecret?.length) throw new Error("PREPARATION_SECRET is not configured");

    const client = new ConvexHttpClient(convexUrl);
    const config = await client.action(api.preparationBridge.configForServer, {
      ...access,
      serverSecret,
    });
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
        rounds = await prepareLogoContent(config.totalRounds);
        break;
    }

    const result = await client.action(api.preparationBridge.completeFromServer, {
      ...access,
      serverSecret,
      rounds,
    });
    if (result?.error) throw new Error(result.error);
    return { success: true as const };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "failed to prepare the room" };
  }
}
