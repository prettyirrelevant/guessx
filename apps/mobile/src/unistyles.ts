import { StyleSheet } from "react-native-unistyles";

import { themes, type AppThemes } from "./theme";

const breakpoints = {
  xs: 0,
  sm: 380,
  md: 600,
} as const;

type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes,
  breakpoints,
  settings: {
    initialTheme: "dark",
  },
});
