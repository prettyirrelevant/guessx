import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareMusicContent } from "../src/music";
import { prepareFlagContent } from "../src/flag";
import { prepareActorContent } from "../src/actor";
import { CONTINENTS, isValidContentConfig, prepareContent, searchArtistsFromDeezer } from "../src";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

function expectValidRounds(rounds: Awaited<ReturnType<typeof prepareContent>>, count: number) {
  expect(rounds).toHaveLength(count);
  expect(new Set(rounds.map((round) => round.correctAnswer)).size).toBe(count);

  for (const [index, round] of rounds.entries()) {
    expect(round.roundNumber).toBe(index + 1);
    expect(round.options).toHaveLength(4);
    expect(new Set(round.options).size).toBe(4);
    expect(round.options).toContain(round.correctAnswer);
    expect(round.isFinal).toBe(index === count - 1);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("flag content", () => {
  it.each(CONTINENTS.map(({ code }) => code))("builds valid rounds for %s", async (continent) => {
    expectValidRounds(await prepareFlagContent(continent, 10), 10);
  });

  it("rejects an unknown continent", async () => {
    await expect(prepareFlagContent("unknown", 5)).rejects.toThrow("invalid continent");
  });
});

describe("actor content", () => {
  it("deduplicates discovered titles and builds valid rounds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tmdb-token");

      if (url.includes("/discover/movie?")) {
        return jsonResponse({ results: [null, { id: 1 }, { id: 1 }, { id: 2 }] });
      }

      const titleId = Number(url.match(/movie\/(\d+)\/credits/)?.[1]);
      return jsonResponse({
        cast: [
          null,
          ...Array.from({ length: 8 }, (_, index) => ({
            id: titleId * 100 + index,
            name: `Actor ${titleId}-${index}`,
            profile_path: `/actor-${titleId}-${index}.jpg`,
            popularity: 100 - index,
          })),
        ],
      });
    });

    const rounds = await prepareActorContent("hollywood", 5, "tmdb-token");

    expectValidRounds(rounds, 5);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/credits")),
    ).toHaveLength(2);
  });

  it("rejects an unknown category before calling TMDB", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(prepareActorContent("unknown", 5, "tmdb-token")).rejects.toThrow(
      "invalid actor category",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("music content", () => {
  it("builds valid rounds from selected and related artists", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const artistId = Number(url.match(/artist\/(\d+)/)?.[1]);

      if (url.includes("/related?")) {
        return jsonResponse({
          data: [
            null,
            ...Array.from({ length: 4 }, (_, index) => ({
              id: artistId * 10 + index + 1,
              name: `Related ${artistId}-${index}`,
            })),
          ],
        });
      }

      return jsonResponse({
        data: [
          null,
          ...Array.from({ length: 8 }, (_, index) => ({
            id: artistId * 100 + index,
            title: `Track ${artistId}-${index}`,
            artist: { name: `Artist ${artistId}` },
            preview: `https://example.com/${artistId}-${index}.mp3`,
          })),
        ],
      });
    });

    expectValidRounds(await prepareMusicContent("1,2", 10), 10);
  });

  it("rejects invalid artist selections before calling Deezer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(prepareMusicContent("not-an-id", 5)).rejects.toThrow("select 1 to 3 artists");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips searches shorter than two characters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(searchArtistsFromDeezer(" a ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("content config", () => {
  it("validates the required setting for each mode", () => {
    expect(isValidContentConfig({ mode: "music", totalRounds: 5, artist: "1,2" })).toBe(true);
    expect(isValidContentConfig({ mode: "music", totalRounds: 5 })).toBe(false);
    expect(
      isValidContentConfig({ mode: "actor", totalRounds: 5, actorCategory: "hollywood" }),
    ).toBe(true);
    expect(isValidContentConfig({ mode: "actor", totalRounds: 5 })).toBe(false);
    expect(isValidContentConfig({ mode: "flag", totalRounds: 5, continent: "africa" })).toBe(true);
    expect(isValidContentConfig({ mode: "flag", totalRounds: 5 })).toBe(false);
    expect(isValidContentConfig({ mode: "place", totalRounds: 5 })).toBe(true);
  });
});
