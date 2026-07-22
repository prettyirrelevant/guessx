import { v } from "convex/values";

import { roundContentValidator } from "./model";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

function isHttpsUrl(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const accessArgs = {
  roomId: v.id("rooms"),
  userId: v.string(),
};

export const config = internalQuery({
  args: accessArgs,
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.state !== "preparing" || room.hostId !== args.userId) return null;

    return {
      mode: room.mode,
      totalRounds: room.totalRounds,
      artist: room.artist,
      country: room.country,
      actorCategory: room.actorCategory,
      continent: room.continent,
    };
  },
});

export const complete = internalMutation({
  args: { ...accessArgs, rounds: v.array(roundContentValidator) },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return { error: "room not found" };
    if (room.hostId !== args.userId) return { error: "only the host can prepare" };
    if (room.state !== "preparing") return { error: "room not preparing" };

    const validRounds =
      args.rounds.length === room.totalRounds &&
      args.rounds.every(
        (round, index) =>
          round.roundNumber === index + 1 &&
          round.isFinal === (index === room.totalRounds - 1) &&
          round.options.length === 4 &&
          new Set(round.options).size === 4 &&
          round.options.includes(round.correctAnswer) &&
          round.options.every((option) => option.length > 0 && option.length <= 200) &&
          isHttpsUrl(round.mediaUrl) &&
          (!round.attributionUrl || isHttpsUrl(round.attributionUrl)) &&
          (!round.licenseUrl || isHttpsUrl(round.licenseUrl)) &&
          (!round.attribution || round.attribution.length <= 500) &&
          (!round.license || round.license.length <= 100),
      );
    if (!validRounds) return { error: "invalid rounds" };

    for (const round of args.rounds) {
      await ctx.db.insert("rounds", {
        roomId: args.roomId,
        ...round,
        state: "pending",
      });
    }

    await ctx.db.patch(args.roomId, { state: "waiting", lastActivityAt: Date.now() });
    await ctx.scheduler.runAfter(30 * 60_000, internal.scheduling.abandonIdleRoom, {
      roomId: args.roomId,
    });
    return { success: true };
  },
});
