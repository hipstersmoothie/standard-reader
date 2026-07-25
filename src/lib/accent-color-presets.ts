/**
 * Curated app-wide accent color presets — see `#/lib/accent-color-scale` for
 * how a preset (or a custom `#rrggbb`) turns into the app's actual theme.
 *
 * `camel` is the app's current hand-tuned "terracotta" accent
 * (`editorialPrimary` in `#/components/reader/theme`) restated as a single
 * seed color, so picking it explicitly renders the same hue as the default —
 * only a reader who has never set a preference sees the exact hand-tuned
 * values (including the P3 gamut variants this derived scale doesn't have).
 */
export interface AccentColorPreset {
  id: string;
  seed: string;
}

export const ACCENT_COLOR_PRESETS: ReadonlyArray<AccentColorPreset> = [
  { id: "camel", seed: "#ad7f58" },
  { id: "moss", seed: "#6f8f5b" },
  { id: "teal", seed: "#4f8f86" },
  { id: "slate", seed: "#5f7fa3" },
  { id: "plum", seed: "#8f6693" },
  { id: "rust", seed: "#b3573f" },
];

export function accentColorPresetById(id: string): AccentColorPreset | null {
  return ACCENT_COLOR_PRESETS.find((preset) => preset.id === id) ?? null;
}
