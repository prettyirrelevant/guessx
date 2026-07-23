import {
  assertTotalRounds,
  fetchJson,
  mapWithConcurrency,
  shuffle,
  type RoundContent,
} from "./shared";

interface Track {
  id: number;
  title: string;
  artist: { name: string };
  preview: string | null;
}

export async function searchArtistsFromDeezer(
  query: string,
): Promise<{ id: number; name: string; picture_small: string }[]> {
  const normalizedQuery = query.trim().slice(0, 80);
  if (normalizedQuery.length < 2) return [];

  const data = await fetchJson<{
    data: { id: number; name: string; picture_small: string }[];
  }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(normalizedQuery)}&limit=8`, {
    revalidate: 60 * 10,
  });

  if (!Array.isArray(data.data)) throw new Error("invalid Deezer response");

  return data.data
    .filter(
      (artist) =>
        Number.isSafeInteger(artist.id) &&
        typeof artist.name === "string" &&
        typeof artist.picture_small === "string",
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
  const artistIds = [...new Set(artistParam.split(",").map((id) => id.trim()))].filter((id) =>
    /^\d{1,12}$/.test(id),
  );
  if (artistIds.length === 0 || artistIds.length > 3) throw new Error("select 1 to 3 artists");
  const selectedIdSet = new Set(artistIds);

  // fetch top tracks and related artists for all selected artists in parallel
  const perArtist = await Promise.all(
    artistIds.map(async (id) => {
      const [topData, relatedData] = await Promise.all([
        fetchJson<{ data: Track[] }>(`https://api.deezer.com/artist/${id}/top?limit=25`, {
          revalidate: 60 * 10,
        }),
        fetchJson<{ data: { id: number; name: string }[] }>(
          `https://api.deezer.com/artist/${id}/related?limit=10`,
          { revalidate: 60 * 10 },
        ),
      ]);

      if (!Array.isArray(topData.data) || !Array.isArray(relatedData.data)) {
        throw new Error("invalid Deezer response");
      }

      const related = relatedData.data.filter((r) => !selectedIdSet.has(r.id.toString()));

      return { tracks: topData.data.filter((t) => t.preview), related };
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
          fetchJson<{ data: Track[] }>(
            `https://api.deezer.com/artist/${relatedArtist.id}/top?limit=5`,
            { revalidate: 60 * 10 },
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
