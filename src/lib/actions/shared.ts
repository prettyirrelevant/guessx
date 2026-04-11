export interface RoundContent {
  roundNumber: number;
  correctAnswer: string;
  options: string[];
  mediaUrl: string;
  mediaTitle?: string;
  mediaArtist?: string;
  isFinal: boolean;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

export function buildRounds({
  candidates,
  distractorNames,
  totalRounds,
}: {
  candidates: { answer: string; mediaUrl: string; mediaTitle?: string; mediaArtist?: string }[];
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
