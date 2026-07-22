import { paginationOptsValidator } from "convex/server";

import { internalMutation } from "./_generated/server";

export const extractPlayerPresenceBatch = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("players").paginate(args.paginationOpts);

    for (const player of result.page) {
      const [presence, heartbeat] = await Promise.all([
        ctx.db
          .query("playerPresence")
          .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
          .unique(),
        ctx.db
          .query("playerHeartbeats")
          .withIndex("by_playerId", (q) => q.eq("playerId", player._id))
          .unique(),
      ]);

      if (!presence) {
        await ctx.db.insert("playerPresence", {
          playerId: player._id,
          roomId: player.roomId,
          status: player.status ?? "disconnected",
          disconnectedAt: player.disconnectedAt,
        });
      }
      if (!heartbeat && player.lastSeenAt !== undefined) {
        await ctx.db.insert("playerHeartbeats", {
          playerId: player._id,
          lastSeenAt: player.lastSeenAt,
        });
      }

      await ctx.db.patch(player._id, {
        status: undefined,
        disconnectedAt: undefined,
        lastSeenAt: undefined,
      });
    }

    return {
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      processed: result.page.length,
    };
  },
});
