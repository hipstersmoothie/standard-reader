/**
 * `standard-reader list` — what is in the repo and what a conversion would
 * cost, without writing anything.
 *
 * This is the command to run first. `convert --dry-run` does the same work but
 * frames it as a run that did not happen; this frames it as an inventory.
 */

import {
  convertDocumentContent,
  isConversionTarget,
  summarizeIssues,
  TARGET_LABEL,
} from "@standard-reader/converter";
import type { ConversionTarget } from "@standard-reader/converter";

import type { ParsedArgs } from "../args.js";
import { ArgError, integer, one } from "../args.js";
import type { DocumentRecord } from "../atproto.js";
import {
  listDocuments,
  login,
  resolveContent,
  resolveCredentials,
} from "../atproto.js";
import { pluralize, say, style } from "../output.js";

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

export async function runList(args: ParsedArgs): Promise<number> {
  const rawTarget = one(args, "to");
  if (rawTarget && !isConversionTarget(rawTarget)) {
    throw new ArgError(
      `Unknown target format "${rawTarget}". Choose one of: leaflet, offprint, pckt, markpub.`,
    );
  }
  const to = rawTarget as ConversionTarget | undefined;
  const json = args.flags.has("json");
  const limit = integer(args, "limit");

  const session = await login(
    resolveCredentials({
      identifier: one(args, "identifier"),
      password: one(args, "password"),
      service: one(args, "pds"),
    }),
  );
  const repo = one(args, "repo") ?? session.did;

  const allDocuments = await listDocuments(session, repo);
  const documents = allDocuments.slice(0, limit ?? undefined);

  if (documents.length === 0) {
    if (!json) say("No site.standard.document records in this repo.");
    return 0;
  }

  const rows = [];
  for (const record of documents) {
    const format = contentFormatOf(record);
    const title =
      typeof record.value.title === "string" ? record.value.title : "";
    const row: Record<string, unknown> = {
      format,
      rkey: record.rkey,
      title: title || record.rkey,
      uri: record.uri,
    };

    if (to) {
      const content = await resolveContent(
        session,
        session.did,
        record.value.content,
      );
      const result = convertDocumentContent({
        authorDid: session.did,
        content,
        contentFormat: format,
        target: to,
      });
      row.conversion = {
        blockCount: result.blockCount,
        convertible: result.content != null,
        issues: summarizeIssues(result.issues),
        lossless: result.lossless,
        unchanged: result.unchanged,
      };
    }
    rows.push(row);
  }

  if (json) {
    say(
      JSON.stringify(
        { did: session.did, documents: rows, target: to },
        null,
        2,
      ),
    );
    return 0;
  }

  say(
    `${style.bold(String(documents.length))} document${documents.length === 1 ? "" : "s"} in ${style.bold(session.handle)}`,
  );
  say();

  for (const row of rows) {
    const conversion = row.conversion as
      | {
          blockCount: number;
          convertible: boolean;
          issues: ReturnType<typeof summarizeIssues>;
          lossless: boolean;
          unchanged: boolean;
        }
      | undefined;

    say(`${style.bold(String(row.title))} ${style.dim(String(row.rkey))}`);
    say(`  ${style.dim(String(row.format ?? "no content format"))}`);

    if (!conversion) continue;

    if (conversion.unchanged) {
      say(`  ${style.dim(`already ${TARGET_LABEL[to as ConversionTarget]}`)}`);
    } else if (!conversion.convertible) {
      say(`  ${style.red("cannot be converted")}`);
    } else if (conversion.lossless) {
      say(
        `  ${style.green("converts cleanly")} ${style.dim(`(${pluralize(conversion.blockCount, "block")})`)}`,
      );
    } else {
      const dropped = conversion.issues
        .filter((issue) => issue.severity === "unsupported")
        .reduce((total, issue) => total + issue.count, 0);
      const changed = conversion.issues
        .filter((issue) => issue.severity === "lossy")
        .reduce((total, issue) => total + issue.count, 0);
      const parts = [
        dropped > 0
          ? style.red(`${pluralize(dropped, "block")} dropped`)
          : null,
        changed > 0 ? style.yellow(`${changed} changed`) : null,
      ].filter(Boolean);
      say(`  ${parts.join(style.dim(", "))}`);
    }
  }

  return 0;
}
