/**
 * GlotLID — the language-identification model behind `documents.lang`.
 *
 * GlotLID v3 (cis-lmu/glotlid, Apache-2.0) is a fastText classifier over 2,102
 * language/script labels. It replaced trigram detection (franc) after a
 * benchmark on 1,049 hand-labelled documents from this network
 * (`scripts/lang-bench/`): franc tagged 15.7% of them wrongly — every Tatar post
 * as Kazakh, every Pashto post as Persian — because it could only answer with a
 * language we list. GlotLID knows the languages we don't, so those documents
 * now come back as "not in the vocabulary" and stay untagged, and it made 0.4%
 * bad tags on the same set.
 *
 * The shipped file is GlotLID quantized (`qnorm`, `cutoff=500000`, `dsub=2`):
 * 71 MB instead of 1.6 GB, agreeing with the full model on 99.93% of the
 * benchmark sample. The full model does not fit the 2 GB heap of the WASM
 * fastText build; the quantized one loads in ~150 ms and predicts in ~0.3 ms.
 * `scripts/lang/quantize-glotlid.py` rebuilds it.
 *
 * The model is loaded once per process and only where something asks for it —
 * the ingest worker and the backfill. The web server never loads it: a document
 * the web path writes is left with `lang_detected_at` NULL for the ingest
 * worker's sweep, rather than holding ~400 MB of model in every web replica for
 * the handful of documents it indexes on demand.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { FastTextModel } from "fasttext.wasm.js";

const MODEL_FILE = "glotlid-v3-q500k.ftz";

/** Pinned so a truncated download or a swapped file can never load. */
const MODEL_SHA256 =
  "9dbafad1bdd69f62972b6560b3be31a04be49b40505fa6e064b869158fcd8af5";

/**
 * Where the model lives in a checkout. It is a Git LFS object, so a clone that
 * didn't fetch LFS has a ~130-byte pointer file here instead of the model.
 *
 * Built with `path.join`, not `new URL("…", import.meta.url)`: Vite treats the
 * latter as an asset reference and would copy all 71 MB into the web server's
 * public assets, which never load the model.
 */
const REPO_MODEL_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../models",
  MODEL_FILE,
);

/**
 * The same LFS object served by GitHub, for a checkout that only has the
 * pointer. The repo is public, so this needs no credentials. Pinned to the
 * deploying commit when Railway says which one it is, so a PR environment
 * fetches the model its branch pushed rather than whatever `main` has.
 */
function modelFallbackUrl(): string {
  const ref = process.env.RAILWAY_GIT_COMMIT_SHA || "main";
  return `https://media.githubusercontent.com/media/hipstersmoothie/standard-reader/${ref}/apps/standard-reader/models/${MODEL_FILE}`;
}

const LFS_POINTER_PREFIX = "version https://git-lfs";

export interface GlotlidPrediction {
  /** GlotLID label, e.g. `fas_Arab`. */
  label: string;
  /** Softmax probability of the top label, 0–1. */
  probability: number;
}

let model: FastTextModel | null = null;
let loading: Promise<FastTextModel> | null = null;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The model's bytes: the checked-out file when LFS delivered it, otherwise a
 * cached copy of the GitHub LFS download.
 */
async function modelPath(): Promise<string> {
  const override = process.env.GLOTLID_MODEL_PATH;
  if (override) return override;

  if (existsSync(REPO_MODEL_PATH)) {
    const file = await open(REPO_MODEL_PATH);
    const head = Buffer.alloc(LFS_POINTER_PREFIX.length);
    await file.read(head, 0, head.length, 0).finally(() => file.close());
    if (head.toString("utf8") !== LFS_POINTER_PREFIX) return REPO_MODEL_PATH;
  }

  const cacheDir = path.join(tmpdir(), "standard-reader-models");
  const cached = path.join(cacheDir, MODEL_FILE);
  if (existsSync(cached) && sha256(await readFile(cached)) === MODEL_SHA256) {
    return cached;
  }

  const res = await fetch(modelFallbackUrl());
  if (!res.ok) {
    throw new Error(`GlotLID model download failed: HTTP ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (sha256(bytes) !== MODEL_SHA256) {
    throw new Error("GlotLID model download failed its checksum");
  }
  await mkdir(cacheDir, { recursive: true });
  // Write-then-rename so a concurrent reader never sees half a model.
  const partial = `${cached}.${process.pid}.partial`;
  await writeFile(partial, bytes);
  await rename(partial, cached);
  return cached;
}

/**
 * Load the model into this process. Idempotent and safe to call concurrently;
 * the ingest worker awaits it at startup so the first document it writes is
 * already tagged.
 */
export function loadGlotlid(): Promise<FastTextModel> {
  if (model) return Promise.resolve(model);
  loading ??= (async () => {
    // Imported lazily so the web bundle never evaluates the WASM glue.
    const { getFastTextClass, getFastTextModule } =
      await import("fasttext.wasm.js");
    const FastText = await getFastTextClass({ getFastTextModule });
    const loaded = await new FastText().loadModel(
      pathToFileURL(await modelPath()).href,
    );
    model = loaded;
    return loaded;
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Whether {@link loadGlotlid} has finished in this process. */
export function isGlotlidLoaded(): boolean {
  return model !== null;
}

/**
 * The model's top label for a piece of text: `undefined` when the model isn't
 * loaded in this process, `null` when it returned nothing. Synchronous so the
 * ingest write path pays ~0.3 ms and no extra await.
 */
export function predictGlotlid(
  text: string,
): GlotlidPrediction | null | undefined {
  if (!model) return undefined;
  // fastText reads one line; a newline would end the input early.
  const result = model.predict(text.replaceAll(/\s+/gu, " "), 1, 0);
  try {
    if (result.size() === 0) return null;
    const [probability, label] = result.get(0) as [number, string];
    return {
      label: label.replace("__label__", ""),
      probability: Math.min(1, probability),
    };
  } finally {
    // An embind vector owns WASM memory. Measured flat without this over 300k
    // calls, but that's the binding's detail to change, not ours to rely on.
    (result as { delete?: () => void }).delete?.();
  }
}

/** Every label the loaded model can emit, e.g. `fas_Arab`. Empty if unloaded. */
export function glotlidLabels(): Set<string> {
  if (!model) return new Set();
  const [labels] = model.getLabels() as unknown as [
    { size: () => number; get: (i: number) => string },
  ];
  const out = new Set<string>();
  for (let i = 0; i < labels.size(); i++) {
    out.add(labels.get(i).replace("__label__", ""));
  }
  return out;
}
