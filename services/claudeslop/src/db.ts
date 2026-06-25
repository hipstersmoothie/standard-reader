/**
 * SQLite store: the signed-label log plus a couple of cursors.
 *
 * The `labels` table is an append-only log. Its autoincrementing `seq` is the
 * cursor that `com.atproto.label.subscribeLabels` streams against, so it must
 * be monotonic and never reused — exactly what `INTEGER PRIMARY KEY
 * AUTOINCREMENT` gives us.
 */

import Database from "better-sqlite3";

/** An unsigned label — the fields that get dag-cbor encoded and signed. */
export interface UnsignedLabel {
  ver: number;
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg?: boolean;
  cts: string;
  exp?: string;
}

/** A signed label, as stored and served. */
export interface SignedLabel extends UnsignedLabel {
  sig: Uint8Array;
}

/** A stored label with its stream sequence number. */
export interface StoredLabel extends SignedLabel {
  seq: number;
}

export interface QueryLabelsParams {
  uriPatterns: string[];
  sources?: string[];
  limit?: number;
  /** Pagination cursor (a stringified `seq`). */
  cursor?: string;
}

interface LabelRow {
  seq: number;
  src: string;
  uri: string;
  cid: string | null;
  val: string;
  neg: number;
  cts: string;
  exp: string | null;
  sig: Buffer;
  ver: number;
}

export type LabelerDb = ReturnType<typeof openDb>;

export function openDb(path: string) {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS labels (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      src TEXT NOT NULL,
      uri TEXT NOT NULL,
      cid TEXT,
      val TEXT NOT NULL,
      neg INTEGER NOT NULL DEFAULT 0,
      cts TEXT NOT NULL,
      exp TEXT,
      sig BLOB NOT NULL,
      ver INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS labels_uri_idx ON labels (uri);
    CREATE INDEX IF NOT EXISTS labels_src_idx ON labels (src);

    -- Named cursors (e.g. the Jetstream position we've consumed up to).
    CREATE TABLE IF NOT EXISTS cursors (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Per-document watermark so we don't re-score the same record version, and
    -- so we can emit a negation when a re-score flips the verdict.
    CREATE TABLE IF NOT EXISTS scanned (
      uri TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      labeled INTEGER NOT NULL
    );
  `);
  return db;
}

function rowToLabel(row: LabelRow): StoredLabel {
  const label: StoredLabel = {
    seq: row.seq,
    ver: row.ver,
    src: row.src,
    uri: row.uri,
    val: row.val,
    cts: row.cts,
    sig: new Uint8Array(row.sig),
  };
  if (row.cid) label.cid = row.cid;
  if (row.exp) label.exp = row.exp;
  if (row.neg) label.neg = true;
  return label;
}

/** Append a signed label to the log. Returns its assigned `seq`. */
export function insertLabel(db: LabelerDb, label: SignedLabel): number {
  const info = db
    .prepare(
      `INSERT INTO labels (src, uri, cid, val, neg, cts, exp, sig, ver)
       VALUES (@src, @uri, @cid, @val, @neg, @cts, @exp, @sig, @ver)`,
    )
    .run({
      src: label.src,
      uri: label.uri,
      cid: label.cid ?? null,
      val: label.val,
      neg: label.neg ? 1 : 0,
      cts: label.cts,
      exp: label.exp ?? null,
      sig: Buffer.from(label.sig),
      ver: label.ver,
    });
  return Number(info.lastInsertRowid);
}

/**
 * `com.atproto.label.queryLabels` backing query. Matches `uriPatterns` (exact,
 * or a trailing `*` prefix, or `*` for everything), optionally filtered by
 * `sources`, paginated by `seq`.
 */
export function queryLabels(
  db: LabelerDb,
  params: QueryLabelsParams,
): { labels: StoredLabel[]; cursor?: string } {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 250);
  const where: string[] = [];
  const args: unknown[] = [];

  const patterns = params.uriPatterns ?? [];
  const matchAll = patterns.length === 0 || patterns.includes("*");
  if (!matchAll) {
    const ors: string[] = [];
    for (const p of patterns) {
      if (p.endsWith("*")) {
        ors.push("uri LIKE ? ESCAPE '\\'");
        args.push(p.slice(0, -1).replace(/[%_\\]/g, "\\$&") + "%");
      } else {
        ors.push("uri = ?");
        args.push(p);
      }
    }
    where.push(`(${ors.join(" OR ")})`);
  }

  if (params.sources && params.sources.length > 0) {
    where.push(`src IN (${params.sources.map(() => "?").join(", ")})`);
    args.push(...params.sources);
  }

  if (params.cursor) {
    where.push("seq > ?");
    args.push(Number(params.cursor));
  }

  const sql = `SELECT * FROM labels${
    where.length ? ` WHERE ${where.join(" AND ")}` : ""
  } ORDER BY seq ASC LIMIT ?`;
  args.push(limit);

  const rows = db.prepare(sql).all(...args) as LabelRow[];
  const labels = rows.map(rowToLabel);
  const cursor =
    labels.length === limit
      ? String(labels[labels.length - 1]!.seq)
      : undefined;
  return { labels, cursor };
}

/** Labels with `seq` strictly greater than `afterSeq` — for the WS stream. */
export function labelsAfter(
  db: LabelerDb,
  afterSeq: number,
  limit = 500,
): StoredLabel[] {
  const rows = db
    .prepare("SELECT * FROM labels WHERE seq > ? ORDER BY seq ASC LIMIT ?")
    .all(afterSeq, limit) as LabelRow[];
  return rows.map(rowToLabel);
}

/** The highest `seq` currently in the log (0 if empty). */
export function latestSeq(db: LabelerDb): number {
  const row = db.prepare("SELECT MAX(seq) AS m FROM labels").get() as {
    m: number | null;
  };
  return row.m ?? 0;
}

export function getCursor(db: LabelerDb, name: string): string | null {
  const row = db.prepare("SELECT value FROM cursors WHERE name = ?").get(name) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setCursor(db: LabelerDb, name: string, value: string): void {
  db.prepare(
    `INSERT INTO cursors (name, value) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
  ).run(name, value);
}

export interface ScanState {
  version: number;
  labeled: boolean;
}

export function getScanState(db: LabelerDb, uri: string): ScanState | null {
  const row = db
    .prepare("SELECT version, labeled FROM scanned WHERE uri = ?")
    .get(uri) as { version: number; labeled: number } | undefined;
  return row ? { version: row.version, labeled: !!row.labeled } : null;
}

export function setScanState(
  db: LabelerDb,
  uri: string,
  state: ScanState,
): void {
  db.prepare(
    `INSERT INTO scanned (uri, version, labeled) VALUES (?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET version = excluded.version, labeled = excluded.labeled`,
  ).run(uri, state.version, state.labeled ? 1 : 0);
}
