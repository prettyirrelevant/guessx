"use server";

import { limitPublicSearch } from "./rate-limit";
import { searchArtistsFromDeezer } from "./music";

export async function searchArtists(query: string) {
  await limitPublicSearch();
  return searchArtistsFromDeezer(query);
}
