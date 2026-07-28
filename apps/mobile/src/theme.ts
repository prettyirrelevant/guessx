export const colors = {
  bg: "#0a0a0a",
  surface: "#141414",
  surface2: "#1e1e1e",
  border: "#2e2e2e",
  lineStrong: "#3d3d3d",
  text: "#f0f0f0",
  muted: "#b0b0b0",
  muted2: "#8a8a8a",
  accent: "#c8f135",
  brand: "#c8f135",
  success: "#43d675",
  warning: "#ffb020",
  danger: "#ff5c5c",
  scrim: "rgba(10, 10, 10, 0.72)",
  accentSoft: "rgba(200, 241, 53, 0.10)",
  accentRing: "rgba(200, 241, 53, 0.35)",
  youTint: "rgba(200, 241, 53, 0.06)",
  streakSoft: "rgba(200, 241, 53, 0.10)",
  successSoft: "rgba(67, 214, 117, 0.15)",
  dangerSoft: "rgba(255, 92, 92, 0.15)",
  warningSoft: "rgba(255, 176, 32, 0.12)",
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  8: 48,
  10: 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const fontSize = {
  displayXl: 56,
  displayLg: 36,
  displayMd: 24,
  title: 18,
  body: 16,
  bodySm: 14,
  label: 12,
  labelSm: 11,
} as const;

export const tracking = {
  display: -1.1,
  tight: -0.3,
  label: 1,
} as const;

export const fonts = {
  display: "Syne-ExtraBold",
  mono: "DMMono-Medium",
  text: undefined as string | undefined,
} as const;

export const durations = {
  feedback: 100,
  fast: 150,
  base: 240,
  slow: 320,
} as const;

const darkTheme = {
  colors,
  space,
  radius,
  fontSize,
  tracking,
  fonts,
  durations,
  gap: (n: number) => n * 4,
} as const;

export const themes = {
  dark: darkTheme,
} as const;

export type AppThemes = typeof themes;
export type AppTheme = AppThemes["dark"];
