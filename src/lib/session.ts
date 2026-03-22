"use client";

import { useState, useEffect, useCallback } from "react";

const SESSION_KEY = "guessx-session";
const NAME_KEY = "guessx-name";
const AVATAR_KEY = "guessx-avatar";

// dicebear avatar seeds for deterministic generation
// each seed produces a unique adventurer avatar
const AVATAR_SEEDS = [
  "felix", "midnight", "zephyr", "nova", "ember", "pixel",
  "glitch", "neon", "drift", "spark", "vapor", "cipher",
  "echo", "prism", "volt", "ripple", "storm", "flare",
  "byte", "orbit", "pulse", "shade", "blaze", "frost",
  "dusk", "haze", "jade", "luna", "onyx", "reef",
  "sage", "thorn", "wave", "zinc", "coral", "fern",
  "raven", "maple", "cosmo", "indigo", "pepper", "willow",
  "atlas", "brisk", "cleo", "delta", "flint", "glow",
  "hawk", "iris", "jolt", "karma", "lark", "moss",
  "opal", "quake", "rust", "silk", "tide", "umber",
  "vex", "wren", "xenon", "yeti", "zeal", "amber",
];

const DICEBEAR_STYLE = "adventurer";

export function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + b.toString(16).padStart(2, "0"))
        .join("");
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

export function useSession() {
  const [sessionId, setSessionId] = useState("");
  const [displayName, setDisplayNameState] = useState("");
  const [avatar, setAvatarState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    setDisplayNameState(localStorage.getItem(NAME_KEY) ?? "");
    setAvatarState(localStorage.getItem(AVATAR_KEY) ?? "");
    setReady(true);
  }, []);

  const setDisplayName = useCallback((name: string) => {
    setDisplayNameState(name);
    localStorage.setItem(NAME_KEY, name);
  }, []);

  const setAvatar = useCallback((seed: string) => {
    setAvatarState(seed);
    localStorage.setItem(AVATAR_KEY, seed);
  }, []);

  const hasProfile = displayName.trim().length > 0 && avatar.length > 0;

  return { sessionId, displayName, avatar, setDisplayName, setAvatar, hasProfile, ready };
}

export { AVATAR_SEEDS };
