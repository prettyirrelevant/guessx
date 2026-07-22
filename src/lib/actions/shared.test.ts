import { describe, it, expect } from "vitest";

import { assertTotalRounds, buildRounds } from "./shared";
import { COUNTRY_CATALOG } from "../country-catalog";

function makeCandidates(names: string[]) {
  return names.map((name) => ({
    answer: name,
    mediaUrl: `https://example.com/${name}.jpg`,
    mediaTitle: name,
  }));
}

describe("buildRounds", () => {
  it("produces totalRounds rounds when the pool is exactly large enough", () => {
    // regression for bug: with pool=11 and totalRounds=10, round 9 used to be
    // silently skipped because the fresh distractor pool dropped below 3.
    const names = Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`);

    const rounds = buildRounds({
      candidates: makeCandidates(names),
      distractorNames: names,
      totalRounds: 10,
    });

    expect(rounds).toHaveLength(10);
    expect(rounds.at(-1)?.isFinal).toBe(true);
    expect(rounds.slice(0, -1).every((r) => !r.isFinal)).toBe(true);
    for (const round of rounds) {
      expect(round.options).toHaveLength(4);
      expect(new Set(round.options).size).toBe(4);
      expect(round.options).toContain(round.correctAnswer);
    }
  });

  it("throws when there aren't enough candidates to reach totalRounds", () => {
    const names = Array.from({ length: 5 }, (_, i) => `Item ${i + 1}`);

    expect(() =>
      buildRounds({
        candidates: makeCandidates(names),
        distractorNames: names,
        totalRounds: 10,
      }),
    ).toThrow(/could not build 10 rounds/);
  });

  it("marks exactly the last round as isFinal", () => {
    const names = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`);

    const rounds = buildRounds({
      candidates: makeCandidates(names),
      distractorNames: names,
      totalRounds: 10,
    });

    expect(rounds.filter((r) => r.isFinal)).toHaveLength(1);
    expect(rounds.at(-1)?.isFinal).toBe(true);
  });
});

describe("assertTotalRounds", () => {
  it.each([3, 5, 10])("accepts %i rounds", (rounds) => {
    expect(assertTotalRounds(rounds)).toBe(rounds);
  });

  it.each([2, 11, 4.5, Number.NaN])("rejects %s rounds", (rounds) => {
    expect(() => assertTotalRounds(rounds)).toThrow(/round count/);
  });
});

describe("country catalog", () => {
  it("contains a unique ISO code and a usable pool for every region", () => {
    expect(COUNTRY_CATALOG).toHaveLength(195);
    expect(new Set(COUNTRY_CATALOG.map((country) => country.code)).size).toBe(195);
    for (const region of ["Africa", "Americas", "Asia", "Europe", "Oceania"]) {
      expect(COUNTRY_CATALOG.filter((country) => country.region === region).length).toBeGreaterThan(
        10,
      );
    }
  });
});
