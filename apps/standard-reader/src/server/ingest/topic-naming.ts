import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { mapWithConcurrency } from "#/lib/concurrency";

/**
 * Names an auto-derived tag cluster.
 *
 * Clustering produces a bag of related tags; a topic also needs a label a
 * reader would recognize. The obvious deterministic answer — use the cluster's
 * most frequent tag — is right often enough to be tempting and wrong often
 * enough to be unusable: it labels `politics`, `gaming`, `music`, and `comics`
 * correctly, but names a cluster of `ev / volkswagen / ford / bmw / toyota /
 * porsche` **"Opinion"** (its highest-frequency member) and a cluster of
 * `robotics / raspberry pi / opensource / arduino / blender` **"Linux"**.
 *
 * So a model reads the cluster's top tags and writes a name and one-line
 * description. That deterministic label remains the fallback for every failure
 * path, so a missing API key, an error, or a refusal degrades the name rather
 * than failing the sweep.
 *
 * Naming is *cached by cluster identity* upstream (see `recompute-topics.ts`):
 * only new clusters and clusters whose tag set materially drifted are sent
 * here, so a steady-state sweep makes roughly no requests.
 */

/** Default naming model. Override with `TOPIC_NAMING_MODEL`. */
const DEFAULT_MODEL = "claude-opus-5";
/** Tags shown to the model — enough to characterize the cluster, not its tail. */
export const NAMING_TAG_SAMPLE = 24;
/** Naming requests in flight at once. */
const NAMING_CONCURRENCY = 4;
/**
 * Thinking is on by default on the naming model and is billed against
 * `max_tokens` alongside the reply, so this is sized well above the couple of
 * dozen tokens the answer itself needs.
 */
const NAMING_MAX_TOKENS = 2000;

const TopicNameSchema = z.object({
  name: z
    .string()
    .describe(
      "One to four words. Capitalize the significant words but leave short " +
        "joining words lowercase — 'Crypto and Web3', not 'Crypto And Web3'. " +
        "No punctuation, quotes, or emoji.",
    ),
  description: z
    .string()
    .describe("One sentence, at most 100 characters, no trailing period."),
});

export interface TopicNaming {
  name: string;
  description: string | null;
  /** Model that produced the name, or null when the fallback was used. */
  model: string | null;
}

/** Title-case a tag for use as a display name. */
function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Deterministic name for a cluster: its most central tag, title-cased. Used
 * whenever the model is unavailable or declines, and as the seed for a slug
 * before any name exists.
 */
export function fallbackTopicName(tags: ReadonlyArray<string>): TopicNaming {
  return {
    name: titleCase(tags[0] ?? "Untitled"),
    description: null,
    model: null,
  };
}

function namingPrompt(tags: ReadonlyArray<string>): string {
  return [
    "These tags were found to co-occur on the same articles across a network of",
    "independent publications, so they form one topic area. Name that topic area",
    "as it would appear as a browsable section of a reading app.",
    "",
    `Tags, most central first: ${tags.join(", ")}`,
    "",
    "Name it for what the whole cluster is about, not for whichever single tag",
    "appears most often — a cluster of car makers is 'Cars', not 'Opinion'.",
    "",
    "Always answer in English, even when the tags are in another language —",
    "the tags themselves stay as they are, but the name and description are",
    "chrome and must match the rest of the interface. When a cluster is the",
    "coverage of one region or language, say so: 'Brazilian Politics', not",
    "'Politics'.",
  ].join("\n");
}

/**
 * True when naming is configured. The sweep still runs without it (every
 * cluster takes the deterministic fallback name), which is what makes a local
 * run with no API key work.
 */
export function isTopicNamingConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function nameOne(
  client: Anthropic,
  model: string,
  tags: ReadonlyArray<string>,
): Promise<TopicNaming> {
  const response = await client.messages.parse({
    model,
    max_tokens: NAMING_MAX_TOKENS,
    output_config: {
      // Naming a bag of tags does not need deep reasoning, and the cost of the
      // first sweep (which names every cluster at once) scales with this.
      effort: "low",
      format: zodOutputFormat(TopicNameSchema),
    },
    messages: [{ role: "user", content: namingPrompt(tags) }],
  });

  // A refusal is a successful HTTP response with empty/partial content, so this
  // has to be checked before reading the parsed output.
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return fallbackTopicName(tags);
  }

  const name = response.parsed_output.name.trim();
  const description = response.parsed_output.description.trim();
  if (!name) return fallbackTopicName(tags);

  return {
    name,
    description: description || null,
    model: response.model,
  };
}

/**
 * Name each cluster, preserving input order. Per-cluster failures fall back to
 * the deterministic label instead of rejecting — a naming outage must not take
 * the recompute sweep down with it, and the next sweep retries the name.
 */
export async function nameTopics(
  clusters: ReadonlyArray<ReadonlyArray<string>>,
): Promise<Array<TopicNaming>> {
  if (clusters.length === 0) return [];
  if (!isTopicNamingConfigured()) {
    return clusters.map((tags) => fallbackTopicName(tags));
  }

  const client = new Anthropic();
  const model = process.env.TOPIC_NAMING_MODEL || DEFAULT_MODEL;

  return mapWithConcurrency(
    clusters as Array<ReadonlyArray<string>>,
    NAMING_CONCURRENCY,
    async (tags) => {
      try {
        return await nameOne(client, model, tags.slice(0, NAMING_TAG_SAMPLE));
      } catch {
        return fallbackTopicName(tags);
      }
    },
  );
}

/**
 * URL slug for a topic name.
 *
 * Names are English, so they normally slugify directly; the tag fallback and
 * then the hash cover a name that reduces to nothing (a cluster named only for
 * a non-Latin term) so a slug always exists.
 */
export function topicSlug(
  name: string,
  fallbackSeed: string,
  taken: ReadonlySet<string>,
): string {
  const base =
    slugify(name) || slugify(fallbackSeed) || `topic-${hashSlug(fallbackSeed)}`;
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${hashSlug(name + fallbackSeed)}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60)
    .replaceAll(/-+$/g, "");
}

/** Base-36 modular rolling hash — 36^6, so the result is at most six chars. */
const HASH_MODULUS = 2_176_782_336;

/**
 * Stable last-resort slug fragment, for the case where a name and its tags both
 * reduce to an empty slug. Only uniqueness matters here, not distribution —
 * {@link topicSlug} still de-dupes whatever comes back.
 */
function hashSlug(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + (value.codePointAt(index) ?? 0)) % HASH_MODULUS;
  }
  return hash.toString(36);
}
