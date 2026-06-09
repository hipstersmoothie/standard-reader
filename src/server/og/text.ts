/** Word-boundary truncation for OG card copy (satori has no line-clamp). */
export function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim().replaceAll(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,.;:—-]+$/, "")}…`;
}
