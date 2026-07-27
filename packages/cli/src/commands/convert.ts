/**
 * `standard-reader convert` — rewrite the account's document records into
 * another content format.
 *
 * The shape of the run is: read every document from the repo, convert each one
 * in memory, show what the conversion costs, and only then write. Nothing is
 * written until its own warnings have been shown and accepted, and every
 * overwritten record is saved to disk first.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  convertDocumentContent,
  isConversionTarget,
  TARGET_CONTENT_TYPE,
  TARGET_LABEL,
} from "@standard-reader/converter";
import type {
  ConversionResult,
  ConversionTarget,
} from "@standard-reader/converter";

import type { ParsedArgs } from "../args.js";
import { ArgError, integer, many, one } from "../args.js";
import type { DocumentRecord, Session } from "../atproto.js";
import {
  describeError,
  listDocuments,
  login,
  putDocumentContent,
  resolveContent,
  resolveCredentials,
} from "../atproto.js";
import { pluralize, renderIssues, say, style } from "../output.js";
import type { AutoDecision, Policy } from "../policy.js";
import { autoDecide, hasUnsupported } from "../policy.js";
import type { Prompter } from "../prompt.js";
import { createPrompter, PROMPT_HELP } from "../prompt.js";

type Outcome =
  | "converted"
  | "skipped-unchanged"
  | "skipped-by-user"
  | "skipped-warnings"
  | "skipped-unconvertible"
  | "failed";

interface RecordReport {
  rkey: string;
  uri: string;
  title: string;
  sourceFormat: string | null;
  outcome: Outcome;
  result: ConversionResult;
  error?: string;
}

function titleOf(record: DocumentRecord): string {
  const title = record.value.title;
  return typeof title === "string" && title.trim() ? title.trim() : record.rkey;
}

function contentFormatOf(record: DocumentRecord): string | null {
  const content = record.value.content;
  if (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    typeof (content as Record<string, unknown>).$type === "string"
  ) {
    return (content as Record<string, unknown>).$type as string;
  }
  return null;
}

function target(args: ParsedArgs): ConversionTarget {
  const raw = one(args, "to");
  if (!raw) {
    throw new ArgError(
      "convert needs a target format: --to leaflet|offprint|pckt|markpub",
    );
  }
  if (!isConversionTarget(raw)) {
    throw new ArgError(
      `Unknown target format "${raw}". Choose one of: leaflet, offprint, pckt, markpub.`,
    );
  }
  return raw;
}

/** `--from` accepts either a target name or a full content `$type`. */
function sourceFilter(args: ParsedArgs): string | null {
  const raw = one(args, "from");
  if (!raw) return null;
  return isConversionTarget(raw) ? TARGET_CONTENT_TYPE[raw] : raw;
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(/[.:]/g, "-");
}

export async function runConvert(args: ParsedArgs): Promise<number> {
  const to = target(args);
  const from = sourceFilter(args);
  const only = new Set(many(args, "rkey"));
  const limit = integer(args, "limit");
  const dryRun = args.flags.has("dry-run");
  const json = args.flags.has("json");
  const outDir = one(args, "out");
  const backupsEnabled = !args.flags.has("no-backup") && !dryRun;

  const policy: Policy = {
    force: args.flags.has("force"),
    interactive:
      !args.flags.has("yes") &&
      !args.flags.has("force") &&
      !json &&
      process.stdin.isTTY === true,
    strict: args.flags.has("strict"),
  };

  const session = await login(
    resolveCredentials({
      identifier: one(args, "identifier"),
      password: one(args, "password"),
      service: one(args, "pds"),
    }),
  );
  const repo = one(args, "repo") ?? session.did;

  if (!json) {
    say(
      `${style.dim("Signed in as")} ${style.bold(session.handle)} ${style.dim(`(${session.did})`)}`,
    );
    say(`${style.dim("Converting to")} ${style.bold(TARGET_LABEL[to])}`);
    if (dryRun) say(style.yellow("Dry run — nothing will be written."));
    say();
  }

  const documents = await listDocuments(session, repo);
  const selected = documents
    .filter((record) => only.size === 0 || only.has(record.rkey))
    .filter((record) => !from || contentFormatOf(record) === from)
    .slice(0, limit ?? documents.length);

  if (selected.length === 0) {
    if (!json) say("No matching documents found.");
    return 0;
  }

  const backupDir = backupsEnabled
    ? (one(args, "backup-dir") ??
      join(process.cwd(), `standard-reader-backup-${timestampSlug()}`))
    : null;

  const prompter = policy.interactive ? createPrompter() : null;
  const reports: Array<RecordReport> = [];
  let bulk: "convert-all" | "skip-all" | null = null;

  try {
    for (const record of selected) {
      const report = await handleRecord({
        backupDir,
        bulk,
        dryRun,
        json,
        outDir,
        policy,
        prompter,
        record,
        repo,
        session,
        to,
      });
      if (report.bulk !== undefined) bulk = report.bulk;
      if (report.quit) {
        reports.push(report.report);
        if (!json) say(style.dim("\nStopped at your request."));
        break;
      }
      reports.push(report.report);
    }
  } finally {
    prompter?.close();
  }

  if (json) {
    say(
      JSON.stringify(
        {
          did: session.did,
          documents: reports.map((entry) => ({
            blockCount: entry.result.blockCount,
            issues: entry.result.issues,
            outcome: entry.outcome,
            rkey: entry.rkey,
            sourceFormat: entry.sourceFormat,
            title: entry.title,
            uri: entry.uri,
            ...(entry.error === undefined ? {} : { error: entry.error }),
          })),
          dryRun,
          target: to,
        },
        null,
        2,
      ),
    );
  } else {
    printSummary(reports, { backupDir, dryRun });
  }

  return reports.some((entry) => entry.outcome === "failed") ? 1 : 0;
}

interface HandleInput {
  session: Session;
  repo: string;
  record: DocumentRecord;
  to: ConversionTarget;
  policy: Policy;
  prompter: Prompter | null;
  bulk: "convert-all" | "skip-all" | null;
  dryRun: boolean;
  json: boolean;
  outDir: string | undefined;
  backupDir: string | null;
}

async function handleRecord(input: HandleInput): Promise<{
  report: RecordReport;
  bulk?: "convert-all" | "skip-all" | null;
  quit?: boolean;
}> {
  const { json, record, session, to } = input;
  const title = titleOf(record);
  const sourceFormat = contentFormatOf(record);

  const content = await resolveContent(
    session,
    session.did,
    record.value.content,
  );
  const result = convertDocumentContent({
    authorDid: session.did,
    content,
    contentFormat: sourceFormat,
    target: to,
  });

  const base = {
    result,
    rkey: record.rkey,
    sourceFormat,
    title,
    uri: record.uri,
  };

  if (result.unchanged) {
    if (!json) {
      say(
        `${style.dim("·")} ${title} ${style.dim(`— already ${TARGET_LABEL[to]}`)}`,
      );
    }
    return { report: { ...base, outcome: "skipped-unchanged" } };
  }

  if (!result.content) {
    if (!json) {
      say(`${style.red("✗")} ${style.bold(title)} ${style.dim(record.rkey)}`);
      for (const line of renderIssues(result.issues)) say(line);
    }
    return { report: { ...base, outcome: "skipped-unconvertible" } };
  }

  let decision: AutoDecision = autoDecide(result, input.policy);
  if (input.bulk === "convert-all") decision = "convert";
  if (input.bulk === "skip-all") decision = "skip";

  let bulk = input.bulk;

  if (decision === "ask" && input.prompter) {
    const answer = await askAbout(input.prompter, {
      record,
      result,
      title,
      to,
    });
    if (answer === "quit") {
      return {
        bulk,
        quit: true,
        report: { ...base, outcome: "skipped-by-user" },
      };
    }
    if (answer === "convert-all") {
      bulk = "convert-all";
      decision = "convert";
    } else if (answer === "skip-all") {
      bulk = "skip-all";
      decision = "skip";
    } else {
      decision = answer;
    }
  } else if (decision === "ask") {
    // No prompter available after all — fall back to the safe answer.
    decision = hasUnsupported(result) ? "skip" : "convert";
  }

  if (decision === "skip") {
    if (!json) {
      say(
        `${style.yellow("↷")} ${style.bold(title)} ${style.dim("— left unchanged")}`,
      );
    }
    return {
      bulk,
      report: {
        ...base,
        outcome: hasUnsupported(result)
          ? "skipped-warnings"
          : "skipped-by-user",
      },
    };
  }

  // Write the converted content to disk before touching the repo, so a run can
  // be inspected (or replayed) even when the PDS write is what goes wrong.
  if (input.outDir) {
    await writeJson(
      join(input.outDir, `${record.rkey}.${to}.json`),
      result.content,
    );
  }

  if (input.dryRun) {
    if (!json) {
      say(
        `${style.cyan("→")} ${style.bold(title)} ${style.dim("— would convert")}`,
      );
      for (const line of renderIssues(result.issues)) say(line);
    }
    return { bulk, report: { ...base, outcome: "converted" } };
  }

  if (input.backupDir) {
    await writeJson(join(input.backupDir, `${record.rkey}.json`), {
      cid: record.cid,
      uri: record.uri,
      value: record.value,
    });
  }

  try {
    await putDocumentContent(session, {
      content: result.content,
      record: record.value,
      repo: input.repo,
      rkey: record.rkey,
      swapRecord: record.cid,
    });
  } catch (error) {
    const message = describeError(error);
    if (!json) {
      say(
        `${style.red("✗")} ${style.bold(title)} ${style.dim("— write failed")}`,
      );
      say(`    ${message}`);
    }
    return { bulk, report: { ...base, error: message, outcome: "failed" } };
  }

  if (!json) {
    say(`${style.green("✓")} ${style.bold(title)} ${style.dim("— converted")}`);
    for (const line of renderIssues(result.issues)) say(line);
  }
  return { bulk, report: { ...base, outcome: "converted" } };
}

async function askAbout(
  prompter: Prompter,
  input: {
    record: DocumentRecord;
    result: ConversionResult;
    title: string;
    to: ConversionTarget;
  },
): Promise<"convert" | "skip" | "convert-all" | "skip-all" | "quit"> {
  const { result, title } = input;
  const dropped = result.issues.filter(
    (issue) => issue.severity === "unsupported",
  ).length;

  say();
  say(`${style.bold(title)} ${style.dim(input.record.rkey)}`);
  say(
    `  ${style.dim(`${result.sourceFormat ?? "unknown"} → ${TARGET_LABEL[input.to]}, ${pluralize(result.blockCount, "block")}`)}`,
  );
  for (const line of renderIssues(result.issues)) say(line);

  const headline =
    dropped > 0
      ? style.red(
          `  ${pluralize(dropped, "block")} will be lost if you convert this record.`,
        )
      : style.yellow("  Nothing is lost, but some formatting changes.");
  say(headline);

  for (;;) {
    const answer = await prompter.ask(
      `  Convert it? ${style.dim("[y/N/d/a/s/q]")} `,
    );
    if (answer === "details") {
      say(`  ${style.dim(JSON.stringify(result.issues, null, 2))}`);
      say(`  ${PROMPT_HELP}`);
      continue;
    }
    return answer;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function printSummary(
  reports: Array<RecordReport>,
  context: { backupDir: string | null; dryRun: boolean },
): void {
  const count = (outcome: Outcome) =>
    reports.filter((entry) => entry.outcome === outcome).length;

  const converted = count("converted");
  const failed = count("failed");
  const unchanged = count("skipped-unchanged");
  const skipped =
    count("skipped-by-user") +
    count("skipped-warnings") +
    count("skipped-unconvertible");

  say();
  say(style.bold("Summary"));
  say(
    `  ${context.dryRun ? "would convert" : "converted"}: ${style.green(String(converted))}`,
  );
  if (skipped > 0) say(`  left unchanged: ${style.yellow(String(skipped))}`);
  if (unchanged > 0) say(`  already in target format: ${unchanged}`);
  if (failed > 0) say(`  failed: ${style.red(String(failed))}`);
  if (context.backupDir && converted > 0) {
    say(`  originals saved to: ${style.dim(context.backupDir)}`);
  }

  const skippedRecords = reports.filter(
    (entry) =>
      entry.outcome === "skipped-warnings" ||
      entry.outcome === "skipped-unconvertible",
  );
  if (skippedRecords.length > 0) {
    say();
    say(
      style.dim(
        "These records were left alone because content would have been lost:",
      ),
    );
    for (const entry of skippedRecords) {
      say(`  ${entry.rkey}  ${entry.title}`);
    }
    say(
      style.dim(
        "Re-run with --rkey <rkey> to revisit one, or --force to convert anyway.",
      ),
    );
  }
}
