import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const extractPlayerPresence = internalAction({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ processed: number }> => {
    let cursor = args.cursor ?? null;
    let processed = 0;

    while (true) {
      const result = await ctx.runMutation(internal.migrations.extractPlayerPresenceBatch, {
        paginationOpts: { cursor, numItems: 100 },
      });
      processed += result.processed;
      if (result.isDone) return { processed };
      cursor = result.continueCursor;
    }
  },
});
