/**
 * AI-writing detector — a thin client over the detector sidecar (see
 * `detector/`), which runs `desklib/ai-text-detector-v1.01` (DeBERTa-v3-large,
 * the current RAID-benchmark leader) natively in Python. The two run together
 * in one container (see `start.sh`), talking over `127.0.0.1`.
 *
 * We call it over HTTP rather than running a model in-process: the strong
 * open detectors use custom PyTorch architectures that don't run under
 * `@huggingface/transformers`, and an earlier in-process heuristic never fired
 * on real content. The detector service owns model-specific policy (English-
 * only gating, min-length) and returns a calibrated 0..1 machine-generated
 * probability; a `scored: false` response means "not judged — don't label"
 * (too short, or non-English), which we surface as a neutral score of 0.
 *
 * Honest limitation: even this model has real false-positive risk on terse or
 * stylized human prose. Keep the label's visibility conservative downstream.
 */

import { config } from "./config.ts";

/** Minimum words below which we don't bother calling the detector at all. */
const MIN_WORDS = 30;

export type Classification = "human" | "possibly-ai" | "likely-ai";

export interface DetectorResult {
  /** Probability (0..1) the text is machine-generated; 0 when not scored. */
  score: number;
  classification: Classification;
  wordCount: number;
  /** False when the service declined to judge (too short / non-English). */
  scored: boolean;
}

interface ScoreResponse {
  score: number;
  language: string;
  scored: boolean;
  wordCount: number;
}

function classify(score: number): Classification {
  if (score >= 0.62) return "likely-ai";
  if (score >= 0.42) return "possibly-ai";
  return "human";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Wait for the detector service to finish loading its model. */
export async function preload(timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${config.detectorUrl}/health`);
      if (res.ok) {
        const body = (await res.json()) as { ready?: boolean };
        if (body.ready) return;
      }
    } catch {
      // service not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(
        `detector service at ${config.detectorUrl} not ready after ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * The ingest loop dispatches events fire-and-forget, so a firehose backlog can
 * put hundreds of scores in flight at once. The detector is a single CPU-bound
 * model that scores one request at a time regardless, so the only thing that
 * concurrency buys us is a pile of open sockets and torch fighting itself for
 * threads. Serialize the calls here and let the rest wait their turn.
 */
let pending: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = pending.then(task, task);
  // Keep the chain alive when a task rejects; callers still see the rejection.
  pending = result.catch(() => {});
  return result;
}

/** Score a chunk of prose. Higher = more likely AI-generated. */
export async function score(input: string): Promise<DetectorResult> {
  const text = (input ?? "").trim();
  const words = wordCount(text);
  if (words < MIN_WORDS) {
    return {
      score: 0,
      classification: "human",
      wordCount: words,
      scored: false,
    };
  }

  const res = await enqueue(() =>
    fetch(`${config.detectorUrl}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(60_000),
    }),
  );
  if (!res.ok) {
    throw new Error(`detector /score failed: ${res.status}`);
  }
  const body = (await res.json()) as ScoreResponse;
  return {
    score: body.score,
    classification: body.scored ? classify(body.score) : "human",
    wordCount: body.wordCount,
    scored: body.scored,
  };
}
