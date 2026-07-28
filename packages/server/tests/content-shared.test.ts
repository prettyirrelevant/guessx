import { describe, expect, it, vi } from "vitest";

import {
  assertTotalRounds,
  buildRounds,
  fetchJson,
  mapWithConcurrency,
} from "../src/content/shared";
import { COUNTRY_CATALOG } from "../src/content/flag";

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

  it("never emits duplicate options when distractor names repeat", () => {
    const names = ["One", "Two", "Three", "Four", "Five"];
    const rounds = buildRounds({
      candidates: makeCandidates(names),
      distractorNames: [...names, "Two", "Three"],
      totalRounds: 5,
    });

    for (const round of rounds) {
      expect(round.options).toHaveLength(4);
      expect(new Set(round.options).size).toBe(4);
    }
  });
});

describe("assertTotalRounds", () => {
  it.each([1, 3, 5, 10])("accepts %i rounds", (rounds) => {
    expect(assertTotalRounds(rounds)).toBe(rounds);
  });

  it.each([0, 11, 4.5, Number.NaN])("rejects %s rounds", (rounds) => {
    expect(() => assertTotalRounds(rounds)).toThrow(/round count/);
  });
});

describe("fetchJson", () => {
  it("retries a transient response once", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
      );

    const request = fetchJson<{ ok: boolean }>("https://example.com");
    await vi.advanceTimersByTimeAsync(300);

    await expect(request).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("rejects malformed JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{", { headers: { "content-type": "application/json" } }),
    );

    await expect(fetchJson("https://example.com")).rejects.toThrow(
      "provider returned invalid data",
    );
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order, captures failures, and respects the limit", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      if (value === 3) throw new Error("failed");
      return value * 2;
    });

    expect(peak).toBe(2);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(results[0]).toEqual({ status: "fulfilled", value: 2 });
    expect(results[3]).toEqual({ status: "fulfilled", value: 8 });
  });

  it("rejects an invalid concurrency limit", async () => {
    await expect(mapWithConcurrency([], 0, async () => undefined)).rejects.toThrow(
      "concurrency limit must be positive",
    );
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
