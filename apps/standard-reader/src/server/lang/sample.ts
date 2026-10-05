/**
 * Turning a document into something a language detector can read.
 *
 * Trigram detection is only as good as its input, and a document's raw text is
 * a poor sample: code fences, URLs, and long tables of numbers are the same
 * character soup in every language, so they pull every candidate's distance up
 * at once and turn a confident call into a coin flip. Worse, they do it
 * unevenly — an English post about a Japanese library can be more Latin
 * identifier than prose.
 *
 * So we strip the parts of a document that are not written in any language
 * before measuring, and refuse to answer when too little prose is left.
 */

/**
 * Minimum prose, in {@link proseLength} units, before the detector will name a
 * language.
 *
 * Under this it declines and the document keeps `lang = null` — which is never
 * filtered out, so the cost of declining is that a reader with a filter on sees
 * a stub they might not read, while the cost of guessing is that they stop
 * seeing documents they would have. Declining is the cheaper mistake.
 *
 * 120 is roughly a long headline plus a sentence of alphabetic prose. Below it,
 * trigram detection between related languages (Spanish/Galician,
 * Danish/Norwegian, Czech/Slovak) is close to chance.
 */
export const MIN_SAMPLE_LENGTH = 120;

/**
 * Above this the sample stops growing.
 *
 * Detection runs on the ingest write path, so this is a latency budget as much
 * as an accuracy one. At 2.5 kB the chunk vote in `./detect` gets seven
 * independent windows — well past the point where more text changes the answer
 * — for about 2 ms a document. Letting it read a whole 200 kB longread would
 * cost 7 ms for a verdict the first two paragraphs already settled, and the
 * archive replay pays that per document across the corpus.
 */
export const MAX_SAMPLE_LENGTH = 2500;

/** Fenced and indented code blocks, plus inline code spans. */
const CODE_BLOCK = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g;
/** Bare URLs, markdown link targets, and anything that looks like a host. */
const URLS = /\b(?:https?:\/\/|www\.)\S+/g;
/** Markdown image/link syntax — keep the text, drop the target. */
const MD_LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
/** HTML tags, in case a body came through as markup. */
const HTML_TAG = /<[^>]{0,200}>/g;
/** HTML entities, which are Latin letters in every language. */
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g;
/** Handles, hashtags, and emails — identifiers, not prose. */
const HANDLES = /[@#][\w.-]+/g;
/** Runs of digits, punctuation-only runs, and emoji-heavy stretches. */
const NON_PROSE = /[\d_|=+*^~<>[\]{}()/\\]+/g;

/**
 * Letters in any script. Used to measure how much of a sample is actually
 * writing, so "3, 4, 5 — 2024-01-02" does not count as prose.
 */
const LETTER = /\p{L}/gu;

/**
 * Han ideographs, kana, and Hangul syllables.
 *
 * These scripts are morpheme-dense: one character carries roughly what a short
 * word carries in an alphabetic script, so counting them one-for-one against
 * {@link MIN_SAMPLE_LENGTH} would demand about five times as much writing from
 * a Japanese or Chinese document as from an English one before we would tag it
 * at all. {@link DENSE_SCRIPT_WEIGHT} corrects for that.
 */
const DENSE_SCRIPT =
  /[\u3005\u3007\u3021-\u3029\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/gu;

/**
 * How many alphabetic characters one dense-script character is worth. Three is
 * conservative: a Chinese character averages closer to a whole English word,
 * but the point is only to stop CJK documents from being systematically refused.
 */
const DENSE_SCRIPT_WEIGHT = 3;

/**
 * Strip the non-linguistic parts of a body and collapse what's left.
 *
 * Order matters: code fences go before links (a fence can contain a URL), and
 * links before tags (markdown link targets contain angle brackets in some
 * dialects).
 */
export function proseSample(text: string): string {
  return text
    .replace(CODE_BLOCK, " ")
    .replace(MD_LINK, "$1")
    .replace(URLS, " ")
    .replace(HTML_TAG, " ")
    .replace(HTML_ENTITY, " ")
    .replace(HANDLES, " ")
    .replace(NON_PROSE, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_SAMPLE_LENGTH);
}

/** How many characters of the sample are letters in some script. */
export function letterCount(text: string): number {
  return text.match(LETTER)?.length ?? 0;
}

/**
 * How much writing a sample holds, in units comparable across scripts.
 *
 * Alphabetic letters count once; Han, kana, and Hangul count
 * {@link DENSE_SCRIPT_WEIGHT} times. This is what the length thresholds are
 * measured in — never the raw string length, which counts markup and
 * punctuation, and never the plain letter count, which under-measures CJK.
 */
export function proseLength(text: string): number {
  const dense = text.match(DENSE_SCRIPT)?.length ?? 0;
  return letterCount(text) + dense * (DENSE_SCRIPT_WEIGHT - 1);
}

export interface DocumentTextParts {
  title?: string | null;
  description?: string | null;
  textContent?: string | null;
}

/**
 * Build one sample from a document's indexed text.
 *
 * Title and description lead because they are the parts most reliably in the
 * document's own language — a body can carry quoted English, a pasted stack
 * trace, or a bibliography, but a title rarely does. They are short, though, so
 * the body carries the weight of the measurement.
 */
export function documentLanguageSample(parts: DocumentTextParts): string {
  const joined = [parts.title, parts.description, parts.textContent]
    .map((part) => (typeof part === "string" ? part : ""))
    .filter((part) => part !== "")
    .join("\n\n");
  return proseSample(joined);
}
