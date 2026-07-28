import { BackHandler } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigation } from "expo-router";

export function useSubmission() {
  const navigation = useNavigation();
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [loading, setLoading] = useState(false);

  useEffect(
    () => () => {
      mounted.current = false;
      controllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!loading) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [loading]);

  const start = useCallback(() => {
    if (controllerRef.current) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    navigation.setOptions({ gestureEnabled: false });
    setLoading(true);
    return controller;
  }, [navigation]);

  const isCurrent = useCallback(
    (controller: AbortController) =>
      mounted.current && controllerRef.current === controller && !controller.signal.aborted,
    [],
  );

  const finish = useCallback(
    (controller: AbortController) => {
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      if (!mounted.current) return;
      navigation.setOptions({ gestureEnabled: true });
      setLoading(false);
    },
    [navigation],
  );

  return { finish, isCurrent, loading, start };
}
