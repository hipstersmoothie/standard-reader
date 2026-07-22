/**
 * `requestLock` for the OAuth client. atcute serializes token refreshes per DID
 * through this lock so two concurrent requests can't both rotate the refresh
 * token (which would revoke the session — the classic logout-on-refresh race).
 *
 * Standard Reader uses a Postgres advisory lock so it holds across worker
 * processes. Standard Writer runs a single server process, so an in-memory
 * keyed promise chain is sufficient: calls for the same key run one at a time,
 * different keys run concurrently.
 */
const chains = new Map<string, Promise<unknown>>();

export function inMemoryRequestLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = chains.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  // Keep the chain going but drop the entry once it settles and nothing else is
  // queued behind it, so the map doesn't grow unbounded.
  const tail = run
    .catch(() => {})
    .finally(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
  chains.set(key, tail);
  return run;
}
