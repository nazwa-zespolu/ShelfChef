const lightTheme = {
  background: '#fffdf8',
  surface: '#ffffff',
  surfaceSubtle: '#fff8ee',
  surfaceMuted: '#f8f4ec',
  border: '#f0e3cf',
  textPrimary: '#1f2a1f',
  textSecondary: '#394239',
  textMuted: '#7b8b7b',
  accent: '#f57c28',
  accentSoft: '#fde6cf',
  success: '#5f8d56',
  successText: '#ffffff',
  infoText: '#394a39',
  danger: '#be3f3f',
  tabActive: '#305d34',
  tabInactive: '#8a978a',
  tabBackground: '#fffefb',
  shadow: '#000000',
} as const;

const darkTheme = {
  background: '#12171f',
  surface: '#151d25',
  surfaceSubtle: '#1b242f',
  surfaceMuted: '#222e3c',
  border: '#2f3d4f',
  textPrimary: '#f4f6fb',
  textSecondary: '#ccd3df',
  textMuted: '#9aa6ba',
  accent: '#f0914a',
  accentSoft: '#4e3828',
  success: '#47d16b',
  successText: '#102014',
  infoText: '#e6e9ee',
  danger: '#f06a6a',
  tabActive: '#9ef2aa',
  tabInactive: '#9aa6ba',
  tabBackground: '#12171f',
  shadow: '#000000',
} as const;

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

// Current app theme. Keeping this export makes migration from legacy styles gradual.
const activeTheme = themes.light;

export const colors = {
  ...activeTheme,
  // Backward-compatible aliases used across existing screens.
  black: activeTheme.background,
  surfaceDark: activeTheme.surface,
  surfaceMid: activeTheme.surfaceMuted,
  surfaceSoft: activeTheme.surfaceSubtle,
  borderDark: activeTheme.border,
  successAccent: activeTheme.accent,
} as const;
