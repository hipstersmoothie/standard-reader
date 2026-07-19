"""
The AI-writing detector model: desklib/ai-text-detector-v1.01.

A DeBERTa-v3-large backbone with mean-pooling over tokens and a single-logit
linear head (sigmoid -> probability the text is machine-generated). This is the
current top open-weight entry on the RAID robustness benchmark, and unlike the
older HC3-trained RoBERTa detectors it is trained on the full RAID set (11
modern LLMs, 8 genres, adversarial attacks), so it generalizes far better to
2024-2026 model output.

The repo ships the weights as a custom (`DesklibAIDetectionModel`) checkpoint —
`model.*` for the DeBERTa backbone, `classifier.*` for the head — so we
reconstruct the architecture here rather than relying on an Auto* class.
"""

from __future__ import annotations

import os

import torch
import torch.nn as nn
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file
from transformers import AutoConfig, AutoModel, AutoTokenizer

MODEL_ID = "desklib/ai-text-detector-v1.01"
MAX_TOKENS = 768

# torch sizes its thread pools from the *host's* core count, which on a shared
# platform is far larger than the cores the container can actually use. The
# oversized OpenMP teams exhaust the container's thread limit ("libgomp: Thread
# creation failed") and take the process down with them. Scoring is already
# serialized by the caller, so a small fixed pool is all we want.
_THREADS = int(os.environ.get("TORCH_NUM_THREADS", "2"))
torch.set_num_threads(_THREADS)
torch.set_num_interop_threads(1)


class DesklibDetector(nn.Module):
    def __init__(self, config) -> None:
        super().__init__()
        self.model = AutoModel.from_config(config)
        self.classifier = nn.Linear(config.hidden_size, 1)

    def forward(self, input_ids, attention_mask):
        hidden = self.model(
            input_ids=input_ids, attention_mask=attention_mask
        ).last_hidden_state
        mask = attention_mask.unsqueeze(-1).float()
        pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
        return self.classifier(pooled)


class Detector:
    def __init__(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        config = AutoConfig.from_pretrained(MODEL_ID)
        self.model = DesklibDetector(config)
        state = load_file(hf_hub_download(MODEL_ID, "model.safetensors"))
        missing, unexpected = self.model.load_state_dict(state, strict=False)
        if missing or unexpected:
            raise RuntimeError(
                f"unexpected checkpoint shape: missing={missing} unexpected={unexpected}"
            )
        self.model.eval()

    @torch.no_grad()
    def score(self, text: str) -> float:
        """Probability (0..1) that `text` is machine-generated."""
        enc = self.tokenizer(
            text,
            truncation=True,
            max_length=MAX_TOKENS,
            padding=True,
            return_tensors="pt",
        )
        logit = self.model(enc["input_ids"], enc["attention_mask"])
        return torch.sigmoid(logit).item()
