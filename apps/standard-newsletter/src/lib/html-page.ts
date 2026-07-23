const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Minimal standalone HTML confirmation page (no client JS needed). */
export function htmlPage(
  title: string,
  message: string,
  status = 200,
): Response {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>body{font-family:'Newsreader',Georgia,serif;background:#f5f1ea;color:#241d18;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}.c{max-width:420px;text-align:center}h1{font-size:26px;font-weight:500;letter-spacing:-.02em;margin:0 0 10px}p{color:#6f5636;line-height:1.6;font-size:15px}</style></head><body><div class="c"><h1>${esc(title)}</h1><p>${esc(message)}</p></div></body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
