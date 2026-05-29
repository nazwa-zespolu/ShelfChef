const lightTheme = {
  // App/page background.
  background: '#fffdf8',
  // Main cards, inputs and sheets.
  surface: '#ffffff',
  // Secondary surfaces (buttons/chips).
  surfaceSubtle: '#fff8ee',
  // Tertiary containers and placeholders.
  surfaceMuted: '#f8f4ec',
  // Borders and separators.
  border: '#f0e3cf',

  // Main readable text.
  textPrimary: '#1f2a1f',
  // Secondary text (descriptions).
  textSecondary: '#394239',
  // Placeholder / disabled text.
  textMuted: '#7b8b7b',

  // Brand accent and active highlight.
  accent: '#5f8d56',
  // Soft accent backgrounds.
  accentSoft: '#5F8D562C',

  // Positive actions and confirmations.
  success: '#5f8d56',
  // Text on success backgrounds.
  successText: '#ffffff',
  // Destructive actions (delete).
  danger: '#be3f3f',

  // Bottom navigation states.
  tabActive: '#305d34',
  tabInactive: '#8a978a',
  tabBackground: '#fffefb',

  // Shadows and overlays that need black base.
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

// Switch this to themes.dark to enable dark mode globally.
const activeTheme = themes.light;
export const colors = activeTheme;
