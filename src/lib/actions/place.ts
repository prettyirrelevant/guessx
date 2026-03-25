"use server";

import { LANDMARKS } from "@/lib/landmarks";

import { shuffle, buildRounds, type RoundContent } from "./shared";

async function fetchLandmarkImage(placeName: string): Promise<string | null> {
  const params = new URLSearchParams({
    q: placeName,
    license_type: "all",
    page_size: "5",
    extension: "jpg",
    category: "photograph",
    size: "large",
    source: "wikimedia",
    aspect_ratio: "wide",
    mature: "false",
  });

  try {
    let res = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`);
    let data = res.ok ? await res.json() : null;

    // fallback without category filter for landmarks with poor photograph tagging
    if (!data?.results?.length) {
      params.delete("category");
      res = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`);
      data = res.ok ? await res.json() : null;
    }

    if (!data?.results?.length) return null;

    // pick a random result for variety across games
    const idx = Math.floor(Math.random() * data.results.length);
    return data.results[idx]?.url ?? null;
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
