"use server";

import { searchArtistsFromDeezer } from "@guessx/content";

import { limitPublicSearch } from "./rate-limit";

export async function searchArtists(query: string) {
  await limitPublicSearch();
  return searchArtistsFromDeezer(query);
}
