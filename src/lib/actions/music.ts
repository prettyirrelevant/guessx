"use server";

import { shuffle, fetchJson, buildRounds } from "./shared";
import type { RoundContent } from "./shared";

interface Track {
  id: number;
  title: string;
  artist: { name: string };
  preview: string | null;
}

export async function searchArtists(
  query: string,
): Promise<{ id: number; name: string; picture_small: string }[]> {
  if (!query.trim()) return [];

  const data = await fetchJson<{
    data: { id: number; name: string; picture_small: string }[];
  }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=8`);

  return data.data.map((a) => ({
    id: a.id,
    name: a.name,
    picture_small: a.picture_small,
  }));
}

export async function prepareMusicContent(
  artistParam: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const artistIds = artistParam.split(",").map((id) => id.trim());

  // fetch top tracks and related artists for all selected artists in parallel
  const perArtist = await Promise.all(
    artistIds.map(async (id) => {
      const [topData, relatedData] = await Promise.all([
        fetchJson<{ data: Track[] }>(`https://api.deezer.com/artist/${id}/top?limit=25`),
        fetchJson<{ data: { id: number; name: string }[] }>(
          `https://api.deezer.com/artist/${id}/related?limit=10`,
        ),
      ]);
      return {
        tracks: topData.data.filter((t) => t.preview),
        related: relatedData.data,
      };
    }),
  );

  // group tracks per artist (shuffled), for round-robin assignment
  const tracksByArtist = perArtist.map((a) => shuffle(a.tracks));

  // deduplicated related artists for distractors (exclude selected artists)
  const selectedIdSet = new Set(artistIds);
  const allRelated = perArtist
    .flatMap((a) => a.related)
    .filter(
      (r, i, arr) =>
        !selectedIdSet.has(r.id.toString()) && arr.findIndex((x) => x.id === r.id) === i,
    );

  const relatedResults = await Promise.allSettled(
    shuffle(allRelated)
      .slice(0, 10)
      .map((related) =>
        fetchJson<{ data: Track[] }>(`https://api.deezer.com/artist/${related.id}/top?limit=5`),
      ),
  );
  const distractorTracks: Track[] = relatedResults.flatMap((r) =>
    r.status === "fulfilled" ? r.value.data.filter((t) => t.preview) : [],
  );

  const allArtistLabels = new Set(tracksByArtist.flat().map((t) => t.title));
  const distractorLabels = [...new Set(distractorTracks.map((t) => t.title))].filter(
    (l) => !allArtistLabels.has(l),
  );

  // round-robin across artists to build candidate list
  const candidates: {
    answer: string;
    mediaUrl: string;
    mediaTitle: string;
    mediaArtist: string;
  }[] = [];
  const cursors = tracksByArtist.map(() => 0);
  const seen = new Set<string>();

  while (candidates.length < totalRounds * 2) {
    let addedThisPass = false;

    for (let a = 0; a < tracksByArtist.length; a++) {
      const tracks = tracksByArtist[a];
      while (cursors[a] < tracks.length) {
        const track = tracks[cursors[a]++];
        if (seen.has(track.title)) continue;
        seen.add(track.title);
        candidates.push({
          answer: track.title,
          mediaUrl: track.preview!,
          mediaTitle: track.title,
          mediaArtist: track.artist.name,
        });
        addedThisPass = true;
        break;
      }
    }

    if (!addedThisPass) break;
  }

  const rounds = buildRounds({
    candidates,
    distractorNames: distractorLabels,
    totalRounds,
  });

  if (rounds.length === 0) {
    throw new Error("could not fetch enough tracks for the selected artists");
  }

  return rounds;
}
