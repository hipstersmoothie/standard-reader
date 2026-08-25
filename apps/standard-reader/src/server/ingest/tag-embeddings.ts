import { inArray, ne, or, sql } from "drizzle-orm";

import { chunk } from "#/lib/concurrency";
import { logEvent } from "#/server/observability/log";

import { db } from "../../db/index.ts";
import { tagEmbeddings } from "../../db/schema.ts";
import type { TagEdge } from "./tag-clustering.ts";

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * Semantic similarity between tags, used to join subjects that co-occurrence
 * cannot.
 *
 * Co-occurrence measures behaviour: which tags the same publisher puts on the
 * same article. That is the right primary signal — it is what keeps
 * `política` and `politics` in separate, genuinely separate topics — but
 * it is blind to a subject whose publishers split along tooling lines. On this
 * corpus `typescript / javascript / node.js / npm` and `css / html / tailwind /
 * web development` are two halves of web development that essentially never
 * share a publisher, so counting alone leaves one of them too small to publish.
 *
 * Embeddings supply the missing edges and nothing else. They are additive: a
 * semantic edge can join two tags that never co-occur, but it never removes or
 * reweights a co-occurrence edge, so everything the behavioural signal already
 * gets right is left alone.
 */

/**
 * Small, symmetric sentence-embedding model. Deliberately not the larger
 * instruction-tuned models used for document retrieval: these are bare tags,
 * the comparison is symmetric (no query/passage asymmetry to respect), and the
 * ingest container has to download whatever this names.
 */
const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";

/**
 * Cosine similarity a pair must clear to become an edge.
 *
 * Set from measurement on this corpus, not taste. With tags embedded in
 * context, the pair this signal exists to join — `typescript` ↔ `web
 * development`, the two halves of web development — scores **0.517**, while the
 * pairs that must never merge score far below it: `música`/`music` 0.354,
 * `política`/`politics` 0.187, `china`/`iran` 0.157. 0.45 sits in that gap.
 *
 * Embedding the bare tags instead is what makes this impossible: on bare words
 * the order inverts completely (`música`/`music` 0.723 against
 * `typescript`/`css` 0.116) because the model is then comparing spellings, not
 * subjects. Hence {@link tagContexts}.
 */
const DEFAULT_SIMILARITY = 0.45;

/** Strongest semantic neighbours kept per tag. Caps how much this can reshape. */
const DEFAULT_NEIGHBORS = 6;

/** Tags embedded per model call. */
const EMBED_BATCH = 64;
/** Article titles sampled per tag to describe how it is actually used. */
const CONTEXT_TITLES = 12;
/** Cap on a context string, so one long-titled tag cannot dominate the batch. */
const CONTEXT_CHARS = 1200;

/**
 * What each tag is *about*, as the titles of articles carrying it.
 *
 * This is the whole trick. Embedding the word `typescript` compares it to the
 * word `css` and finds nothing, while comparing `música` to `music` finds
 * near-identity — the model is reading spelling. Embedding the headlines that
 * carry each tag compares subject matter instead, which is the question we are
 * actually asking.
 *
 * One pass over the corpus, numbering titles per tag with a window function,
 * rather than an indexed probe per tag. The probe form reads better and is 70×
 * slower: ~94ms per tag against a 1.6M-row table is seven minutes for this
 * vocabulary, where the single pass does the whole thing in six seconds. Which
 * titles they are does not matter — any sample describes the subject — so there
 * is deliberately no ORDER BY inside the window.
 */
async function tagContexts(tags: Array<string>): Promise<Map<string, string>> {
  const contexts = new Map<string, string>();
  if (tags.length === 0) return contexts;

  const list = sql.join(
    tags.map((tag) => sql`${tag}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    WITH vocabulary AS (SELECT unnest(array[${list}]) AS tag),
    tagged AS (
      SELECT lower(btrim(t)) AS tag, d.title,
             row_number() OVER (PARTITION BY lower(btrim(t))) AS rn
      FROM documents d
      CROSS JOIN unnest(d.tags) AS t
      WHERE d.deleted = false AND d.title <> ''
    )
    SELECT tg.tag, string_agg(tg.title, '. ') AS context
    FROM tagged tg
    JOIN vocabulary v ON v.tag = tg.tag
    WHERE tg.rn <= ${CONTEXT_TITLES}
    GROUP BY tg.tag
  `);
  for (const row of executeRows<{ tag: string; context: string }>(result)) {
    contexts.set(
      row.tag,
      `${row.tag}. ${row.context ?? ""}`.slice(0, CONTEXT_CHARS),
    );
  }

  // A tag with no usable titles still gets embedded, on its own name.
  for (const tag of tags) {
    if (!contexts.has(tag)) contexts.set(tag, tag);
  }
  return contexts;
}

export interface SemanticEdgeOptions {
  model?: string;
  minSimilarity?: number;
  neighborLimit?: number;
}

/** True when semantic edges are switched on (`TOPIC_EMBEDDINGS=1`). */
export function isTagEmbeddingEnabled(): boolean {
  return process.env.TOPIC_EMBEDDINGS === "1";
}

type FeatureExtractor = (
  texts: Array<string>,
  options: { normalize: boolean; pooling: "mean" },
) => Promise<{ tolist: () => Array<Array<number>> }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

/** Lazily build the pipeline once per process (mirrors `#/lib/page-reader/voice`). */
function loadExtractor(model: string): Promise<FeatureExtractor> {
  if (extractorPromise) return extractorPromise;

  extractorPromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const extractor = await pipeline("feature-extraction", model, {
      dtype: "q8",
    });
    return extractor as unknown as FeatureExtractor;
  })().catch((error: unknown) => {
    extractorPromise = null;
    throw error;
  });

  return extractorPromise;
}

/**
 * Vectors for every tag, reading the cache and embedding only what is missing.
 *
 * Rows from another model are treated as missing, so changing {@link
 * DEFAULT_MODEL} re-embeds rather than silently mixing vector spaces.
 */
async function vectorsForTags(
  tags: Array<string>,
  model: string,
): Promise<Map<string, Float32Array>> {
  const vectors = new Map<string, Float32Array>();

  for (const batch of chunk(tags, 1000)) {
    const cached = await db
      .select({
        tag: tagEmbeddings.tag,
        embedding: tagEmbeddings.embedding,
        model: tagEmbeddings.model,
      })
      .from(tagEmbeddings)
      .where(inArray(tagEmbeddings.tag, batch));
    for (const row of cached) {
      if (row.model !== model) continue;
      vectors.set(row.tag, Float32Array.from(row.embedding));
    }
  }

  const missing = tags.filter((tag) => !vectors.has(tag));
  if (missing.length === 0) return vectors;

  const contexts = await tagContexts(missing);
  const extractor = await loadExtractor(model);
  for (const batch of chunk(missing, EMBED_BATCH)) {
    const output = await extractor(
      batch.map((tag) => contexts.get(tag) ?? tag),
      { normalize: true, pooling: "mean" },
    );
    const rows = output.tolist();
    const values = batch.map((tag, index) => ({
      tag,
      embedding: rows[index] ?? [],
      model,
    }));
    for (const value of values) {
      vectors.set(value.tag, Float32Array.from(value.embedding));
    }
    await db
      .insert(tagEmbeddings)
      .values(values)
      .onConflictDoUpdate({
        target: tagEmbeddings.tag,
        set: {
          embedding: sql`excluded.embedding`,
          model: sql`excluded.model`,
          createdAt: sql`now()`,
        },
      });
  }

  return vectors;
}

/**
 * Semantic edges between tags, as extra input to the co-occurrence graph.
 *
 * Vectors are unit-normalized, so similarity is a dot product and the whole
 * comparison is one dense scan. At a few thousand tags that is a second or two;
 * it is not worth an index.
 */
export async function semanticTagEdges(
  tags: Array<string>,
  options: SemanticEdgeOptions = {},
): Promise<Array<TagEdge>> {
  const {
    model = process.env.TOPIC_EMBEDDING_MODEL || DEFAULT_MODEL,
    minSimilarity = DEFAULT_SIMILARITY,
    neighborLimit = DEFAULT_NEIGHBORS,
  } = options;
  if (tags.length < 2) return [];

  const vectors = await vectorsForTags(tags, model);
  const known = tags.filter((tag) => vectors.has(tag));
  if (known.length < 2) return [];

  const dimensions = vectors.get(known[0] as string)?.length ?? 0;
  if (dimensions === 0) return [];

  // One contiguous matrix beats a Map lookup per comparison.
  const matrix = new Float32Array(known.length * dimensions);
  for (const [index, tag] of known.entries()) {
    matrix.set(vectors.get(tag) as Float32Array, index * dimensions);
  }

  const edges: Array<TagEdge> = [];
  for (let i = 0; i < known.length; i++) {
    const base = i * dimensions;
    const neighbours: Array<{ index: number; score: number }> = [];

    for (let j = i + 1; j < known.length; j++) {
      const other = j * dimensions;
      let dot = 0;
      for (let d = 0; d < dimensions; d++) {
        dot += (matrix[base + d] as number) * (matrix[other + d] as number);
      }
      if (dot >= minSimilarity) neighbours.push({ index: j, score: dot });
    }

    neighbours.sort((left, right) => right.score - left.score);
    for (const neighbour of neighbours.slice(0, neighborLimit)) {
      edges.push({
        a: known[i] as string,
        b: known[neighbour.index] as string,
        weight: neighbour.score,
      });
    }
  }

  logEvent("ingest.semanticTagEdges", {
    model,
    tags: known.length,
    edges: edges.length,
    minSimilarity,
  });
  return edges;
}

/** Drop cached vectors from any model other than the active one. */
export async function pruneStaleTagEmbeddings(model: string): Promise<void> {
  await db.delete(tagEmbeddings).where(or(ne(tagEmbeddings.model, model)));
}
