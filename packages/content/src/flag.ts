import type { RoundContent } from "@guessx/game";

import { assertTotalRounds, buildRounds, shuffle } from "./shared";

type CountryRegion = "Africa" | "Americas" | "Asia" | "Europe" | "Oceania";

const COUNTRY_CODES: Record<CountryRegion, string> = {
  Africa:
    "DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW",
  Americas:
    "AG AR BS BB BZ BO BR CA CL CO CR CU DM DO EC SV GD GT GY HT HN JM MX NI PA PY PE KN LC VC SR TT US UY VE",
  Asia: "AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TJ TH TL TR TM AE UZ VN YE",
  Europe:
    "AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR VA HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB",
  Oceania: "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU",
};

export const CONTINENTS: { code: string; name: string; regions: CountryRegion[] }[] = [
  {
    code: "worldwide",
    name: "Worldwide",
    regions: ["Africa", "Americas", "Asia", "Oceania", "Europe"],
  },
  { code: "africa", name: "Africa", regions: ["Africa"] },
  { code: "americas", name: "Americas", regions: ["Americas"] },
  { code: "asia", name: "Asia-Pacific", regions: ["Asia", "Oceania"] },
  { code: "europe", name: "Europe", regions: ["Europe"] },
];

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRY_CATALOG = Object.entries(COUNTRY_CODES).flatMap(([region, codes]) =>
  codes.split(" ").map((code) => ({
    code,
    name: displayNames.of(code) ?? code,
    region: region as CountryRegion,
  })),
);

export function isContinent(value: string): boolean {
  return CONTINENTS.some((continent) => continent.code === value);
}

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
