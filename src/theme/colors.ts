/*
Naming guidelines:
- Use semantic names only (what color does), never visual names (what color is).
- `background` is page-level only (full-screen roots).
- `surface*` is for containers:
  - `surface` for primary cards/sheets/inputs,
  - `surfaceSubtle` for secondary UI (chips, neutral buttons),
  - `surfaceMuted` for placeholders and tertiary blocks.
- `text*` controls readability hierarchy:
  - `textPrimary` titles and key values,
  - `textSecondary` descriptions and helper text,
  - `textMuted` placeholders/disabled labels.
- `accent` / `accentSoft` are for brand highlights and selected states.
- `success` is for positive actions; `danger` only for destructive actions.
- `warning` is for reversible caution actions.
- `warningSoft` is for subtle warning/caution backgrounds.
- `tab*` is reserved for bottom navigation only.
- `modalBackdrop` is for dimming the app behind modal sheets.
*/
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
  // Reversible caution actions.
  warning: '#c8792a',
  warningSoft: '#C8792A1F',
  warningText: '#ffffff',

  // Bottom navigation states.
  tabActive: '#305d34',
  tabInactive: '#8a978a',
  tabBackground: '#fffefb',

  // Shadows and overlays that need black base.
  shadow: '#000000',
  // Modal backdrop overlay.
  modalBackdrop: '#000000B8',
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
  warning: '#f0a84a',
  warningSoft: '#4f341f',
  warningText: '#1f170b',
  tabActive: '#9ef2aa',
  tabInactive: '#9aa6ba',
  tabBackground: '#12171f',
  shadow: '#000000',
  modalBackdrop: '#000000B8',
} as const;

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

// App-level forced scheme. Keep `light` until dark mode is intentionally enabled.
const activeTheme = themes.light;
export const colors = activeTheme;
