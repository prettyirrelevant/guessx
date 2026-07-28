"use client";

import { useLocalStorage, useMounted } from "@mantine/hooks";
import { AVATAR_SEEDS, getAvatarUrl } from "@guessx/game";

const NAME_KEY = "guessx-name";
const AVATAR_KEY = "guessx-avatar";

export function useSession() {
  const [displayName, setDisplayName] = useLocalStorage({ key: NAME_KEY, defaultValue: "" });
  const [avatar, setAvatar] = useLocalStorage({ key: AVATAR_KEY, defaultValue: "" });
  const mounted = useMounted();
  const hasProfile = displayName.trim().length > 0 && avatar.length > 0;

  return { displayName, avatar, setDisplayName, setAvatar, hasProfile, ready: mounted };
}

export { AVATAR_SEEDS, getAvatarUrl };
