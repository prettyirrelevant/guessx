import type { RoundContent } from "@guessx/game";

import { assertTotalRounds, fetchJson, isRecord, mapWithConcurrency, shuffle } from "./shared";

interface Track {
  id: number;
  title: string;
  artist: { name: string };
  preview: string | null;
}

function isPlayableTrack(track: unknown): track is Track & { preview: string } {
  return (
    isRecord(track) &&
    Number.isSafeInteger(track.id) &&
    typeof track.title === "string" &&
    track.title.trim().length > 0 &&
    track.title.length <= 200 &&
    isRecord(track.artist) &&
    typeof track.artist.name === "string" &&
    track.artist.name.trim().length > 0 &&
    typeof track.preview === "string" &&
    track.preview.startsWith("https://")
  );
}

export function parseArtistIds(value: string): string[] | null {
  const ids = [...new Set(value.split(",").map((id) => id.trim()))];
  if (ids.length < 1 || ids.length > 3 || ids.some((id) => !/^\d{1,12}$/.test(id))) return null;
  return ids;
}

export async function searchArtistsFromDeezer(
  query: string,
): Promise<{ id: number; name: string; picture_small: string }[]> {
  const normalizedQuery = query.trim().slice(0, 80);
  if (normalizedQuery.length < 2) return [];

  const response = await fetchJson<unknown>(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(normalizedQuery)}&limit=8`,
    {
      timeoutMs: 8_000,
    },
  );

  if (!isRecord(response) || !Array.isArray(response.data)) {
    throw new Error("invalid Deezer response");
  }

  return response.data
    .filter(
      (artist): artist is { id: number; name: string; picture_small: string } =>
        isRecord(artist) &&
        typeof artist.id === "number" &&
        Number.isSafeInteger(artist.id) &&
        typeof artist.name === "string" &&
        artist.name.trim().length > 0 &&
        typeof artist.picture_small === "string" &&
        artist.picture_small.startsWith("https://"),
    )
    .slice(0, 8)
    .map((artist) => ({
      id: artist.id,
      name: artist.name.slice(0, 120),
      picture_small: artist.picture_small,
    }));
}

export async function prepareMusicContent(
  artistParam: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const roundsRequested = assertTotalRounds(totalRounds);
  const artistIds = parseArtistIds(artistParam);
  if (!artistIds) throw new Error("select 1 to 3 artists");
  const selectedIdSet = new Set(artistIds);

  // fetch top tracks and related artists for all selected artists in parallel
  const perArtist = await Promise.all(
    artistIds.map(async (id) => {
      const [topResponse, relatedResponse] = await Promise.all([
        fetchJson<unknown>(`https://api.deezer.com/artist/${id}/top?limit=25`, {
          timeoutMs: 8_000,
        }),
        fetchJson<unknown>(`https://api.deezer.com/artist/${id}/related?limit=10`, {
          timeoutMs: 8_000,
        }),
      ]);

      if (
        !isRecord(topResponse) ||
        !Array.isArray(topResponse.data) ||
        !isRecord(relatedResponse) ||
        !Array.isArray(relatedResponse.data)
      ) {
        throw new Error("invalid Deezer response");
      }

      const related = relatedResponse.data.filter(
        (artist): artist is { id: number; name: string } =>
          isRecord(artist) &&
          typeof artist.id === "number" &&
          Number.isSafeInteger(artist.id) &&
          typeof artist.name === "string" &&
          !selectedIdSet.has(artist.id.toString()),
      );

      return { tracks: topResponse.data.filter(isPlayableTrack), related };
    }),
  );

  // fetch distractor tracks per artist (genre-appropriate)
  const distractorLabelsByArtist: string[][] = await Promise.all(
    perArtist.map(async ({ related }) => {
      const uniqueRelated = related.filter(
        (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i,
      );

      const results = await mapWithConcurrency(
        shuffle(uniqueRelated).slice(0, 6),
        3,
        (relatedArtist) =>
          fetchJson<unknown>(`https://api.deezer.com/artist/${relatedArtist.id}/top?limit=5`, {
            timeoutMs: 8_000,
          }),
      );

      return [
        ...new Set(
          results.flatMap((r) =>
            r.status === "fulfilled" && isRecord(r.value) && Array.isArray(r.value.data)
              ? r.value.data.filter(isPlayableTrack).map((track) => track.title)
              : [],
          ),
        ),
      ];
    }),
  );

  // exclude selected artist track titles from distractors
  const tracksByArtist = perArtist.map((a) => shuffle(a.tracks));
  const allArtistLabels = new Set(tracksByArtist.flat().map((t) => t.title));
  for (let i = 0; i < distractorLabelsByArtist.length; i++) {
    distractorLabelsByArtist[i] = distractorLabelsByArtist[i].filter(
      (l) => !allArtistLabels.has(l),
    );
  }

  // round-robin across artists to build candidate list
  const candidates: {
    answer: string;
    mediaUrl: string;
    mediaTitle: string;
    mediaArtist: string;
    artistIndex: number;
  }[] = [];
  const cursors = tracksByArtist.map(() => 0);
  const seen = new Set<string>();

  while (candidates.length < roundsRequested * 2) {
    let addedThisPass = false;

    for (let a = 0; a < tracksByArtist.length; a++) {
      const tracks = tracksByArtist[a];
      while (cursors[a] < tracks.length) {
        const track = tracks[cursors[a]++];
        if (seen.has(track.title)) continue;
        seen.add(track.title);
        candidates.push({
          answer: track.title,
          mediaUrl: track.preview,
          mediaTitle: track.title,
          mediaArtist: track.artist.name,
          artistIndex: a,
        });
        addedThisPass = true;
        break;
      }
    }

    if (!addedThisPass) break;
  }

  // build rounds using per-artist distractors for genre consistency
  const usedAnswers = new Set<string>();
  const rounds: RoundContent[] = [];

  for (const candidate of candidates) {
    if (rounds.length >= roundsRequested) break;
    if (usedAnswers.has(candidate.answer)) continue;

    // same shrinking-pool problem as buildRounds: fall back to reusing past
    // answers as distractors when the fresh pool drops below 3.
    const artistPool = distractorLabelsByArtist[candidate.artistIndex];
    let pool = artistPool.filter((d) => d !== candidate.answer && !usedAnswers.has(d));
    if (pool.length < 3) {
      pool = artistPool.filter((d) => d !== candidate.answer);
    }
    const distractors = shuffle(pool).slice(0, 3);

    if (distractors.length < 3) continue;

    usedAnswers.add(candidate.answer);
    rounds.push({
      roundNumber: rounds.length + 1,
      correctAnswer: candidate.answer,
      options: shuffle([candidate.answer, ...distractors]),
      mediaUrl: candidate.mediaUrl,
      mediaTitle: candidate.mediaTitle,
      mediaArtist: candidate.mediaArtist,
      isFinal: rounds.length === roundsRequested - 1,
    });
  }

  if (rounds.length < roundsRequested) {
    throw new Error("could not fetch enough tracks for the selected artists");
  }

  return rounds;
}
