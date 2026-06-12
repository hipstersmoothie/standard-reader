import { AUTH_SESSION_COOKIE } from "./config";

function cookieUrlCandidates(origin: string): Array<string> {
  const normalized = origin.replace(/\/$/, "");
  const candidates = new Set<string>([normalized, `${normalized}/`]);

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "localhost") {
      const port = parsed.port || "80";
      const alt = `http://127.0.0.1:${port}`;
      candidates.add(alt);
      candidates.add(`${alt}/`);
    }
    if (parsed.hostname === "127.0.0.1") {
      const port = parsed.port || "80";
      const alt = `http://localhost:${port}`;
      candidates.add(alt);
      candidates.add(`${alt}/`);
    }
  } catch {
    // Keep origin-only candidates.
  }

  return [...candidates];
}

/** Read the app session cookie for extension → API requests. */
export async function readSessionCookieValue(
  origin: string,
): Promise<string | undefined> {
  for (const url of cookieUrlCandidates(origin)) {
    try {
      const cookie = await browser.cookies.get({
        url,
        name: AUTH_SESSION_COOKIE,
      });
      if (cookie?.value) return cookie.value;
    } catch {
      // Try the next URL shape.
    }
  }

  try {
    const targetHost = new URL(origin.replace(/\/$/, "") || origin).hostname;
    const cookies = await browser.cookies.getAll({ name: AUTH_SESSION_COOKIE });
    const match = cookies.find((cookie) => {
      const domain = cookie.domain?.replace(/^\./, "") ?? "";
      return (
        domain === targetHost ||
        targetHost.endsWith(domain) ||
        (targetHost === "localhost" && domain === "127.0.0.1") ||
        (targetHost === "127.0.0.1" && domain === "localhost")
      );
    });
    return match?.value;
  } catch {
    return undefined;
  }
}
