"use server";

import type { RoundContent } from "./shared";
import { shuffle, buildRounds } from "./shared";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/h632";

interface IndustryConfig {
  endpoint: string;
  originCountry: string;
  originalLanguage?: string;
  maxCastPerTitle: number;
  pages: number;
  minAppearances: number;
}

const INDUSTRY_CONFIG: Record<string, IndustryConfig> = {
  nollywood: {
    endpoint: "discover/movie",
    originCountry: "NG",
    maxCastPerTitle: 5,
    pages: 3,
    minAppearances: 2,
  },
  hollywood: {
    endpoint: "discover/movie",
    originCountry: "US",
    originalLanguage: "en",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
  bollywood: {
    endpoint: "discover/movie",
    originCountry: "IN",
    originalLanguage: "hi",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
  kdrama: {
    endpoint: "discover/tv",
    originCountry: "KR",
    originalLanguage: "ko",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
  british: {
    endpoint: "discover/movie",
    originCountry: "GB",
    originalLanguage: "en",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
  french: {
    endpoint: "discover/movie",
    originCountry: "FR",
    originalLanguage: "fr",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
  anime: {
    endpoint: "discover/tv",
    originCountry: "JP",
    originalLanguage: "ja",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
  telenovela: {
    endpoint: "discover/tv",
    originCountry: "MX",
    originalLanguage: "es",
    maxCastPerTitle: 8,
    pages: 1,
    minAppearances: 1,
  },
};

interface TmdbCastMember {
  id: number;
  name: string;
  profile_path: string | null;
  popularity: number;
}

async function fetchTmdb<T>(path: string): Promise<T> {
  const res = await fetch(`${TMDB_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.TMDB_API_READ_ACCESS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`TMDB fetch failed: ${res.status}`);
  return res.json();
}

export async function prepareActorContent(
  category: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const config = INDUSTRY_CONFIG[category] ?? INDUSTRY_CONFIG["hollywood"];

  // fetch titles from randomized pages for variety across games
  const pagePool = Array.from({ length: 10 }, (_, i) => i + 1);
  const pageNumbers = shuffle(pagePool).slice(0, config.pages);
  const pageResults = await Promise.allSettled(
    pageNumbers.map((page) => {
      const params = new URLSearchParams({
        with_origin_country: config.originCountry,
        sort_by: "popularity.desc",
        page: page.toString(),
      });
      if (config.originalLanguage) params.set("with_original_language", config.originalLanguage);
      return fetchTmdb<{ results: { id: number }[] }>(`${config.endpoint}?${params}`);
    }),
  );

  const allTitles = pageResults.flatMap((r) => (r.status === "fulfilled" ? r.value.results : []));

  // fetch credits from top titles in parallel
  const creditsType = config.endpoint === "discover/tv" ? "tv" : "movie";
  const creditsResults = await Promise.allSettled(
    allTitles
      .slice(0, 30)
      .map((title) => fetchTmdb<{ cast: TmdbCastMember[] }>(`${creditsType}/${title.id}/credits`)),
  );

  // collect actors from credits, tracking appearance count per actor
  // limit to top-billed cast per title, require a profile photo
  const actorMap = new Map<number, { name: string; photo: string; popularity: number }>();
  const appearances = new Map<number, number>();
  for (const result of creditsResults) {
    if (result.status !== "fulfilled") continue;
    for (const person of result.value.cast.slice(0, config.maxCastPerTitle)) {
      if (!person.profile_path) continue;
      appearances.set(person.id, (appearances.get(person.id) ?? 0) + 1);
      const existing = actorMap.get(person.id);
      if (!existing || person.popularity > existing.popularity) {
        actorMap.set(person.id, {
          name: person.name,
          photo: `${TMDB_IMAGE_BASE}${person.profile_path}`,
          popularity: person.popularity,
        });
      }
    }
  }

  // filter by minimum appearances (removes international cameo actors for regional industries)
  const actors = [...actorMap.entries()]
    .filter(([id]) => (appearances.get(id) ?? 0) >= config.minAppearances)
    .map(([, actor]) => actor)
    .toSorted((a, b) => b.popularity - a.popularity);

  if (actors.length < 4) {
    throw new Error("could not find enough actors for this category");
  }

  const candidates = shuffle(actors.slice(0, Math.max(totalRounds * 3, 20))).map((a) => ({
    answer: a.name,
    mediaUrl: a.photo,
    mediaTitle: a.name,
  }));

  const rounds = buildRounds({
    candidates,
    distractorNames: actors.map((a) => a.name),
    totalRounds,
  });

  if (rounds.length === 0) {
    throw new Error("could not prepare enough rounds for this category");
  }

  return rounds;
}
