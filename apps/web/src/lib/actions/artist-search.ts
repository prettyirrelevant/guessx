"use server";

import { apiRequest } from "./api";

export async function searchArtists(query: string) {
  const response = await apiRequest((client) => client.artists.$get({ query: { query } }));
  if (!response.ok) throw new Error("could not search artists");
  const result = await response.json();
  return result.artists;
}
