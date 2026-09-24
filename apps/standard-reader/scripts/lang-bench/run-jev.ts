/**
 * Run Jev (TypeSafe, api.typesafe.ai, `jev-latest`) over the benchmark's gold set as one
 * typed `choice` question whose options are the closed vocabulary plus an
 * explicit "other" — so a Tatar or Pashto post has somewhere to go that isn't
 * the nearest language we happen to list (franc's failure on this corpus).
 *
 * Reads the same cleaned samples franc produced, truncated to keep the call
 * cheap. Resumable: ids already in the output file are skipped.
 *
 *   tsx --env-file=.env scripts/lang-bench/run-jev.ts <samples.jsonl> <gold_uris.json> <out.jsonl>
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { CONTENT_LANGUAGES } from "../../src/lib/content-language.ts";

const [samplesPath, goldPath, out] = process.argv.slice(2);
if (!samplesPath || !goldPath || !out) {
  throw new Error(
    "usage: run-jev.ts <samples.jsonl> <gold_uris.json> <out.jsonl>",
  );
}
const key = process.env.JEV_API_KEY;
if (!key) throw new Error("JEV_API_KEY is not set");

const STATE_CHARS = Number(process.env.JEV_STATE_CHARS ?? 1500);
const CONCURRENCY = Number(process.env.JEV_CONCURRENCY ?? 3);

const criteria: Record<string, string> = Object.fromEntries(
  CONTENT_LANGUAGES.map((l) => [l.code, l.englishLabel]),
);
criteria.other =
  "A language not listed here (e.g. Tatar, Pashto, Tajik, Kurdish), or no real prose";

const wanted = new Set<string>(JSON.parse(readFileSync(goldPath, "utf8")));
const done = new Set(
  existsSync(out)
    ? readFileSync(out, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).uri)
    : [],
);
const queue = readFileSync(samplesPath, "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l))
  .filter((r) => wanted.has(r.uri) && !done.has(r.uri));

async function classify(sample: string) {
  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: sample.slice(0, STATE_CHARS),
        questions: {
          lang: {
            type: "choice",
            instructions:
              "Which language is this blog post written in? Judge the body prose, not quoted titles, names, or boilerplate.",
            criteria,
          },
        },
      }),
    });
    const ms = performance.now() - t0;
    if (res.ok) return { body: await res.json(), ms };
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${res.status} ${await res.text()}`);
  }
}

let i = 0;
async function worker() {
  while (i < queue.length) {
    const r = queue[i++];
    const { body, ms } = await classify(r.sample);
    const a = body.answers.lang;
    appendFileSync(
      out,
      JSON.stringify({
        uri: r.uri,
        pred: a.choice === "other" ? "other" : a.choice,
        p: a.probabilities?.[a.choice] ?? null,
        confidence: a.confidence ?? null,
        top: Object.entries(a.probabilities ?? {})
          .toSorted((x, y) => (y[1] as number) - (x[1] as number))
          .slice(0, 3),
        ms: Math.round(ms),
        usage: body.usage,
        model: body.model,
      }) + "\n",
    );
    if (i % 50 === 0) console.log(`${i}/${queue.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${queue.length} classified`);
