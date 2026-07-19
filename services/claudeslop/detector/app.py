"""
HTTP inference service for the AI-writing detector.

  POST /score  {"text": "..."}  ->  {"score", "language", "scored", "wordCount"}
  GET  /health                  ->  {"ok": true, "ready": bool}

The detector model is English-only, so we language-gate here: non-English text
returns `scored: false` with `score: 0`, which the caller treats as "don't
label" rather than trusting a score the model can't produce reliably. Keeping
that policy next to the model means callers don't need to know the model's
language limits.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import anyio.to_thread
import py3langid as langid
from fastapi import FastAPI
from pydantic import BaseModel

from model import Detector

# Minimum words to attempt a judgement — short snippets carry too little signal.
MIN_WORDS = int(os.environ.get("MIN_WORDS", "30"))

_detector: Detector | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _detector
    # `score` is a sync handler, so Starlette runs it on anyio's threadpool —
    # 40 workers by default. Each concurrent forward pass spins up its own
    # OpenMP thread team on top of that, which exhausts the container's thread
    # budget and segfaults torch. One model, one CPU-bound pass at a time: cap
    # the pool so requests queue instead of piling up.
    anyio.to_thread.current_default_thread_limiter().total_tokens = 1
    # Load the model at startup so the first request isn't slow.
    _detector = Detector()
    yield


app = FastAPI(lifespan=lifespan)


class ScoreRequest(BaseModel):
    text: str


class ScoreResponse(BaseModel):
    score: float
    language: str
    scored: bool
    wordCount: int


@app.get("/health")
def health() -> dict:
    return {"ok": True, "ready": _detector is not None}


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest) -> ScoreResponse:
    text = (req.text or "").strip()
    word_count = len(text.split())

    if word_count < MIN_WORDS:
        return ScoreResponse(
            score=0.0, language="", scored=False, wordCount=word_count
        )

    language, _ = langid.classify(text)
    if language != "en":
        return ScoreResponse(
            score=0.0, language=language, scored=False, wordCount=word_count
        )

    assert _detector is not None
    value = _detector.score(text)
    return ScoreResponse(
        score=value, language=language, scored=True, wordCount=word_count
    )
