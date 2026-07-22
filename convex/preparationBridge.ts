import { v } from "convex/values";

import { roundContentValidator } from "./model";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

function requireServerSecret(value: string) {
  const expected = process.env.PREPARATION_SECRET;
  if (!expected?.length || value !== expected) throw new Error("Unauthorized preparation service");
}

const accessArgs = {
  roomId: v.id("rooms"),
  userId: v.string(),
  serverSecret: v.string(),
};

type PreparationConfig = {
  mode: "music" | "place" | "actor" | "flag";
  totalRounds: number;
  artist?: string;
  actorCategory?: string;
  continent?: string;
};

type PreparationResult = { success?: boolean; error?: string };

export const configForServer = action({
  args: accessArgs,
  handler: async (ctx, args): Promise<PreparationConfig | null> => {
    requireServerSecret(args.serverSecret);
    return ctx.runQuery(internal.preparation.config, {
      roomId: args.roomId,
      userId: args.userId,
    });
  },
});

export const completeFromServer = action({
  args: { ...accessArgs, rounds: v.array(roundContentValidator) },
  handler: async (ctx, args): Promise<PreparationResult> => {
    requireServerSecret(args.serverSecret);
    return ctx.runMutation(internal.preparation.complete, {
      roomId: args.roomId,
      userId: args.userId,
      rounds: args.rounds,
    });
  },
});
