/**
 * SSRF guard — validates that a URL does not point to a private, loopback,
 * link-local, or otherwise internal address before it is fetched.
 *
 * Blocks:
 * - IPv4: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGNAT), 127.0.0.0/8,
 *   169.254.0.0/16 (link-local / cloud metadata), 172.16.0.0/12,
 *   192.0.0.0/24, 192.168.0.0/16, 198.18.0.0/15
 * - IPv6: ::1 (loopback), fc00::/7 (unique local), fe80::/10 (link-local),
 *   IPv4-mapped (::ffff:x.x.x.x — delegates to IPv4 check)
 * - Hostnames: "localhost", and any ending in ".local", ".internal",
 *   ".localhost", ".home.arpa"
 *
 * Known limitation: does not resolve DNS, so a hostname that resolves to a
 * private IP (DNS rebinding) is not caught. This closes the documented attack
 * scenarios (IP literals + internal hostname suffixes). For full protection,
 * callers should additionally validate resolved IPs at the fetch layer.
 */

/** A blocked IP range expressed as inclusive 32-bit unsigned integers. */
interface BlockedIpv4Range {
  start: number;
  end: number;
  label: string;
}

/** Convert a CIDR pair (base IP + prefix length) to a numeric range. */
function cidrRange(
  base: string,
  prefix: number,
): { start: number; end: number } {
  const ip = ipv4ToInt(base);
  const hostBits = 32 - prefix;
  const blockSize = Math.pow(2, hostBits);
  const start = Math.floor(ip / blockSize) * blockSize;
  return { start, end: start + blockSize - 1 };
}

const BLOCKED_IPV4_RANGES: Array<BlockedIpv4Range> = [
  { ...cidrRange("0.0.0.0", 8), label: "0.0.0.0/8" },
  { ...cidrRange("10.0.0.0", 8), label: "10.0.0.0/8 (RFC1918)" },
  { ...cidrRange("100.64.0.0", 10), label: "100.64.0.0/10 (CGNAT)" },
  { ...cidrRange("127.0.0.0", 8), label: "127.0.0.0/8 (loopback)" },
  { ...cidrRange("169.254.0.0", 16), label: "169.254.0.0/16 (link-local)" },
  { ...cidrRange("172.16.0.0", 12), label: "172.16.0.0/12 (RFC1918)" },
  { ...cidrRange("192.0.0.0", 24), label: "192.0.0.0/24" },
  { ...cidrRange("192.168.0.0", 16), label: "192.168.0.0/16 (RFC1918)" },
  { ...cidrRange("198.18.0.0", 15), label: "198.18.0.0/15 (benchmark)" },
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
]);
const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".home.arpa",
  ".localdomain",
];

/** Returns true if `host` is a valid decimal IPv4 literal (e.g. "192.168.1.1"). */
function isIpv4Literal(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (p.length === 0 || p.length > 3) return false;
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

/** Convert an IPv4 string to a 32-bit unsigned integer (as a JS number). */
function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split(".").map(Number);
  return a * 0x1_00_00_00 + b * 0x1_00_00 + c * 0x1_00 + d;
}

function checkBlockedIpv4(ip: string): string | null {
  const addr = ipv4ToInt(ip);
  for (const range of BLOCKED_IPV4_RANGES) {
    if (addr >= range.start && addr <= range.end) return range.label;
  }
  return null;
}

/** Check an IPv6 literal (without brackets) against blocked ranges. */
function checkBlockedIpv6(ip: string): string | null {
  const normalized = ip.toLowerCase();

  // IPv4-mapped: ::ffff:x.x.x.x (decimal) or ::ffff:xxxx:xxxx (hex).
  // The URL class normalizes decimal form to hex, so we handle both.
  if (normalized.startsWith("::ffff:")) {
    const rest = normalized.slice("::ffff:".length);
    // Decimal form: ::ffff:169.254.169.254
    if (isIpv4Literal(rest)) {
      return checkBlockedIpv4(rest);
    }
    // Hex form: ::ffff:a9fe:a9fe → 169.254.169.254
    const hexMatch = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const hi = Number.parseInt(hexMatch[1], 16);
      const lo = Number.parseInt(hexMatch[2], 16);
      const ipv4 = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
      return checkBlockedIpv4(ipv4);
    }
  }

  // ::1 — loopback (covers both "::1" and "0:0:0:0:0:0:0:1" after expansion).
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return "::1/128 (loopback)";
  }

  // fc00::/7 — unique local (fc* through fd*).
  if (/^f[cd][0-9a-f]/.test(normalized)) {
    return "fc00::/7 (unique local)";
  }

  // fe80::/10 — link-local (fe8*, fe9*, fea*, feb*).
  if (/^fe[89ab][0-9a-f]/.test(normalized)) {
    return "fe80::/10 (link-local)";
  }

  return null;
}

export interface AssertSafeFetchUrlOptions {
  /** Require HTTPS protocol (default: true). Set false for dev/localhost URLs. */
  requireHttps?: boolean;
}

/**
 * Validate that `url` is safe to fetch — i.e. it does not point to a private,
 * loopback, link-local, or otherwise internal address. Throws if the URL is
 * unsafe; returns void if safe.
 *
 * @throws Error if the URL is malformed, uses a non-HTTPS protocol (when
 *   `requireHttps` is true), or resolves to a blocked IP/hostname.
 */
export function assertSafeFetchUrl(
  url: string,
  options?: AssertSafeFetchUrlOptions,
): void {
  const requireHttps = options?.requireHttps ?? true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SSRF guard: invalid URL`);
  }

  if (requireHttps && parsed.protocol !== "https:") {
    throw new Error(`SSRF guard: non-HTTPS protocol (${parsed.protocol})`);
  }

  const hostname = parsed.hostname;

  // Strip IPv6 brackets: [::1] → ::1
  const stripped = hostname.replaceAll(/^\[|\]$/g, "");

  // Check IPv4 literals
  if (isIpv4Literal(stripped)) {
    const blocked = checkBlockedIpv4(stripped);
    if (blocked) {
      throw new Error(`SSRF guard: blocked IP (${blocked})`);
    }
    return;
  }

  // Check IPv6 literals
  if (stripped.includes(":")) {
    const blocked = checkBlockedIpv6(stripped);
    if (blocked) {
      throw new Error(`SSRF guard: blocked IPv6 (${blocked})`);
    }
    return;
  }

  // Check hostname blocklist
  const lower = stripped.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) {
    throw new Error(`SSRF guard: blocked hostname (${stripped})`);
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      throw new Error(`SSRF guard: blocked hostname suffix (${suffix})`);
    }
  }
}
