import { PALETTE, PALETTE_FONTS } from "../theme-palette";

const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Minimal standalone HTML confirmation page (no client JS needed).
 *
 * Rendered outside the app shell, so it has no access to the StyleX bundle or
 * the editorial theme's CSS variables — the palette is inlined from the hex
 * mirror in `src/theme-palette`.
 */
export function htmlPage(
  title: string,
  message: string,
  status = 200,
): Response {
  const style = [
    `body{font-family:${PALETTE_FONTS.serif};background:${PALETTE.page};color:${PALETTE.ink};display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}`,
    `.c{max-width:420px;text-align:center}`,
    `h1{font-size:26px;font-weight:500;letter-spacing:-.02em;margin:0 0 10px}`,
    `p{color:${PALETTE.accentInk};line-height:1.6;font-size:15px}`,
  ].join("");
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>${style}</style></head><body><div class="c"><h1>${esc(title)}</h1><p>${esc(message)}</p></div></body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
