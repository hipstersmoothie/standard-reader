"""Rebuild models/glotlid-v3-q500k.ftz from the published GlotLID v3.

The full model (cis-lmu/glotlid, Apache-2.0) is 1.6 GB and does not fit the
2 GB heap of the WASM fastText build the ingest worker runs, so we ship it
quantized: 71 MB, agreeing with the full model on 99.93% of the language
benchmark sample (scripts/lang-bench/).

    uv run --with fasttext-numpy2-wheel --with huggingface_hub \\
        scripts/lang/quantize-glotlid.py

Quantization is deterministic for a given input, but check the SHA-256 it
prints against MODEL_SHA256 in src/server/lang/glotlid.ts and update that
constant if you rebuild from a newer GlotLID.
"""

import hashlib
import pathlib

import fasttext
from huggingface_hub import hf_hub_download

OUT = pathlib.Path(__file__).resolve().parents[2] / "models" / "glotlid-v3-q500k.ftz"

source = hf_hub_download("cis-lmu/glotlid", "model_v3.bin")
model = fasttext.load_model(source)
# No retrain: GlotLID's training data isn't needed to prune and product-quantize
# the existing matrices, and retraining would change the model's answers.
model.quantize(cutoff=500_000, qnorm=True, dsub=2, retrain=False)
model.save_model(str(OUT))

print(OUT, OUT.stat().st_size, "bytes")
print("sha256", hashlib.sha256(OUT.read_bytes()).hexdigest())
