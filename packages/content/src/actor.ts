import type { RoundContent } from "@guessx/game";

import {
  assertTotalRounds,
  buildRounds,
  fetchJson,
  isRecord,
  mapWithConcurrency,
  shuffle,
} from "./shared";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/h632";

export const ACTOR_CATEGORIES = [
  { code: "nollywood", name: "Nollywood" },
  { code: "hollywood", name: "Hollywood" },
  { code: "bollywood", name: "Bollywood" },
  { code: "kdrama", name: "K-Drama" },
  { code: "british", name: "British Cinema" },
  { code: "french", name: "French Cinema" },
  { code: "anime", name: "Anime" },
  { code: "telenovela", name: "Telenovela" },
] as const;

type ActorCategory = (typeof ACTOR_CATEGORIES)[number]["code"];

interface IndustryConfig {
  endpoint: string;
  originCountry: string;
  originalLanguage?: string;
  maxCastPerTitle: number;
  pages: number;
  minAppearances: number;
}

const INDUSTRY_CONFIG: Record<ActorCategory, IndustryConfig> = {
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

export function isActorCategory(value: string): value is ActorCategory {
  return Object.hasOwn(INDUSTRY_CONFIG, value);
}

interface TmdbCastMember {
  id: number;
  name: string;
  profile_path: string;
  popularity: number;
}

function isTmdbCastMember(value: unknown): value is TmdbCastMember {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 200 &&
    typeof value.profile_path === "string" &&
    value.profile_path.startsWith("/") &&
    typeof value.popularity === "number" &&
    Number.isFinite(value.popularity)
  );
}

async function fetchTmdb<T>(path: string, token: string): Promise<T> {
  if (!token) throw new Error("TMDB_API_READ_ACCESS_TOKEN is not configured");

  return fetchJson<T>(`${TMDB_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeoutMs: 10_000,
  });
}

export async function prepareActorContent(
  category: string,
  totalRounds: number,
  token: string,
): Promise<RoundContent[]> {
  const roundsRequested = assertTotalRounds(totalRounds);
  if (!isActorCategory(category)) throw new Error("invalid actor category");
  const config = INDUSTRY_CONFIG[category];

  // fetch titles from randomized pages for variety across games
  const pagePool = Array.from({ length: 10 }, (_, i) => i + 1);
  const pageNumbers = shuffle(pagePool).slice(0, config.pages);
  const pageResults = await Promise.allSettled<unknown>(
    pageNumbers.map((page) => {
      const params = new URLSearchParams({
        with_origin_country: config.originCountry,
        sort_by: "popularity.desc",
        page: page.toString(),
      });
      if (config.originalLanguage) params.set("with_original_language", config.originalLanguage);
      return fetchTmdb<{ results: { id: number }[] }>(`${config.endpoint}?${params}`, token);
    }),
  );

  const allTitles = pageResults.flatMap((result) =>
    result.status === "fulfilled" && isRecord(result.value) && Array.isArray(result.value.results)
      ? result.value.results.filter(
          (title): title is { id: number } => isRecord(title) && Number.isSafeInteger(title.id),
        )
      : [],
  );

  // fetch credits from top titles in parallel
  const creditsType = config.endpoint === "discover/tv" ? "tv" : "movie";
  const uniqueTitles = [...new Map(allTitles.map((title) => [title.id, title])).values()];
  const creditsResults = await mapWithConcurrency(uniqueTitles.slice(0, 24), 5, (title) =>
    fetchTmdb<unknown>(`${creditsType}/${title.id}/credits`, token),
  );

  // collect actors from credits, tracking appearance count per actor
  // limit to top-billed cast per title, require a profile photo
  const actorMap = new Map<number, { name: string; photo: string; popularity: number }>();
  const appearances = new Map<number, number>();
  for (const result of creditsResults) {
    if (
      result.status !== "fulfilled" ||
      !isRecord(result.value) ||
      !Array.isArray(result.value.cast)
    ) {
      continue;
    }
    const seenCastIds = new Set<number>();
    for (const person of result.value.cast.slice(0, config.maxCastPerTitle)) {
      if (!isTmdbCastMember(person) || seenCastIds.has(person.id)) continue;
      seenCastIds.add(person.id);
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
    .map(([id, actor]) => ({ id, ...actor }))
    .toSorted((a, b) => b.popularity - a.popularity);

  if (actors.length < 4) {
    throw new Error("could not find enough actors for this category");
  }

  const candidates = shuffle(actors.slice(0, Math.max(roundsRequested * 3, 20))).map((a) => ({
    answer: a.name,
    mediaUrl: a.photo,
    mediaTitle: a.name,
  }));

  return buildRounds({
    candidates,
    distractorNames: actors.map((a) => a.name),
    totalRounds: roundsRequested,
  });
}
