/**
 * A small, explainable AI-writing detector.
 *
 * This is deliberately heuristic — no model, no network, no native deps — so it
 * runs anywhere and you can read exactly why a document was flagged. It blends a
 * handful of well-worn signals that tend to separate generic LLM prose from
 * human writing:
 *
 *   - burstiness     humans vary sentence length a lot; LLMs are evener
 *   - clichés        "delve into", "in today's fast-paced world", "tapestry", …
 *   - transitions    heavy "moreover / furthermore / additionally" scaffolding
 *   - hedging        "it's important to note", "it's worth noting", …
 *   - em-dashes      LLMs lean on the em-dash far more than most writers
 *   - lexical variety very uniform vocabulary reads more synthetic
 *
 * Each signal contributes 0..1; the weighted blend is the final score. None of
 * this is authoritative — it is a vibe check, and it says so on the tin.
 */

export type Classification = "human" | "possibly-ai" | "likely-ai";

export interface DetectorSignals {
  burstiness: number;
  cliche: number;
  transitions: number;
  hedging: number;
  emDash: number;
  lexicalUniformity: number;
}

export interface DetectorResult {
  score: number;
  classification: Classification;
  signals: DetectorSignals;
  wordCount: number;
}

const CLICHES = [
  "delve into",
  "delve deeper",
  "in today's fast-paced world",
  "in today's digital age",
  "in the realm of",
  "navigate the complexities",
  "navigating the complexities",
  "a testament to",
  "rich tapestry",
  "tapestry of",
  "at the end of the day",
  "it goes without saying",
  "needless to say",
  "when it comes to",
  "the world of",
  "plays a crucial role",
  "plays a pivotal role",
  "a game changer",
  "game-changer",
  "unlock the potential",
  "unlock the power",
  "harness the power",
  "ever-evolving",
  "ever-changing landscape",
  "in conclusion",
  "first and foremost",
  "last but not least",
];

const HEDGES = [
  "it's important to note",
  "it is important to note",
  "it's worth noting",
  "it is worth noting",
  "it's important to remember",
  "it is important to remember",
  "it's important to understand",
  "it is important to understand",
  "keep in mind that",
  "that being said",
  "it should be noted",
];

const TRANSITIONS = new Set([
  "moreover",
  "furthermore",
  "additionally",
  "consequently",
  "nevertheless",
  "nonetheless",
  "thus",
  "hence",
  "therefore",
  "overall",
  "ultimately",
  "notably",
  "importantly",
  "subsequently",
]);

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    count++;
    from = i + needle.length;
  }
  return count;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Score a chunk of prose. Higher = more likely AI-generated. Short texts can't
 * be judged reliably, so they collapse toward a neutral score.
 */
export function score(input: string): DetectorResult {
  const text = (input ?? "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const wordList = words(text);
  const wordCount = wordList.length;

  if (wordCount < 120) {
    // Not enough signal — stay neutral and let it pass.
    const signals: DetectorSignals = {
      burstiness: 0,
      cliche: 0,
      transitions: 0,
      hedging: 0,
      emDash: 0,
      lexicalUniformity: 0,
    };
    return { score: 0, classification: "human", signals, wordCount };
  }

  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map((s) => words(s).length);

  // Burstiness: low coefficient of variation in sentence length => more uniform
  // => more AI-like. Humans typically sit well above ~0.5 CV.
  const cv =
    mean(sentenceLengths) > 0
      ? stddev(sentenceLengths) / mean(sentenceLengths)
      : 0;
  const burstiness = clamp01((0.6 - cv) / 0.6);

  // Cliché & hedging density, per 1000 words.
  const clicheHits = CLICHES.reduce((n, p) => n + countOccurrences(lower, p), 0);
  const hedgeHits = HEDGES.reduce((n, p) => n + countOccurrences(lower, p), 0);
  const per1000 = (hits: number) => (hits / wordCount) * 1000;
  const cliche = clamp01(per1000(clicheHits) / 4);
  const hedging = clamp01(per1000(hedgeHits) / 3);

  // Transition-word density at sentence starts + overall.
  const transitionStarts = sentences.filter((s) => {
    const first = words(s)[0];
    return first ? TRANSITIONS.has(first) : false;
  }).length;
  const transitionTotal = wordList.filter((w) => TRANSITIONS.has(w)).length;
  const transitions = clamp01(
    (transitionStarts / Math.max(sentences.length, 1)) * 2.5 +
      per1000(transitionTotal) / 25,
  );

  // Em-dash density (— and the common " - " surrogate), per 1000 words.
  const emDashCount =
    countOccurrences(text, "—") + countOccurrences(text, " - ");
  const emDash = clamp01(per1000(emDashCount) / 12);

  // Lexical uniformity: 1 - type/token ratio over a capped window. Very low
  // variety (lots of repetition) reads more synthetic.
  const window = wordList.slice(0, 1000);
  const ttr = new Set(window).size / window.length;
  const lexicalUniformity = clamp01((0.45 - ttr) / 0.45);

  const signals: DetectorSignals = {
    burstiness,
    cliche,
    transitions,
    hedging,
    emDash,
    lexicalUniformity,
  };

  // Weighted blend. Clichés and hedging are the strongest tells; burstiness and
  // transitions are supporting evidence; lexical uniformity is a weak nudge.
  const weighted =
    cliche * 0.3 +
    hedging * 0.22 +
    burstiness * 0.18 +
    transitions * 0.15 +
    emDash * 0.1 +
    lexicalUniformity * 0.05;

  const finalScore = clamp01(weighted);
  const classification: Classification =
    finalScore >= 0.62 ? "likely-ai" : finalScore >= 0.42 ? "possibly-ai" : "human";

  return { score: finalScore, classification, signals, wordCount };
}
