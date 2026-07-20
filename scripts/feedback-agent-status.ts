/**
 * Move a feedback discussion to a new status.
 *
 * Run by `.github/workflows/feedback-agent-status.yml` on pull-request events:
 * a PR opening from `claude/feedback-<rkey>` moves that discussion to
 * `in-progress`, and merging it moves the discussion to `implemented`. The
 * status shows up on the userinput.app board and on `/feedback`.
 *
 *   pnpm feedback:status --branch claude/feedback-3mqzgd655iq2s --state in-progress
 *   pnpm feedback:status --uri at://did:plc:…/app.userinput.discussion/… --state implemented
 *
 * Env:
 *   USERINPUT_OWNER_IDENTIFIER    space-owner handle (standard-reader.app)
 *   USERINPUT_OWNER_APP_PASSWORD  its Bluesky app password
 *   USERINPUT_OWNER_PDS_URL       optional; defaults to the space owner's PDS
 *   DRY_RUN                       "1" to resolve and log without writing
 */

import type { FeedbackStatus } from "#/lib/userinput/space";
import {
  loginAsSpaceOwner,
  resolveDiscussionByRkey,
  setDiscussionStatus,
} from "#/server/userinput/status.server";

const BRANCH_PREFIX = "claude/feedback-";
const DRY_RUN = process.env.DRY_RUN === "1";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const state = arg("state") as FeedbackStatus | undefined;
  const branch = arg("branch");
  const uriArg = arg("uri");

  if (!state) {
    throw new Error("[feedback-status] --state is required");
  }
  if (!branch && !uriArg) {
    throw new Error("[feedback-status] one of --branch or --uri is required");
  }

  // Derive the rkey. A branch we didn't create is not an error — the workflow
  // filters on the prefix, but returning quietly keeps a stray PR from failing CI.
  let rkey: string | undefined;
  if (uriArg) {
    rkey = uriArg.split("/").pop();
  } else if (branch?.startsWith(BRANCH_PREFIX)) {
    rkey = branch.slice(BRANCH_PREFIX.length);
  } else {
    console.info(
      `[feedback-status] ${branch} is not a feedback branch; skipping`,
    );
    return;
  }

  if (!rkey) {
    throw new Error("[feedback-status] could not derive a record key");
  }

  const subject = await resolveDiscussionByRkey(rkey);
  if (!subject) {
    // The discussion may have been deleted, or constellation may be lagging.
    // Don't fail the PR over it.
    console.warn(
      `[feedback-status] no discussion found for rkey ${rkey}; nothing to update`,
    );
    return;
  }

  if (DRY_RUN) {
    console.info(
      `[feedback-status] would set ${subject.uri} → ${state} (dry run)`,
    );
    return;
  }

  const session = await loginAsSpaceOwner();
  await setDiscussionStatus(session, subject, state);
  console.info(`[feedback-status] set ${subject.uri} → ${state}`);
}

await main();
