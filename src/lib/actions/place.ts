"use server";

import { LANDMARKS } from "@/lib/landmarks";

import type { RoundContent } from "./shared";
import { shuffle, buildRounds } from "./shared";

async function fetchLandmarkImage(placeName: string): Promise<string | null> {
  const params = new URLSearchParams({
    q: placeName,
    license_type: "all",
    page_size: "1",
    extension: "jpg",
  });

  try {
    const res = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`);
    if (!res.ok) return null;

    const data = await res.json();
    return data.results?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

export async function preparePlaceContent(
  country: string,
  totalRounds: number,
): Promise<RoundContent[]> {
  const landmarks = LANDMARKS[country] ?? LANDMARKS["US"];
  const shuffled = shuffle(landmarks);

  // fetch images in parallel, then build rounds from successful results
  const candidateNames = shuffled.slice(0, Math.max(totalRounds * 3, 15));
  const imageResults = await Promise.allSettled(
    candidateNames.map(async (place) => ({
      place,
      imageUrl: await fetchLandmarkImage(place),
    })),
  );

  const candidates = imageResults.flatMap((r) =>
    r.status === "fulfilled" && r.value.imageUrl
      ? [{ answer: r.value.place, mediaUrl: r.value.imageUrl, mediaTitle: r.value.place }]
      : [],
  );

  const rounds = buildRounds({
    candidates,
    distractorNames: landmarks,
    totalRounds,
  });

  if (rounds.length === 0) {
    throw new Error("could not fetch enough landmarks for this country");
  }

  return rounds;
}
