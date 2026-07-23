export interface RoundContent {
  roundNumber: number;
  correctAnswer: string;
  options: string[];
  mediaUrl: string;
  mediaTitle?: string;
  mediaArtist?: string;
  isFinal: boolean;
}

export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 10;

export function assertTotalRounds(totalRounds: number): number {
  if (!Number.isInteger(totalRounds) || totalRounds < MIN_ROUNDS || totalRounds > MAX_ROUNDS) {
    throw new Error(`round count must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}`);
  }
  return totalRounds;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchJson<T>(
  url: string,
  options: { headers?: HeadersInit; revalidate?: number; timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 8_000;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      headers: options.headers,
      next: options.revalidate ? { revalidate: options.revalidate } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json"))
        throw new Error("provider returned invalid data");
      return (await response.json()) as T;
    }
    if (!TRANSIENT_STATUS.has(response.status) || attempt === 1) {
      throw new Error(`provider request failed: ${response.status}`);
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1_000, 2_000) : 300;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error("provider request failed");
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
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
  const usedAnswers = new Set<string>();
  const rounds: RoundContent[] = [];

  for (const candidate of candidates) {
    if (rounds.length >= totalRounds) break;
    if (usedAnswers.has(candidate.answer)) continue;

    // fresh pool shrinks by 1 per round: size N on round i leaves N-i options.
    // with N=11, totalRounds=10, round 9 has only 2 left — fall back to reusing
    // past answers as distractors instead of silently dropping the round.
    let pool = distractorNames.filter((d) => d !== candidate.answer && !usedAnswers.has(d));
    if (pool.length < 3) {
      pool = distractorNames.filter((d) => d !== candidate.answer);
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
