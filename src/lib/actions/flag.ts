"use server";

import { CONTINENTS } from "@/lib/continents";

import { shuffle, buildRounds, type RoundContent } from "./shared";

interface RestCountry {
  name: { common: string };
  cca2: string;
  region: string;
  flags: { png: string; svg: string };
  independent?: boolean;
}

async function fetchCountries(): Promise<RestCountry[]> {
  const res = await fetch(
    "https://restcountries.com/v3.1/all?fields=name,cca2,region,flags,independent",
    { next: { revalidate: 60 * 60 * 24 } },
  );
  if (!res.ok) throw new Error(`restcountries fetch failed: ${res.status}`);
  return res.json();
}

export async function prepareFlagContent(
  continent: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const config = CONTINENTS.find((c) => c.code === continent) ?? CONTINENTS[0];
  const all = await fetchCountries();

  const pool = all.filter(
    (c) => c.independent === true && config.regions.includes(c.region) && c.flags?.png,
  );

  if (pool.length < 4) {
    throw new Error("not enough countries for this continent");
  }

  const names = pool.map((c) => c.name.common);
  const candidates = shuffle(pool).map((c) => ({
    answer: c.name.common,
    mediaUrl: c.flags.png,
    mediaTitle: c.name.common,
  }));

  const rounds = buildRounds({
    candidates,
    distractorNames: names,
    totalRounds,
  });

  if (rounds.length === 0) {
    throw new Error("could not prepare enough rounds for this continent");
  }

  return rounds;
}
