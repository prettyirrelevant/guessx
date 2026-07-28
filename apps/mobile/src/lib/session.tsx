import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { AVATAR_SEEDS, getAvatarUrl } from "@guessx/game";

const NAME_KEY = "guessx-name";
const AVATAR_KEY = "guessx-avatar";
const SAVE_DELAY = 300;

type SessionValue = {
  displayName: string;
  avatar: string;
  hasProfile: boolean;
  ready: boolean;
  setDisplayName: (value: string) => void;
  setAvatar: (value: string) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState("");
  const [avatar, setAvatarState] = useState("");
  const [ready, setReady] = useState(false);
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingName = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([SecureStore.getItemAsync(NAME_KEY), SecureStore.getItemAsync(AVATAR_KEY)])
      .then(([storedName, storedAvatar]) => {
        if (!active) return;
        setDisplayNameState(storedName ?? "");
        setAvatarState(storedAvatar ?? "");
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        setReady(true);
      });

    return () => {
      active = false;
      if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current);
      if (pendingName.current !== null) {
        void SecureStore.setItemAsync(NAME_KEY, pendingName.current).catch(() => {});
      }
    };
  }, []);

  const setDisplayName = useCallback((value: string) => {
    setDisplayNameState(value);
    pendingName.current = value;
    if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => {
      const next = pendingName.current;
      pendingName.current = null;
      nameSaveTimer.current = null;
      if (next !== null) void SecureStore.setItemAsync(NAME_KEY, next).catch(() => {});
    }, SAVE_DELAY);
  }, []);

  const setAvatar = useCallback((value: string) => {
    setAvatarState(value);
    void SecureStore.setItemAsync(AVATAR_KEY, value).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      displayName,
      avatar,
      hasProfile: displayName.trim().length > 0 && avatar.length > 0,
      ready,
      setDisplayName,
      setAvatar,
    }),
    [avatar, displayName, ready, setAvatar, setDisplayName],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export { AVATAR_SEEDS, getAvatarUrl };
