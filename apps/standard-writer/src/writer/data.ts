/**
 * Theme presets + palette for the New/Edit publication screen. (Publications
 * and documents themselves are read live from the shared database — see
 * `integrations/tanstack-query/api-publications.functions.ts`.)
 */

export interface PubTheme {
  background: string;
  foreground: string;
  accent: string;
  accentForeground: string;
}

export interface ThemePreset extends PubTheme {
  id: string;
  name: string;
}

export const THEME_PRESETS: Array<ThemePreset> = [
  {
    id: "almanac",
    name: "Almanac",
    background: "#fcf9f5",
    foreground: "#3e332e",
    accent: "#ad7f58",
    accentForeground: "#ffffff",
  },
  {
    id: "ink",
    name: "Ink",
    background: "#ffffff",
    foreground: "#1a1a1a",
    accent: "#2b6cb0",
    accentForeground: "#ffffff",
  },
  {
    id: "forest",
    name: "Forest",
    background: "#f3f6f1",
    foreground: "#22311f",
    accent: "#3f7d4e",
    accentForeground: "#ffffff",
  },
  {
    id: "dusk",
    name: "Dusk",
    background: "#1b1a24",
    foreground: "#eceaf6",
    accent: "#b48ce0",
    accentForeground: "#1b1a24",
  },
];

export interface ThemeRole {
  key: keyof PubTheme;
  label: string;
  desc: string;
}

export const THEME_ROLES: Array<ThemeRole> = [
  { key: "background", label: "Background", desc: "Content background" },
  { key: "foreground", label: "Foreground", desc: "Content text" },
  { key: "accent", label: "Accent", desc: "Links & button fills" },
  { key: "accentForeground", label: "Accent text", desc: "Text on buttons" },
];

export const PALETTE = [
  "#fcf9f5",
  "#3e332e",
  "#ad7f58",
  "#8a5a3c",
  "#c99f6a",
  "#5f4632",
  "#2b6cb0",
  "#3f7d4e",
  "#a33a2a",
  "#b48ce0",
  "#1b1a24",
  "#ffffff",
];
