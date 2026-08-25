import { eq, inArray, sql } from "drizzle-orm";

import { chunk } from "#/lib/concurrency";
import { logEvent } from "#/server/observability/log";

import { db } from "../../db/index.ts";
import { topics, topicPublications, topicTags } from "../../db/schema.ts";
import {
  CARRY_FORWARD_MAX_COVERAGE,
  ENTRY_BAR,
  INSERT_CHUNK,
  groupMemberships,
  liveVocabularyTags,
  membershipShape,
  selectMemberships,
} from "./recompute-topics.ts";
import { clearsEntryBar, tagSetCoverage } from "./topic-succession.ts";

/**
 * One-off repair for topics unlisted before the sweep learned to carry them.
 *
 * Until `carryForwardCandidates` existed, a published topic was unlisted
 * whenever no freshly derived cluster resembled it — which conflated "the
 * clustering reshuffled" with "this topic is over". That took real areas off
 * the site: measured on the corpus at the time of writing, 129 unlisted topics
 * still clear the *entry* bar today, and 99 of them are not duplicates of
 * anything live. The Open Social Web (403 publications, 361 authors) was one of
 * them, dead-ending at the index.
 *
 * The sweep's fix is forward-only by construction — it looks at what is
 * currently published, and an unlisted topic's `topic_tags` rows were deleted
 * when it went. So the damage already done needs this separate, deliberate
 * pass, which is why it is a script you run once and not sweep behaviour.
 *
 * **What is lost, and cannot be recovered.** Only `signature_tags` survives an
 * unpublish — at most {@link SIGNATURE_SIZE} tags, with no weights. A topic
 * that had 65 members comes back with 24, and the weights are synthesised from
 * signature *rank* (see {@link signatureWeights}). Both heal the next time the
 * topic genuinely re-derives; until then a repaired topic is a narrower,
 * rank-ordered version of what it was. That is worth it against a 404, and it
 * is the reason the pass applies the strict entry bar rather than the
 * retention bar: a topic coming back from the dead should have to qualify on
 * the same terms as a brand-new one.
 */

/** A topic considered for republication, measured against today's corpus. */
export interface RepairCandidate {
  slug: string;
  name: string;
  /** Signature tags still in the vocabulary, best first. */
  tags: Array<string>;
  publications: Array<{ uri: string; score: number; matchedTagCount: number }>;
  authorCount: number;
  topAuthorShare: number;
  documentCount: number;
}

/** Why a candidate was left dead, for the dry run's report. */
export type RepairRejection =
  | "no-live-tags"
  | "below-entry-bar"
  | "duplicate-of-live-topic"
  | "duplicate-of-repaired-topic"
  | "duplicate-name-of-live-topic"
  | "duplicate-name-of-repaired-topic";

/** A published topic the repair must not duplicate. */
export interface LiveTopic {
  slug: string;
  name: string;
  tags: Array<string>;
}

/** Display names compare case- and space-insensitively. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface RepairPlan {
  /** Topics to republish, best first. */
  restore: Array<RepairCandidate>;
  /** Everything considered and passed over, with the reason. */
  rejected: Array<{
    slug: string;
    name: string;
    reason: RepairRejection;
    /** The live or already-accepted topic that covers it, when that is why. */
    coveredBy?: string;
    authorCount: number;
    publicationCount: number;
  }>;
  /** Unpublished rows examined. */
  considered: number;
}

/**
 * Weights for a restored tag list, synthesised from signature order.
 *
 * `signature_tags` is a plain ordered array: it preserves which tag was most
 * central but not by how much. A linear ramp from 1 down to 1/n keeps that
 * ordering — which is all the chips and the best-fit ranking actually read —
 * without inventing precision the array never carried. Real co-occurrence
 * weights come back the next time the topic re-derives.
 */
function signatureWeights(
  tags: ReadonlyArray<string>,
): Array<{ tag: string; weight: number }> {
  return tags.map((tag, index) => ({
    tag,
    weight: (tags.length - index) / tags.length,
  }));
}

/**
 * Choose which candidates to republish, rejecting anything already covered.
 *
 * Two dedupe passes, both containment rather than Jaccard for the reason given
 * on `tagSetCoverage`, and both necessary:
 *
 * - **Against live topics** — otherwise the pass resurrects a second copy of an
 *   area that is already on the site under a different slug.
 * - **Against each other** — the unlisted set is a sediment of every shape the
 *   clustering has ever produced for an area, so it contains its own
 *   duplicates. `books-and-reading` (176 authors) and `books-and-reading-2`
 *   (94) both qualify independently; only the first should come back.
 *
 * Containment alone is not enough, so **display name** is a third test. The
 * dry run caught six pairs that overlap just under the threshold and are
 * plainly the same area — two "Books and Reading", three "Live Music and
 * Festivals", two "TV and Streaming" — plus eight more colliding with a
 * published topic: 21 duplicates that tag overlap waved through. Names are
 * model-written from the signature, so two rows carrying the same one is the
 * namer stating that the tags describe the same subject, which is exactly the
 * judgement containment is too blunt to make at the margin.
 *
 * Candidates are considered by reach, widest first, so when two overlap it is
 * the one with more writers behind it that survives. Ties break on slug so the
 * plan is identical run to run — a dry run has to predict the apply exactly.
 *
 * Pure: the caller supplies the live topics, so this is testable without a
 * database.
 */
export function selectRepairTargets(
  candidates: ReadonlyArray<RepairCandidate>,
  liveTopics: ReadonlyArray<LiveTopic>,
  maxCoverage: number,
): {
  restore: Array<RepairCandidate>;
  rejected: Array<{
    candidate: RepairCandidate;
    reason: RepairRejection;
    coveredBy: string;
  }>;
} {
  const ordered = [...candidates].toSorted(
    (left, right) =>
      right.authorCount - left.authorCount ||
      right.publications.length - left.publications.length ||
      (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0),
  );

  const restore: Array<RepairCandidate> = [];
  const rejected: Array<{
    candidate: RepairCandidate;
    reason: RepairRejection;
    coveredBy: string;
  }> = [];

  const liveByName = new Map(
    liveTopics.map((topic) => [nameKey(topic.name), topic.slug]),
  );
  const restoredByName = new Map<string, string>();

  for (const candidate of ordered) {
    const key = nameKey(candidate.name);

    const liveName = liveByName.get(key);
    if (liveName) {
      rejected.push({
        candidate,
        reason: "duplicate-name-of-live-topic",
        coveredBy: liveName,
      });
      continue;
    }

    const restoredName = restoredByName.get(key);
    if (restoredName) {
      rejected.push({
        candidate,
        reason: "duplicate-name-of-repaired-topic",
        coveredBy: restoredName,
      });
      continue;
    }

    const live = liveTopics.find(
      (topic) => tagSetCoverage(candidate.tags, topic.tags) >= maxCoverage,
    );
    if (live) {
      rejected.push({
        candidate,
        reason: "duplicate-of-live-topic",
        coveredBy: live.slug,
      });
      continue;
    }

    const twin = restore.find(
      (accepted) =>
        tagSetCoverage(candidate.tags, accepted.tags) >= maxCoverage,
    );
    if (twin) {
      rejected.push({
        candidate,
        reason: "duplicate-of-repaired-topic",
        coveredBy: twin.slug,
      });
      continue;
    }

    restore.push(candidate);
    restoredByName.set(key, candidate.slug);
  }

  return { restore, rejected };
}

/**
 * Work out what the repair would do, touching nothing.
 *
 * The membership query is the expensive one (~32s, and its cost is the corpus
 * scan rather than the number of clusters asked about), so every unlisted
 * topic with live tags goes into a single call.
 */
export async function planTopicRepair(): Promise<RepairPlan> {
  const unpublished = await db
    .select({
      slug: topics.slug,
      name: topics.name,
      signatureTags: topics.signatureTags,
    })
    .from(topics)
    .where(eq(topics.published, false));

  const live = await liveVocabularyTags(
    unpublished.flatMap((topic) => topic.signatureTags),
  );

  const rejected: RepairPlan["rejected"] = [];
  const withTags = unpublished
    .map((topic) => ({
      ...topic,
      tags: topic.signatureTags.filter((tag) => live.has(tag)),
    }))
    .filter((topic) => {
      if (topic.tags.length > 0) return true;
      // Every tag it was built from has left the vocabulary. This is a topic
      // that genuinely died, and the repair must not argue with that.
      rejected.push({
        slug: topic.slug,
        name: topic.name,
        reason: "no-live-tags",
        authorCount: 0,
        publicationCount: 0,
      });
      return false;
    });

  const groups = groupMemberships(
    await selectMemberships(
      withTags.map((topic) => ({
        key: topic.slug,
        tags: signatureWeights(topic.tags),
      })),
    ),
  );

  const candidates: Array<RepairCandidate> = [];
  for (const topic of withTags) {
    const { authorCount, documentCount, publications, topAuthorShare } =
      membershipShape(groups.get(topic.slug));

    // The strict entry bar, not the retention bar: see the note at the top.
    // Shared with the sweep, so a topic the sweep would publish today is
    // exactly the topic the repair brings back — including via the reach
    // waiver, which is what lets the short-but-widely-written subjects return.
    const qualifies = clearsEntryBar(
      {
        authorCount,
        publicationCount: publications.length,
        tagCount: topic.tags.length,
        topAuthorShare,
      },
      ENTRY_BAR,
    );

    if (!qualifies) {
      rejected.push({
        slug: topic.slug,
        name: topic.name,
        reason: "below-entry-bar",
        authorCount,
        publicationCount: publications.length,
      });
      continue;
    }

    candidates.push({
      slug: topic.slug,
      name: topic.name,
      tags: topic.tags,
      publications,
      authorCount,
      topAuthorShare,
      documentCount,
    });
  }

  const selected = selectRepairTargets(
    candidates,
    await selectLiveTopics(),
    CARRY_FORWARD_MAX_COVERAGE,
  );

  for (const entry of selected.rejected) {
    rejected.push({
      slug: entry.candidate.slug,
      name: entry.candidate.name,
      reason: entry.reason,
      coveredBy: entry.coveredBy,
      authorCount: entry.candidate.authorCount,
      publicationCount: entry.candidate.publications.length,
    });
  }

  return {
    restore: selected.restore,
    rejected,
    considered: unpublished.length,
  };
}

/** Every published topic's name and member tags, for the dedupe tests. */
async function selectLiveTopics(): Promise<Array<LiveTopic>> {
  const rows = await db
    .select({
      slug: topicTags.topicSlug,
      name: topics.name,
      tag: topicTags.tag,
    })
    .from(topicTags)
    .innerJoin(topics, eq(topics.slug, topicTags.topicSlug))
    .where(eq(topics.published, true));

  const bySlug = new Map<string, LiveTopic>();
  for (const row of rows) {
    const entry = bySlug.get(row.slug);
    if (entry) entry.tags.push(row.tag);
    else
      bySlug.set(row.slug, { slug: row.slug, name: row.name, tags: [row.tag] });
  }
  return [...bySlug.values()];
}

/**
 * Republish the planned topics.
 *
 * Names are left exactly as they were. They were written for this signature,
 * and the signature is what is being restored — re-naming would also change
 * the one thing a reader following an old link would recognise.
 *
 * `supersededBy` is cleared: the row is a destination again, not a redirect.
 * Anything still pointing *at* it keeps working, since the read path follows
 * the chain until it reaches something published.
 */
export async function applyTopicRepair(plan: RepairPlan): Promise<number> {
  if (plan.restore.length === 0) return 0;
  const slugs = plan.restore.map((topic) => topic.slug);

  await db.transaction(async (tx) => {
    for (const topic of plan.restore) {
      await tx
        .update(topics)
        .set({
          published: true,
          supersededBy: null,
          tagCount: topic.tags.length,
          publicationCount: topic.publications.length,
          authorCount: topic.authorCount,
          documentCount: topic.documentCount,
          score: topic.authorCount,
          updatedAt: new Date(),
        })
        .where(eq(topics.slug, topic.slug));
    }

    // These rows were deleted when the topics were unlisted, so there is
    // nothing to conflict with — but clear them anyway so a second run of the
    // repair is a no-op rather than a duplicate-key failure.
    await tx.delete(topicTags).where(inArray(topicTags.topicSlug, slugs));
    await tx
      .delete(topicPublications)
      .where(inArray(topicPublications.topicSlug, slugs));

    const tagValues = plan.restore.flatMap((topic) =>
      signatureWeights(topic.tags).map((member) => ({
        topicSlug: topic.slug,
        tag: member.tag,
        weight: member.weight,
      })),
    );
    for (const batch of chunk(tagValues, INSERT_CHUNK)) {
      await tx.insert(topicTags).values(batch);
    }

    const publicationValues = plan.restore.flatMap((topic) =>
      topic.publications.map((publication) => ({
        topicSlug: topic.slug,
        publicationUri: publication.uri,
        score: publication.score,
        matchedTagCount: publication.matchedTagCount,
      })),
    );
    for (const batch of chunk(publicationValues, INSERT_CHUNK)) {
      await tx.insert(topicPublications).values(batch);
    }

    // Any topic that redirected to one of these now has a published
    // destination again; nothing else about the chain needs touching.
    await tx
      .update(topics)
      .set({ updatedAt: sql`now()` })
      .where(inArray(topics.supersededBy, slugs));
  });

  logEvent("ingest.repairTopics", {
    restored: plan.restore.length,
    considered: plan.considered,
  });
  return plan.restore.length;
}
