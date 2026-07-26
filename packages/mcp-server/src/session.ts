import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PasswordSessionData } from "@atcute/password-session";
import { PasswordSession } from "@atcute/password-session";

import type { McpServerConfig } from "./config.js";
import { AuthRequiredError } from "./errors.js";

/**
 * Persisted session file. Versioned so a future credential type (OAuth) can be
 * added without mis-reading an older file.
 */
interface SessionFile {
  version: 1;
  session: PasswordSessionData;
}

function isSessionData(value: unknown): value is PasswordSessionData {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Partial<PasswordSessionData>;
  return (
    typeof data.did === "string" &&
    typeof data.accessJwt === "string" &&
    typeof data.refreshJwt === "string" &&
    typeof data.service === "string"
  );
}

/**
 * Loads, persists, and refreshes the AT Protocol session the MCP server acts
 * with.
 *
 * Credentials are AT Protocol **app passwords** (never the account password).
 * The AppView validates them the standard way — it forwards the access token to
 * `com.atproto.server.getSession` on the issuer PDS — which is why an app
 * password, not an OAuth token, is the credential a local MCP server can use:
 * an OAuth access token is DPoP-bound and cannot be validated by a third party
 * that only holds the bearer string.
 */
export class SessionManager {
  readonly #config: McpServerConfig;
  #session: PasswordSession | null = null;
  #pending: Promise<PasswordSession> | null = null;

  constructor(config: McpServerConfig) {
    this.#config = config;
  }

  /** Read the persisted session, or `null` when there is none / it is corrupt. */
  async read(): Promise<PasswordSessionData | null> {
    let raw: string;
    try {
      raw = await readFile(this.#config.sessionFile, "utf8");
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SessionFile>;
      if (parsed.version !== 1 || !isSessionData(parsed.session)) return null;
      return parsed.session;
    } catch {
      return null;
    }
  }

  /**
   * Persist a session. Written via a `0600` temp file + rename so the tokens
   * are never world-readable and a crash mid-write can't truncate the file.
   */
  async write(data: PasswordSessionData): Promise<void> {
    const file = this.#config.sessionFile;
    const directory = dirname(file);
    await mkdir(directory, { mode: 0o700, recursive: true });
    const temporary = join(
      directory,
      `.session.${process.pid}.${Date.now()}.tmp`,
    );
    const body: SessionFile = { version: 1, session: data };
    await writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, file);
  }

  /** Remove the persisted session file. */
  async erase(): Promise<void> {
    await rm(this.#config.sessionFile, { force: true });
  }

  #options() {
    return {
      onUpdate: async (data: PasswordSessionData) => {
        await this.write(data);
      },
      onDelete: async () => {
        this.#session = null;
        await this.erase();
      },
    };
  }

  /**
   * Sign in with an app password and persist the resulting session.
   *
   * @param credentials handle/DID/email plus an app password, and optionally the
   *   PDS to authenticate against and a 2FA code
   */
  async login(credentials: {
    identifier: string;
    password: string;
    service?: string | undefined;
    code?: string | undefined;
  }): Promise<PasswordSession> {
    const session = await PasswordSession.login(
      {
        service: credentials.service ?? this.#config.pdsService,
        identifier: credentials.identifier.replace(/^@/, "").trim(),
        password: credentials.password,
        ...(credentials.code ? { code: credentials.code } : {}),
      },
      this.#options(),
    );
    await this.write(session.session);
    this.#session = session;
    return session;
  }

  /** Sign out server-side and drop the persisted session. */
  async logout(): Promise<boolean> {
    const session = this.#session ?? (await this.#restore());
    this.#session = null;
    if (!session) {
      await this.erase();
      return false;
    }
    try {
      await session.logout();
    } finally {
      await this.erase();
    }
    return true;
  }

  async #restore(): Promise<PasswordSession | null> {
    const stored = await this.read();
    if (!stored) return null;
    try {
      return await PasswordSession.resume(stored, this.#options());
    } catch {
      // Definitively invalid (revoked app password, deactivated account). Drop
      // it so the next call falls through to env credentials or a clear error.
      await this.erase();
      return null;
    }
  }

  /**
   * The current session, resuming from disk or signing in with env credentials
   * as needed. Concurrent callers share one in-flight sign-in.
   */
  async current(): Promise<PasswordSession | null> {
    if (this.#session && !this.#session.destroyed) return this.#session;
    if (this.#pending) return this.#pending;

    const pending = (async (): Promise<PasswordSession> => {
      const restored = await this.#restore();
      if (restored) return restored;

      const { identifier, password } = this.#config;
      if (!identifier || !password) {
        throw new AuthRequiredError(
          'Not signed in. Run the `auth` tool with action "login" (or set ' +
            "STANDARD_READER_IDENTIFIER and STANDARD_READER_APP_PASSWORD).",
        );
      }
      return await this.login({ identifier, password });
    })();

    this.#pending = pending;
    try {
      const session = await pending;
      this.#session = session;
      return session;
    } catch (error) {
      if (error instanceof AuthRequiredError) return null;
      throw error;
    } finally {
      this.#pending = null;
    }
  }

  /** The current session, or a thrown {@link AuthRequiredError}. */
  async require(): Promise<PasswordSession> {
    const session = await this.current();
    if (!session) {
      throw new AuthRequiredError(
        "This action needs a signed-in reader. Run the `auth` tool with " +
          'action "login".',
      );
    }
    return session;
  }
}
