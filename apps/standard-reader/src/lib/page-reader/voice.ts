import type { ReaderVoice } from "./voice-catalog";

export type { ReaderVoice } from "./voice-catalog";

/**
 * The slice of `ArticleDetail` that voice detection needs. Structural so
 * non-app callers (the browser extension's offscreen reader) can use this
 * module without pulling the server function types into their graph.
 */
type VoiceArticle = {
  contributors: Array<{ displayName: string | null; handle: string | null }>;
  publicationOwnerDisplayName: string | null;
  publicationOwnerHandle: string | null;
};

/** Highest-grade American English picks used when auto-detecting gender. */
const FEMALE_VOICE: ReaderVoice = "af_heart";
const MALE_VOICE: ReaderVoice = "am_michael";

// Tiny zero-shot NLI model (runs client-side via ONNX). We classify the
// author's name as male/female; it's lazy-loaded on first use and quantized to
// keep the download small.
const MODEL_ID = "Xenova/mobilebert-uncased-mnli";
const LABELS = ["male", "female"] as const;
const HYPOTHESIS_TEMPLATE = "This is the name of a {} person.";
/** Require at least this confidence for the winning label, else default. */
const CONFIDENCE_MIN = 0.6;

interface ZeroShotResult {
  labels: Array<string>;
  scores: Array<number>;
}
type ZeroShotClassifier = (
  text: string,
  labels: ReadonlyArray<string>,
  options: { hypothesis_template: string },
) => Promise<ZeroShotResult>;

let classifierPromise: Promise<ZeroShotClassifier> | null = null;

/**
 * Lazily import `@huggingface/transformers` and build the zero-shot pipeline
 * once per session. Memoized so repeated lookups reuse the loaded model.
 */
function loadClassifier(): Promise<ZeroShotClassifier> {
  if (classifierPromise) return classifierPromise;

  classifierPromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const classifier = await pipeline("zero-shot-classification", MODEL_ID, {
      dtype: "q8",
    });
    return classifier as unknown as ZeroShotClassifier;
  })().catch((error: unknown) => {
    // Allow a retry if loading failed (network, unsupported device, ...).
    classifierPromise = null;
    throw error;
  });

  return classifierPromise;
}

/** The author name to classify: display name, else a handle's local part. */
function authorName(article: VoiceArticle): string | null {
  const lead = article.contributors[0];

  const displayName = lead?.displayName ?? article.publicationOwnerDisplayName;
  if (displayName?.trim()) return displayName.trim();

  const handle = lead?.handle ?? article.publicationOwnerHandle;
  if (handle) {
    // Strip a leading "@" and drop the domain (e.g. "jane.bsky.social").
    const local = handle.replace(/^@/, "").split(".")[0]?.trim();
    if (local) return local;
  }

  return null;
}

/**
 * Infer a male/female reader voice from a name using the zero-shot model.
 * Falls back to the default voice when the name is empty, the model is
 * unavailable, or the prediction is low-confidence.
 */
export async function nameVoice(name: string | null): Promise<ReaderVoice> {
  if (!name) return FEMALE_VOICE;

  try {
    const classifier = await loadClassifier();
    const result = await classifier(name, LABELS, {
      hypothesis_template: HYPOTHESIS_TEMPLATE,
    });
    const top = result.labels[0];
    const score = result.scores[0] ?? 0;
    if (score >= CONFIDENCE_MIN && top === "male") return MALE_VOICE;
    return FEMALE_VOICE;
  } catch {
    return FEMALE_VOICE;
  }
}

/** Choose the narration voice for an article from its lead author. */
export function articleVoice(article: VoiceArticle): Promise<ReaderVoice> {
  return nameVoice(authorName(article));
}
