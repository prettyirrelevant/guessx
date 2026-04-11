"use client";

import { useLocalStorage, useMounted } from "@mantine/hooks";

const SESSION_KEY = "guessx-session";
const NAME_KEY = "guessx-name";
const AVATAR_KEY = "guessx-avatar";

// dicebear avatar seeds for deterministic generation
// each seed produces a unique adventurer avatar
const AVATAR_SEEDS = [
  "felix",
  "midnight",
  "zephyr",
  "nova",
  "ember",
  "pixel",
  "glitch",
  "neon",
  "drift",
  "spark",
  "vapor",
  "cipher",
  "echo",
  "prism",
  "volt",
  "ripple",
  "storm",
  "flare",
  "byte",
  "orbit",
  "pulse",
  "shade",
  "blaze",
  "frost",
  "dusk",
  "haze",
  "jade",
  "luna",
  "onyx",
  "reef",
  "sage",
  "thorn",
  "wave",
  "zinc",
  "coral",
  "fern",
  "raven",
  "maple",
  "cosmo",
  "indigo",
  "pepper",
  "willow",
  "atlas",
  "brisk",
  "cleo",
  "delta",
  "flint",
  "glow",
  "hawk",
  "iris",
  "jolt",
  "karma",
  "lark",
  "moss",
  "opal",
  "quake",
  "rust",
  "silk",
  "tide",
  "umber",
  "vex",
  "wren",
  "xenon",
  "yeti",
  "zeal",
  "amber",
];

const DICEBEAR_STYLE = "adventurer";

export function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/png?seed=${encodeURIComponent(seed)}&size=128`;
}

export function useSession() {
  const [sessionId] = useLocalStorage({ key: SESSION_KEY, defaultValue: crypto.randomUUID() });
  const [displayName, setDisplayName] = useLocalStorage({ key: NAME_KEY, defaultValue: "" });
  const [avatar, setAvatar] = useLocalStorage({ key: AVATAR_KEY, defaultValue: "" });
  const mounted = useMounted();

  const hasProfile = displayName.trim().length > 0 && avatar.length > 0;

  return { sessionId, displayName, avatar, setDisplayName, setAvatar, hasProfile, ready: mounted };
}

export { AVATAR_SEEDS };
