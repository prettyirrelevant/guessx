import { MAX_PLAYERS } from "./model";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type DatabaseReader = QueryCtx["db"] | MutationCtx["db"];

export async function listPlayersWithPresence(db: DatabaseReader, roomId: Id<"rooms">) {
  const [players, presenceRows] = await Promise.all([
    db
      .query("players")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .take(MAX_PLAYERS),
    db
      .query("playerPresence")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .take(MAX_PLAYERS),
  ]);
  const presenceByPlayer = new Map(presenceRows.map((presence) => [presence.playerId, presence]));

  return players.map((player) => {
    const presence = presenceByPlayer.get(player._id);
    return {
      player,
      status: presence?.status ?? player.status ?? "disconnected",
      disconnectedAt: presence?.disconnectedAt ?? player.disconnectedAt,
    };
  });
}

export async function touchPresence(
  ctx: MutationCtx,
  playerId: Id<"players">,
  roomId: Id<"rooms">,
  now: number,
) {
  const [presence, heartbeat] = await Promise.all([
    ctx.db
      .query("playerPresence")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .unique(),
    ctx.db
      .query("playerHeartbeats")
      .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
      .unique(),
  ]);

  if (heartbeat) await ctx.db.patch(heartbeat._id, { lastSeenAt: now });
  else await ctx.db.insert("playerHeartbeats", { playerId, lastSeenAt: now });

  if (!presence) {
    await ctx.db.insert("playerPresence", { playerId, roomId, status: "connected" });
    return true;
  }
  if (presence.status === "disconnected") {
    await ctx.db.patch(presence._id, { status: "connected", disconnectedAt: undefined });
    return true;
  }
  return false;
}

export async function disconnectPresence(ctx: MutationCtx, playerId: Id<"players">, now: number) {
  const presence = await ctx.db
    .query("playerPresence")
    .withIndex("by_playerId", (q) => q.eq("playerId", playerId))
    .unique();
  if (!presence || presence.status === "disconnected") return false;

  await ctx.db.patch(presence._id, { status: "disconnected", disconnectedAt: now });
  return true;
}
