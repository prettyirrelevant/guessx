import { COUNTRY_CATALOG } from "@/lib/country-catalog";
import { CONTINENTS } from "@/lib/continents";

import { assertTotalRounds, buildRounds, shuffle, type RoundContent } from "./shared";

export async function prepareFlagContent(
  continent: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const rounds = assertTotalRounds(totalRounds);
  const config = CONTINENTS.find((item) => item.code === continent);
  if (!config) throw new Error("invalid continent");

  const pool = COUNTRY_CATALOG.filter((country) => config.regions.includes(country.region));
  if (pool.length < 4) throw new Error("not enough countries for this continent");

  const names = pool.map((country) => country.name);
  const candidates = shuffle(pool).map((country) => ({
    answer: country.name,
    mediaUrl: `https://flagcdn.com/w640/${country.code.toLowerCase()}.png`,
    mediaTitle: country.name,
  }));

  return buildRounds({ candidates, distractorNames: names, totalRounds: rounds });
}
