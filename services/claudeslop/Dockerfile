# Single image running both halves of the labeler: the Node labeler and the
# Python detector sidecar (torch + desklib). Built with the repo root as the
# Docker build context (Root Directory stays repo-root on Railway).

FROM node:22-bookworm-slim

# Python + a toolchain for the native `better-sqlite3` build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app

# Cap the native thread pools. Without this, OpenMP/MKL size themselves from
# the host's core count rather than the container's share and blow through the
# thread limit — see the matching note in detector/model.py. Set here so it
# also applies to the model-baking step below.
ENV OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2 \
    TOKENIZERS_PARALLELISM=false

# --- Python detector: deps + baked model (cached unless these change) ---
COPY services/claudeslop/detector/requirements.txt services/claudeslop/detector/requirements.txt
RUN python3 -m venv /opt/pyenv \
 && /opt/pyenv/bin/pip install --no-cache-dir \
      torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
 && /opt/pyenv/bin/pip install --no-cache-dir \
      -r services/claudeslop/detector/requirements.txt
COPY services/claudeslop/detector/ services/claudeslop/detector/
# Bake the model into the image so cold starts don't hit the HF Hub.
ENV HF_HOME=/app/.hf
RUN /opt/pyenv/bin/python -c "import sys; sys.path.insert(0, 'services/claudeslop/detector'); from model import Detector; Detector()"

# --- Node workspace deps (pnpm) ---
# Copy the workspace manifests first so the install layer caches on lockfile
# changes only. `--filter claudeslop-labeler...` installs just this package's
# subtree; onlyBuiltDependencies in the root package.json lets better-sqlite3
# run its build.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY extension/package.json extension/package.json
COPY services/claudeslop/package.json services/claudeslop/package.json
COPY services/botlabeler/package.json services/botlabeler/package.json
RUN pnpm install --filter claudeslop-labeler... --frozen-lockfile

# --- App source ---
COPY services/claudeslop/ services/claudeslop/

ENV DETECTOR_PORT=8000
# claudeslop's own /health is on PORT (default 4100); Railway healthchecks that.
CMD ["bash", "services/claudeslop/start.sh"]
