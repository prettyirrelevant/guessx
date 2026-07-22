import type { Doc } from "@convex/_generated/dataModel";

export type PublicRoom = Omit<Doc<"rooms">, "hostId"> & { isHost: boolean };

export type PublicPlayer = Omit<Doc<"players">, "userId"> & {
  isCurrent: boolean;
  isHost: boolean;
};
