import type { RoomMode, RoundContent } from "@guessx/game";

import { parseArtistIds, prepareMusicContent, searchArtistsFromDeezer } from "./music";
import { prepareLogoContent } from "./logo";
import { isContinent, prepareFlagContent } from "./flag";
import { isActorCategory, prepareActorContent } from "./actor";

export { ACTOR_CATEGORIES } from "./actor";
export { CONTINENTS } from "./flag";
export { searchArtistsFromDeezer };

export type ContentConfig = {
  mode: RoomMode;
  totalRounds: number;
  artist?: string;
  actorCategory?: string;
  continent?: string;
};

/** Checks provider-specific settings before a room is persisted. */
export function isValidContentConfig(config: ContentConfig): boolean {
  switch (config.mode) {
    case "music":
      return parseArtistIds(config.artist ?? "") !== null;
    case "actor":
      return isActorCategory(config.actorCategory ?? "");
    case "flag":
      return isContinent(config.continent ?? "");
    case "place":
      return true;
  }
  return false;
}

/** Generates validated round candidates from the provider selected by the room mode. */
export function prepareContent(config: ContentConfig, tmdbToken: string): Promise<RoundContent[]> {
  switch (config.mode) {
    case "music":
      return prepareMusicContent(config.artist ?? "", config.totalRounds);
    case "actor":
      return prepareActorContent(config.actorCategory ?? "", config.totalRounds, tmdbToken);
    case "flag":
      return prepareFlagContent(config.continent ?? "", config.totalRounds);
    case "place":
      return prepareLogoContent(config.totalRounds);
  }
  throw new Error("invalid content mode");
}
