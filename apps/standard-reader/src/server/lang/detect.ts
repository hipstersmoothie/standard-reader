/**
 * The language tagger.
 *
 * GlotLID (`./glotlid`) over a cleaned prose sample (`./sample`), mapped onto
 * the closed vocabulary in `#/lib/content-language`. Two outcomes are not a
 * language, and both leave the document untagged — which every language filter
 * treats as "show it":
 *
 * 1. **Not a language we list.** GlotLID knows ~2,100 language/script labels,
 *    so a Tatar post is confidently Tatar and stays untagged — rather than
 *    being filed under the nearest language we do list, which is what the
 *    trigram detector this replaced did to every Tatar (→ Kazakh) and Pashto
 *    (→ Persian) post on the network.
 * 2. **Not sure.** Below {@link GLOTLID_MIN_PROBABILITY} the document is
 *    recorded as `glotlid-unsure` and queued for the Jev tiebreak (`./jev`) the
 *    hourly sweep runs. It stays untagged until then, and afterwards if Jev
 *    isn't sure either.
 *
 * Nothing here writes to a repo — the language is our derivation, not a claim
 * the author made.
 */

import type { ContentLanguageCode } from "#/lib/content-language";
import { contentLanguageFromDetectorLabel } from "#/lib/content-language";

import { predictGlotlid } from "./glotlid.ts";
import type { DocumentTextParts } from "./sample.ts";
import {
  MIN_SAMPLE_LENGTH,
  documentLanguageSample,
  proseLength,
} from "./sample.ts";

/**
 * GlotLID's probability for its top label must reach this to decide a document
 * on its own; below it the document goes to the Jev tiebreak.
 *
 * On the benchmark, raising it to 0.7 sent twice as many documents to Jev for
 * no gain, and at 0.9 the tiebreak made more mistakes than it fixed.
 */
export const GLOTLID_MIN_PROBABILITY = 0.5;

/**
 * Who settled a document's `lang`, stored in `documents.lang_source`.
 *
 * - `glotlid` — GlotLID was sure (including sure it's a language we don't list).
 * - `glotlid-unsure` — GlotLID wasn't; waiting on the Jev tiebreak.
 * - `jev` — the tiebreak ran. Terminal: a document Jev couldn't place either
 *   stays untagged rather than being asked again every hour.
 */
export type LanguageSource = "glotlid" | "glotlid-unsure" | "jev";

export interface LanguageDetection {
  /** BCP-47 primary subtag from the closed vocabulary, or `null` for none. */
  code: ContentLanguageCode | null;
  /** The deciding model's probability for its pick; `null` if none ran. */
  confidence: number | null;
  /** `null` when there was too little prose to ask a model at all. */
  source: LanguageSource | null;
}

/**
 * Name the language of a prose sample.
 *
 * Returns `undefined` — distinct from an untagged result — when GlotLID isn't
 * loaded in this process (the web server never loads it). The caller then
 * leaves `lang_detected_at` NULL so the ingest worker's sweep does the work.
 */
export function detectLanguage(text: string): LanguageDetection | undefined {
  const sample = text.trim();
  if (proseLength(sample) < MIN_SAMPLE_LENGTH) {
    return { code: null, confidence: null, source: null };
  }

  const top = predictGlotlid(sample);
  if (top === undefined) return undefined;
  if (top === null) return { code: null, confidence: null, source: null };

  const confidence = Number(top.probability.toFixed(3));
  if (top.probability < GLOTLID_MIN_PROBABILITY) {
    return { code: null, confidence, source: "glotlid-unsure" };
  }
  return {
    code: contentLanguageFromDetectorLabel(top.label),
    confidence,
    source: "glotlid",
  };
}

/**
 * Tag a document from its indexed text — the entry point ingest and the
 * backfill sweep both call.
 */
export function detectDocumentLanguage(
  parts: DocumentTextParts,
): LanguageDetection | undefined {
  return detectLanguage(documentLanguageSample(parts));
}

/**
 * The `documents` columns a detection writes.
 *
 * An `undefined` detection (GlotLID not loaded here) clears all four, so the
 * row lands in the sweep's `lang_detected_at IS NULL` queue and the ingest
 * worker tags it within the hour. Clearing rather than leaving the old values
 * matters on re-upsert: the text may have changed, and a stale tag is worse
 * than a brief absence of one.
 */
export function languageColumns(detected?: LanguageDetection): {
  lang: string | null;
  langConfidence: number | null;
  langDetectedAt: Date | null;
  langSource: LanguageSource | null;
} {
  if (!detected) {
    return {
      lang: null,
      langConfidence: null,
      langDetectedAt: null,
      langSource: null,
    };
  }
  return {
    lang: detected.code,
    langConfidence: detected.confidence,
    langDetectedAt: new Date(),
    langSource: detected.source,
  };
}
