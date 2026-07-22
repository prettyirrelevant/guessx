import { LANDMARKS } from "@/lib/landmarks";
import { COUNTRIES } from "@/lib/countries";

import {
  assertTotalRounds,
  buildRounds,
  fetchJson,
  mapWithConcurrency,
  shuffle,
  type RoundContent,
} from "./shared";

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

interface WikipediaPage {
  title: string;
  pageimage?: string;
}

interface CommonsMetadataValue {
  value?: string;
}

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, CommonsMetadataValue>;
}

interface LandmarkImage {
  mediaUrl: string;
  attribution: string;
  attributionUrl?: string;
  license?: string;
  licenseUrl?: string;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[()–—-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pageScore(pageTitle: string, landmark: string): number {
  const title = normalize(pageTitle);
  const target = normalize(landmark);
  if (title === target) return 100;
  if (title.startsWith(target) || target.startsWith(title)) return 80;

  const targetWords = target.split(" ").filter((word) => word.length > 2);
  return targetWords.reduce((score, word) => score + (title.includes(word) ? 10 : 0), 0);
}

function plainText(value?: string): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 440) : undefined;
}

function httpsUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function resolveWikipediaPage(landmark: string, countryName?: string) {
  const search = countryName ? `intitle:"${landmark}" ${countryName}` : `intitle:"${landmark}"`;
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: search,
    gsrnamespace: "0",
    gsrlimit: "5",
    prop: "pageimages",
    piprop: "name",
    pilicense: "free",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const data = await fetchJson<{ query?: { pages?: WikipediaPage[] } }>(
    `${WIKIPEDIA_API}?${params}`,
    { revalidate: 60 * 60 * 24 },
  );

  return (data.query?.pages ?? [])
    .filter((page) => page.pageimage)
    .toSorted((a, b) => pageScore(b.title, landmark) - pageScore(a.title, landmark))[0];
}

async function fetchCommonsImage(filename: string): Promise<LandmarkImage | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1600",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const data = await fetchJson<{
    query?: { pages?: { imageinfo?: CommonsImageInfo[] }[] };
  }>(`${COMMONS_API}?${params}`, { revalidate: 60 * 60 * 24 });
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  const mediaUrl = httpsUrl(info?.thumburl ?? info?.url);
  if (!info || !mediaUrl) return null;

  const metadata = info.extmetadata ?? {};
  const creator = plainText(metadata.Artist?.value) ?? plainText(metadata.Credit?.value);
  return {
    mediaUrl,
    attribution: creator ? `Image by ${creator} · Wikimedia Commons` : "Wikimedia Commons image",
    attributionUrl: httpsUrl(info.descriptionurl),
    license: plainText(metadata.LicenseShortName?.value ?? metadata.UsageTerms?.value),
    licenseUrl: httpsUrl(metadata.LicenseUrl?.value),
  };
}

async function fetchLandmarkImage(landmark: string, countryName?: string) {
  try {
    const page =
      (await resolveWikipediaPage(landmark, countryName)) ??
      (countryName ? await resolveWikipediaPage(landmark) : undefined);
    return page?.pageimage ? await fetchCommonsImage(page.pageimage) : null;
  } catch {
    return null;
  }
}

export async function prepareLandmarkContent(
  countryCode: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const roundsRequested = assertTotalRounds(totalRounds);
  const landmarks = LANDMARKS[countryCode];
  if (!landmarks) throw new Error("invalid country");

  const countryName =
    countryCode === "WORLDWIDE"
      ? undefined
      : COUNTRIES.find((country) => country.code === countryCode)?.name;
  const candidateNames = shuffle(landmarks).slice(0, Math.max(roundsRequested * 2, 15));
  const imageResults = await mapWithConcurrency(candidateNames, 4, async (landmark) => ({
    landmark,
    image: await fetchLandmarkImage(landmark, countryName),
  }));

  const candidates = imageResults.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value.image) return [];
    return [
      {
        answer: result.value.landmark,
        mediaTitle: result.value.landmark,
        ...result.value.image,
      },
    ];
  });

  return buildRounds({
    candidates,
    distractorNames: landmarks,
    totalRounds: roundsRequested,
  });
}
