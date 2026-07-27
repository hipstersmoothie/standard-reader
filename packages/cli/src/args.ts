/** A small argv parser — the CLI has few enough flags not to need a dependency. */

export interface ParsedArgs {
  command: string | null;
  /** Repeatable flags collect; single flags keep the last value. */
  values: Map<string, Array<string>>;
  flags: Set<string>;
  positionals: Array<string>;
}

export class ArgError extends Error {}

/** Flags that take a value; everything else is boolean. */
const VALUE_FLAGS = new Set([
  "to",
  "from",
  "rkey",
  "limit",
  "out",
  "backup-dir",
  "identifier",
  "password",
  "did",
  "pds",
  "repo",
]);

const ALIASES: Record<string, string> = {
  f: "from",
  h: "help",
  n: "dry-run",
  t: "to",
  y: "yes",
};

export function parseArgs(argv: Array<string>): ParsedArgs {
  const values = new Map<string, Array<string>>();
  const flags = new Set<string>();
  const positionals: Array<string> = [];
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("-")) {
      if (command === null) command = token;
      else positionals.push(token);
      continue;
    }

    const bare = token.replace(/^--?/, "");
    const eq = bare.indexOf("=");
    const rawName = eq === -1 ? bare : bare.slice(0, eq);
    const name = ALIASES[rawName] ?? rawName;

    if (VALUE_FLAGS.has(name)) {
      const value = eq === -1 ? argv[++index] : bare.slice(eq + 1);
      if (value === undefined) throw new ArgError(`--${name} needs a value`);
      const existing = values.get(name) ?? [];
      existing.push(value);
      values.set(name, existing);
      continue;
    }

    if (eq !== -1) throw new ArgError(`--${name} does not take a value`);
    flags.add(name);
  }

  return { command, flags, positionals, values };
}

export function one(args: ParsedArgs, name: string): string | undefined {
  return args.values.get(name)?.at(-1);
}

export function many(args: ParsedArgs, name: string): Array<string> {
  return args.values.get(name) ?? [];
}

export function integer(args: ParsedArgs, name: string): number | undefined {
  const raw = one(args, name);
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ArgError(`--${name} must be a positive whole number`);
  }
  return value;
}
