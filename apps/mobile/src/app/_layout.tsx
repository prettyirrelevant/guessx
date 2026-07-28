import "@/lib/polyfills";
import "@/unistyles";
import { Toaster } from "sonner-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react-native";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router/stack";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { setAudioModeAsync } from "expo-audio";

import { colors } from "@/theme";
import { SessionProvider } from "@/lib/session";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function RootLayout() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <SessionProvider>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: "minimal",
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen
              name="create"
              options={{
                presentation: "formSheet",
                headerShown: false,
                sheetAllowedDetents: [0.6, 0.95],
                sheetGrabberVisible: true,
              }}
            />
            <Stack.Screen
              name="join"
              options={{
                presentation: "formSheet",
                headerShown: false,
                sheetAllowedDetents: [0.45, 0.9],
                sheetGrabberVisible: true,
              }}
            />
            <Stack.Screen
              name="room/[code]"
              options={{ gestureEnabled: false, headerShown: false }}
            />
            <Stack.Screen name="credits" options={{ headerShown: false }} />
            <Stack.Screen name="how-to-play" options={{ headerShown: false }} />
          </Stack>
        </SessionProvider>
      </ThemeProvider>
      <Toaster
        duration={3200}
        gap={8}
        icons={{
          error: <X color={colors.danger} size={20} />,
          success: <Check color={colors.accent} size={20} />,
          info: <Info color={colors.muted} size={20} />,
          warning: <TriangleAlert color={colors.warning} size={20} />,
        }}
        offset={insets.top + 12}
        position="top-center"
        swipeToDismissDirection="up"
        theme="dark"
        toastOptions={{
          style: {
            backgroundColor: colors.surface2,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 14,
          },
          titleStyle: { color: colors.text, fontSize: 14, fontWeight: "600" },
        }}
        visibleToasts={3}
      />
    </GestureHandlerRootView>
  );
}
