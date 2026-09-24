# Language detector benchmark

How `documents.lang`'s detector was chosen, and how to re-check it before changing
thresholds, bumping the pinned Jev version, or swapping models.

## Result (2026-09-23, 1,049 labelled documents)

| model                  | accuracy | bad-tag rate | tags a language we don't list |
| ---------------------- | -------- | ------------ | ----------------------------- |
| franc (trigram)        | 86.4%    | 15.7%        | 96%                           |
| **GlotLID v3**         | 97.1%    | 0.4%         | 0.9%                          |
| GlotLID, quantized     | 96.7%    | 0.5%         | 0.9%                          |
| fastText lid.176       | 96.8%    | 0.2%         | 1.8%                          |
| OpenLID-v2             | 87.3%    | 0.1%         | 0.9%                          |
| Jev (jev-1.13.0)       | 96.8%    | 1.7%         | 9.1%                          |
| GlotLID + Jev tiebreak | 97.6%    | 0.6%         | 0.9%                          |

Accuracy is over documents in a vocabulary language; a declined document is not an error.
"Bad tag" is a wrong language, or any language on a document written in one we don't list —
the error that hides a post from a reader's filter.

## Method

1. `pull-sample.ts` — read-only sample from the DB: at most one document per publication,
   plus an oversample of non-Latin scripts (the corpus is overwhelmingly English).
2. `run-franc.ts` — the cleaned prose samples every candidate reads, plus franc's verdict.
3. `run_hf.py` — GlotLID, OpenLID-v2, NLLB-LID, lid.176 and XLM-R over the same samples.
   Models come from Hugging Face; see the paths at the top of the script.
4. `run-jev.ts` — Jev over the gold set (`JEV_API_KEY`).
5. Gold labels: every document the detectors disagreed on, plus a per-language sample of
   the ones they agreed on, labelled blind (without seeing any detector's answer).
6. `merge.py` + `score.py [threshold]` — scores on the gold set and re-weighted to the
   corpus mix (agreement documents were sampled, disagreements were all taken).

The sample and labels contain real post text, so they are not committed; the scripts
write to a scratch directory passed on the command line.
