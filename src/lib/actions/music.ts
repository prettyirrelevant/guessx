"use server";

import { shuffle, fetchJson } from "./shared";
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
  const selectedIdSet = new Set(artistIds);

  // fetch top tracks and related artists for all selected artists in parallel
  const perArtist = await Promise.all(
    artistIds.map(async (id) => {
      const [topData, relatedData] = await Promise.all([
        fetchJson<{ data: Track[] }>(`https://api.deezer.com/artist/${id}/top?limit=25`),
        fetchJson<{ data: { id: number; name: string }[] }>(
          `https://api.deezer.com/artist/${id}/related?limit=10`,
        ),
      ]);

      const related = relatedData.data.filter(
        (r) => !selectedIdSet.has(r.id.toString()),
      );

      return { tracks: topData.data.filter((t) => t.preview), related };
    }),
  );

  // fetch distractor tracks per artist (genre-appropriate)
  const distractorLabelsByArtist: string[][] = await Promise.all(
    perArtist.map(async ({ related }) => {
      const uniqueRelated = related.filter(
        (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i,
      );

      const results = await Promise.allSettled(
        shuffle(uniqueRelated)
          .slice(0, 8)
          .map((r) =>
            fetchJson<{ data: Track[] }>(`https://api.deezer.com/artist/${r.id}/top?limit=5`),
          ),
      );

      return [
        ...new Set(
          results.flatMap((r) =>
            r.status === "fulfilled" ? r.value.data.map((t) => t.title) : [],
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
    if (rounds.length >= totalRounds) break;
    if (usedAnswers.has(candidate.answer)) continue;

    const pool = distractorLabelsByArtist[candidate.artistIndex];
    const distractors = shuffle(
      pool.filter((d) => d !== candidate.answer && !usedAnswers.has(d)),
    ).slice(0, 3);

    if (distractors.length < 3) continue;

    usedAnswers.add(candidate.answer);
    rounds.push({
      roundNumber: rounds.length + 1,
      correctAnswer: candidate.answer,
      options: shuffle([candidate.answer, ...distractors]),
      mediaUrl: candidate.mediaUrl,
      mediaTitle: candidate.mediaTitle,
      mediaArtist: candidate.mediaArtist,
      isFinal: rounds.length === totalRounds - 1,
    });
  }

  if (rounds.length === 0) {
    throw new Error("could not fetch enough tracks for the selected artists");
  }

  return rounds;
}
