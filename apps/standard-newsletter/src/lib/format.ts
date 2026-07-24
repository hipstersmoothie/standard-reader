/** `12345` → `"12,345"`. Subscriber counts, recipients, opens. */
export const fmt = (n: number): string => n.toLocaleString("en-US");

/** `12345` → `"12.3k"`. For the tight counts in the sidebar. */
export const kfmt = (n: number): string =>
  n >= 1000
    ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".0", "")}k`
    : String(n);
