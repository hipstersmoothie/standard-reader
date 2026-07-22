// This module pairs the `Ico` component with its `I` path library by design.
/* eslint-disable react-refresh/only-export-components */
import type { CSSProperties } from "react";

interface IcoProps {
  /** Raw inner SVG markup (paths, shapes) for a 24×24 viewBox. */
  d: string;
  /** Rendered square size in px. */
  s?: number;
  /** Stroke width. */
  w?: number;
  style?: CSSProperties;
}

/** Inline stroke icon rendered from a raw path string. */
export function Ico({ d, s = 17, w = 1.8, style }: IcoProps) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

/** Icon path library (Lucide-derived) used throughout Standard Writer. */
export const I = {
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  file: '<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/><path d="M14 4v6h6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>',
  clock:
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  up: '<path d="M12 19V6"/><path d="m5 12 7-7 7 7"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  imgSm:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-4 4 3 3-2 4 3"/>',
  card: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m3 8 18 0"/>',
  bsky: '<path d="M12 10.8C10.7 8.4 7.2 4.1 4 4c-1.6 0-2.6 1.4-2.6 3.6 0 3.7 2.4 7.9 4.6 9 .9.5 1.7.4 2.4.1-1.2.7-2.9 1.4-2.9 3.3 0 1 .8 2 2.5 2 1.9 0 3.4-2.5 4-3.9.6 1.4 2.1 3.9 4 3.9 1.7 0 2.5-1 2.5-2 0-1.9-1.7-2.6-2.9-3.3.7.3 1.5.4 2.4-.1 2.2-1.1 4.6-5.3 4.6-9C22.6 5.4 21.6 4 20 4c-3.2.1-6.7 4.4-8 6.8Z"/>',
  panel:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  external:
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
} as const;
/* eslint-enable react-refresh/only-export-components */
