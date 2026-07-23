/**
 * atcute `LockFunction` for OAuth token refresh — an in-process per-key promise
 * chain. AT Proto refresh tokens are single-use, so concurrent refreshes of the
 * same session race into a logout; serializing them lets the loser re-read the
 * winner's freshly rotated tokens.
 *
 * This is in-process only. A multi-replica production deploy also needs a
 * cross-process lock (the reader uses a Postgres advisory lock via
 * pg_advisory_xact_lock) — a follow-up if this app scales past one instance.
 */

const chains = new Map<string, Promise<unknown>>();

function noop(): void {}

export function requestLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(name) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(noop, noop);
  chains.set(name, tail);
  void tail.finally(() => {
    if (chains.get(name) === tail) chains.delete(name);
  });
  return run;
}
