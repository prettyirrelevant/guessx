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

    const distractors = shuffle(
      distractorNames.filter((d) => d !== candidate.answer && !usedAnswers.has(d)),
    ).slice(0, 3);

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

  return rounds;
}
