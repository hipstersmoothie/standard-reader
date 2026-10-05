/**
 * Jev (TypeSafe's System One model) as the tiebreaker for documents GlotLID
 * isn't sure about.
 *
 * GlotLID answers ~98% of documents with a clear winner. The rest — short
 * posts, code-heavy posts, a Russian chart wrapped around a list of English
 * song titles — it hedges on, and those are exactly where a model that reads
 * the text rather than its character n-grams earns its keep: on the 35
 * benchmark documents GlotLID was least sure of, Jev placed 31 and GlotLID 26.
 * On everything else Jev is no better and costs a network round trip, so it is
 * never asked first.
 *
 * It runs from the hourly sweep, never on the ingest write path: the write path
 * must not wait on, or fail with, a third-party API. A document waiting for a
 * tiebreak is simply untagged in the meantime, which every language filter
 * already treats as "show it".
 *
 * API reference: https://docs.typesafe.ai/api.md — one `choice` question whose
 * options are the closed vocabulary plus an explicit "other", so a language we
 * don't list has somewhere to go that isn't its nearest neighbour.
 */

import type { ContentLanguageCode } from "#/lib/content-language";
import { CONTENT_LANGUAGES, isContentLanguage } from "#/lib/content-language";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/**
 * Pinned rather than `jev-latest`: the threshold below was measured against
 * this version, and an alias that moves under us would silently change what it
 * means. Bump it deliberately, after re-running `scripts/lang-bench`.
 */
const MODEL = "jev-1.13.0";

/**
 * Jev's probability for its pick must reach this before it tags a document.
 *
 * The tiebreak exists to recover documents GlotLID declined, and a wrong tag
 * hides a post from readers filtering on its real language, so it is held to a
 * higher bar than GlotLID itself. On the benchmark, 0.8 recovered 10 declined
 * documents for one extra wrong tag; 0.5 recovered 15 for two.
 */
export const JEV_MIN_PROBABILITY = 0.8;

/** Characters of the prose sample sent. Past this the answer doesn't change. */
const STATE_CHARS = 1500;

const REQUEST_TIMEOUT_MS = 15_000;

const OTHER = "other";

const CRITERIA: Record<string, string> = {
  ...Object.fromEntries(CONTENT_LANGUAGES.map((l) => [l.code, l.englishLabel])),
  [OTHER]:
    "A language not listed here (e.g. Tatar, Pashto, Tajik, Kurdish), or no real prose",
};

export interface JevLanguageVerdict {
  /** The language, or `null` for "not one we list" / not confident enough. */
  code: ContentLanguageCode | null;
  /** Jev's probability for its pick. */
  probability: number;
}

interface ChoiceAnswer {
  choice: string;
  probabilities?: Record<string, number>;
}

export function isJevConfigured(): boolean {
  return Boolean(process.env.JEV_API_KEY);
}

/**
 * Ask Jev which language a prose sample is written in.
 *
 * Resolves `undefined` — never throws — when Jev isn't configured or the call
 * failed, so the caller leaves the document queued for the next sweep instead
 * of recording a non-answer as an answer.
 */
export async function jevLanguage(
  sample: string,
): Promise<JevLanguageVerdict | undefined> {
  const key = process.env.JEV_API_KEY;
  if (!key) return undefined;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        state: sample.slice(0, STATE_CHARS),
        questions: {
          lang: {
            type: "choice",
            instructions:
              "Which language is this blog post written in? Judge the body prose, not quoted titles, names, or boilerplate.",
            criteria: CRITERIA,
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;

  const body = (await res.json().catch(() => null)) as {
    answers?: { lang?: ChoiceAnswer };
  } | null;
  const answer = body?.answers?.lang;
  if (!answer) return undefined;

  const probability = answer.probabilities?.[answer.choice] ?? 0;
  const code =
    answer.choice !== OTHER &&
    isContentLanguage(answer.choice) &&
    probability >= JEV_MIN_PROBABILITY
      ? answer.choice
      : null;
  return { code, probability };
}
