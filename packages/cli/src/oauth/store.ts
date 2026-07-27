/**
 * Where the CLI keeps an OAuth session between runs.
 *
 * One JSON file under the user's config directory, holding the DPoP private
 * key and the token set. That is bearer-equivalent material, so the file is
 * written `0600` inside a `0700` directory and never logged.
 *
 * The `redirectUri` is stored alongside the session, and it is not incidental:
 * a loopback client's `client_id` is `http://localhost?...&redirect_uri=<uri>`,
 * so it embeds the port that was bound at login. Refreshing a token later must
 * present the byte-identical `client_id`, which means reconstructing the client
 * from the *original* redirect URI rather than from whatever port a future run
 * happens to get. Nothing needs to be listening on it — only the string has to
 * match.
 */

import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Did } from "@atcute/lexicons";
import type { StoredSession, StoredState } from "@atcute/oauth-node-client";

/** A saved sign-in, as it sits on disk. */
export interface SavedSession {
  did: Did;
  handle: string;
  /** PDS service endpoint, for blob fetches that do not go through the client. */
  service: string;
  /** The loopback redirect URI this session's `client_id` was built from. */
  redirectUri: string;
  /** Scopes granted at login, so a scope change can force a re-login. */
  scope: string;
  session: StoredSession;
}

interface CredentialFile {
  version: 1;
  accounts: Record<string, SavedSession>;
  /** DID of the account commands use when none is named. */
  current?: string;
}

/**
 * A fresh empty file each call — not a shared constant. Spreading a module-level
 * object copies the reference to its nested `accounts`, so callers would mutate
 * each other's "empty" state and sessions would leak between reads.
 */
function emptyFile(): CredentialFile {
  return { accounts: {}, version: 1 };
}

/** `$XDG_CONFIG_HOME/standard-reader`, falling back to `~/.config`. */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : join(homedir(), ".config");
  return join(base, "standard-reader");
}

export function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

async function readFileJson(path: string): Promise<CredentialFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as CredentialFile;
    if (parsed.version !== 1 || typeof parsed.accounts !== "object") {
      return emptyFile();
    }
    return parsed;
  } catch {
    // A missing or unreadable file means "not signed in", not a hard failure.
    return emptyFile();
  }
}

/**
 * Write the file with restrictive permissions, atomically.
 *
 * Written to a temp path and renamed so a crash mid-write cannot leave a
 * truncated credential file behind — the failure mode there is a session that
 * looks present but cannot refresh.
 */
async function writeFileJson(path: string, value: CredentialFile) {
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

export async function readSavedSessions(): Promise<CredentialFile> {
  return readFileJson(credentialsPath());
}

/** The saved session for `did`, or the current one when `did` is omitted. */
export async function readSavedSession(
  did?: string,
): Promise<SavedSession | null> {
  const file = await readSavedSessions();
  const key = did ?? file.current;
  if (!key) return null;
  return file.accounts[key] ?? null;
}

export async function saveSession(saved: SavedSession): Promise<void> {
  const file = await readSavedSessions();
  file.accounts[saved.did] = saved;
  file.current = saved.did;
  await writeFileJson(credentialsPath(), file);
}

/** Forget one account, or every account when `did` is omitted. */
export async function forgetSession(did?: string): Promise<Array<string>> {
  const file = await readSavedSessions();
  const removed = did ? [did] : Object.keys(file.accounts);
  if (removed.length === 0) return [];

  const kept = Object.fromEntries(
    Object.entries(file.accounts).filter(([key]) => !removed.includes(key)),
  );
  file.accounts = kept;
  if (file.current && !kept[file.current]) {
    file.current = Object.keys(kept)[0];
  }

  if (Object.keys(kept).length === 0) {
    await unlink(credentialsPath()).catch(() => {});
    return removed;
  }
  await writeFileJson(credentialsPath(), file);
  return removed;
}

// ---------------------------------------------------------------------------
// Stores handed to the OAuth client
// ---------------------------------------------------------------------------

/**
 * The session store the OAuth client writes through.
 *
 * The client owns the token set and rewrites it on every refresh, so this
 * persists straight back to the credential file. Everything else about the
 * account (handle, service, redirect URI) is filled in by `login`.
 */
export function fileSessionStore(context: {
  /** Filled in after the first save; lets a refresh keep the metadata intact. */
  describe: (did: Did) => Omit<SavedSession, "session"> | null;
}) {
  return {
    async get(did: Did): Promise<StoredSession | undefined> {
      const saved = await readSavedSession(did);
      return saved?.session;
    },
    async set(did: Did, session: StoredSession): Promise<void> {
      const existing = await readSavedSession(did);
      const described = context.describe(did);
      const meta = existing ?? described;
      if (!meta) return;
      await saveSession({ ...meta, did, session });
    },
    async del(did: Did): Promise<void> {
      await forgetSession(did);
    },
    async delete(did: Did): Promise<void> {
      await forgetSession(did);
    },
    async clear(): Promise<void> {
      await forgetSession();
    },
  };
}

/**
 * Authorization state lives only for the seconds between the browser opening
 * and the callback arriving, and only this process ever reads it — so memory
 * is both sufficient and the safer place for a PKCE verifier.
 */
export function memoryStateStore() {
  const entries = new Map<string, StoredState>();
  return {
    get: (key: string) => entries.get(key),
    set: (key: string, value: StoredState) => {
      entries.set(key, value);
    },
    del: (key: string) => {
      entries.delete(key);
    },
    delete: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}
