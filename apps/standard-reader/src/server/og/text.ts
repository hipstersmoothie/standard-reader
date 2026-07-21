/** Word-boundary truncation for OG card copy (satori has no line-clamp). */
export function truncateAtWord(text: string, maxLength: number): string {
  /**
   * NFKC folds compatibility characters people paste into bios — mathematical
   * alphanumerics (𝘛𝘩𝘪𝘴 → This), enclosed letters (ⓘ → i), fullwidth forms —
   * onto ASCII the bundled latin-subset fonts can actually draw. Emoji have no
   * compatibility decompositions, so they pass through untouched.
   */
  const trimmed = text.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,.;:—-]+$/, "")}…`;
}
