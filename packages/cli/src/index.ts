// Programmatic entry point for @standard-reader/cli. The `standard-reader`
// binary is a three-line wrapper around `runCli`; everything else here is
// exported so the pieces can be scripted directly.

export { runCli } from "./run.js";
export { parseArgs, ArgError } from "./args.js";
export type { ParsedArgs } from "./args.js";

export {
  CliError,
  listDocuments,
  login,
  putDocumentContent,
  resolveContent,
  resolveCredentials,
} from "./atproto.js";
export type { Credentials, DocumentRecord, Session } from "./atproto.js";

export { autoDecide, hasUnsupported } from "./policy.js";
export type { AutoDecision, Policy } from "./policy.js";
