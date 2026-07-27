import { MAX_ROUNDS, MIN_ROUNDS, type RoundContent } from "@guessx/game";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function assertTotalRounds(totalRounds: number): number {
  if (!Number.isInteger(totalRounds) || totalRounds < MIN_ROUNDS || totalRounds > MAX_ROUNDS) {
    throw new Error(`round count must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}`);
  }
  return totalRounds;
}

export function shuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Fetches JSON with a bounded timeout and one retry for transient provider failures. */
export async function fetchJson<T>(
  url: string,
  options: { headers?: HeadersInit; timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 8_000;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt === 1) throw new Error("provider request failed", { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }

    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("provider returned invalid data");
      }
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new Error("provider returned invalid data", { cause: error });
      }
    }
    if (!TRANSIENT_STATUS.has(response.status) || attempt === 1) {
      throw new Error(`provider request failed: ${response.status}`);
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    const waitMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(0, Math.min(retryAfterSeconds * 1_000, 2_000))
      : 300;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error("provider request failed");
}

/**
 * Maps values with a fixed worker count while preserving input order and individual failures.
 */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("concurrency limit must be positive");

  const results = Array.from<PromiseSettledResult<R>>({ length: values.length });
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await mapper(values[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

/** Builds unique-answer rounds and falls back to previously used answers only as distractors. */
export function buildRounds({
  candidates,
  distractorNames,
  totalRounds,
}: {
  candidates: {
    answer: string;
    mediaUrl: string;
    mediaTitle?: string;
    mediaArtist?: string;
  }[];
  distractorNames: string[];
  totalRounds: number;
}): RoundContent[] {
  assertTotalRounds(totalRounds);

  const uniqueDistractorNames = [...new Set(distractorNames)];
  const usedAnswers = new Set<string>();
  const rounds: RoundContent[] = [];

  for (const candidate of candidates) {
    if (rounds.length >= totalRounds) break;
    if (usedAnswers.has(candidate.answer)) continue;

    let pool = uniqueDistractorNames.filter(
      (name) => name !== candidate.answer && !usedAnswers.has(name),
    );
    if (pool.length < 3) {
      pool = uniqueDistractorNames.filter((name) => name !== candidate.answer);
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
      isFinal: rounds.length === totalRounds - 1,
    });
  }

  if (rounds.length < totalRounds) {
    throw new Error(
      `could not build ${totalRounds} rounds (only ${rounds.length} valid candidates)`,
    );
  }

  return rounds;
}
