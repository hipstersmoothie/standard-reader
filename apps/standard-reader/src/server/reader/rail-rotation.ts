/* oxlint-disable unicorn/prefer-math-trunc -- `>>> 0` / `| 0` are uint32/int32
   coercions here, not truncation; Math.trunc is not equivalent. */
/* oxlint-disable unicorn/numeric-separators-style -- 32-bit hash/PRNG constants
   read most clearly as unbroken hex. */
/**
 * Deterministic daily rotation for recommendation rails.
 *
 * The publication recommenders are pure functions of slow-moving inputs (the
 * reader's follows + cron-recomputed aggregates), so without intervention every
 * surface shows the identical top-N until the graph itself changes. Rotation
 * fixes that: rank a wider candidate pool, then draw `limit` items with
 * rank-weighted sampling seeded by (surface, viewer, UTC day). Better-ranked
 * candidates stay more likely, but the tail rotates in — and the seed makes the
 * result stable within a day (no reshuffle on refresh) while differing across
 * days and across surfaces (home vs discover vs digest).
 */

/** How many ranked candidates to fetch per rail slot before sampling. */
export const ROTATION_POOL_MULTIPLIER = 3;

/**
 * Per-rank weight decay for sampling. Candidate at rank `i` gets weight
 * `ROTATION_RANK_DECAY ** i`, so rank 0 is ~3.6× as likely as rank 10 and
 * ~13× as likely as rank 20.
 */
export const ROTATION_RANK_DECAY = 0.88;

/** FNV-1a 32-bit hash — cheap deterministic string → uint32. */
function hashSeed(seed: string): number {
  // eslint-disable-next-line unicorn/number-literal-case -- oxfmt lowercases hex
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — small, fast, good enough for sampling rails. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    // eslint-disable-next-line unicorn/number-literal-case -- oxfmt lowercases hex
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC day key, e.g. `2026-07-11` — rails rotate at midnight UTC. */
export function rotationDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Seed for one rail render: same all day for a given surface + viewer, so the
 * rail is stable across refreshes but differs per surface and per day.
 */
export function rotationSeed(
  surface: string,
  viewer: string,
  now?: Date,
): string {
  return `${surface}:${viewer}:${rotationDayKey(now)}`;
}

/**
 * Draw `limit` items from rank-ordered `candidates` via weighted sampling
 * without replacement (Efraimidis–Spirakis: key = u^(1/w), take largest).
 * Output is ordered by sampled priority, so even ever-present head candidates
 * don't monopolize the first slots.
 */
export function rotateRail<T>(
  candidates: Array<T>,
  limit: number,
  seed: string,
): Array<T> {
  if (candidates.length <= limit) {
    return candidates.slice(0, limit);
  }

  const rng = mulberry32(hashSeed(seed));
  return candidates
    .map((item, index) => ({
      item,
      key: Math.pow(rng(), 1 / Math.pow(ROTATION_RANK_DECAY, index)),
    }))
    .toSorted((a, b) => b.key - a.key)
    .slice(0, limit)
    .map(({ item }) => item);
}
