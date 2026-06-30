import type { KokoroTTS } from "kokoro-js";

import type { ReaderVoice } from "./voice";

import { loadKokoro, splitSentences } from "./kokoro-loader";

const STATE_TICK_MS = 200;
const MIN_RATE = 0.5;
const MAX_RATE = 2;

// Duration estimation while still generating. The estimate shrinks a noisy
// per-article chars→seconds measurement toward a prior so it's stable early and
// converges as more audio is produced; visual updates are throttled so the
// displayed total only moves on meaningful changes.
/** Prior seconds-per-character at 1× speed (~16 chars/sec of speech). */
const BASE_SEC_PER_CHAR = 0.07;
/** Pseudo-count (in chars) weighting the prior against measured audio. */
const ESTIMATE_PRIOR_CHARS = 400;
/** Minimum change (seconds) before pushing a new duration to the UI. */
const DURATION_UPDATE_THRESHOLD = 2;

/** Remembered across articles so the speed choice persists for the session. */
let lastRate = 1;

export type ReaderStatus =
  | "idle"
  | "loading-model"
  | "generating"
  | "playing"
  | "paused"
  | "error";

export interface ReaderState {
  status: ReaderStatus;
  currentTime: number;
  /** Seconds generated so far; grows while streaming, final once complete. */
  duration: number;
  /** 0..1 model download progress while `status === "loading-model"`. */
  modelProgress: number;
  /** 0..1 speech generation progress (can continue during playback). */
  generationProgress: number;
  /** Playback speed multiplier. */
  rate: number;
  error: string | null;
}

const INITIAL_STATE: ReaderState = {
  status: "idle",
  currentTime: 0,
  duration: 0,
  modelProgress: 0,
  generationProgress: 0,
  rate: 1,
  error: null,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Streams synthesized speech through the Web Audio API. The text is split into
 * sentences and Kokoro synthesizes each one (at the chosen playback speed) into
 * raw 24kHz PCM, which is dropped straight into an `AudioBuffer`; the chunks are
 * chained back-to-back so playback starts on the first sentence while the rest
 * keeps generating in the background.
 *
 * Speed is applied at *synthesis* time via Kokoro's `speed` option (which
 * time-scales the speech without altering pitch) rather than via Web Audio
 * `playbackRate` (which resamples and raises the pitch). Changing speed
 * re-synthesizes from the current sentence onward at the new rate.
 *
 * Seeking works against a *projected* timeline that spans the whole article:
 * generated sentences contribute their real duration, ungenerated ones a
 * chars→seconds estimate. Seeking inside the synthesized buffer is instant;
 * seeking past it "rebases" synthesis to the target sentence and regenerates
 * from there, so the ±skip controls and scrubber can jump anywhere in the piece
 * rather than being pinned to whatever has been generated so far.
 */
export class PageReaderEngine {
  private ctx: AudioContext | null = null;
  private listeners = new Set<(state: ReaderState) => void>();
  private rate = lastRate;
  private state: ReaderState = { ...INITIAL_STATE, rate: lastRate };

  /** Bumped on every prepare/reset/rate-change/rebase so stale work can bail. */
  private runId = 0;

  // Synthesis inputs.
  private tts: KokoroTTS | null = null;
  private voice: ReaderVoice = "af_heart";
  private sentences: Array<string> = [];
  /** Character length of each sentence (drives duration estimates). */
  private charLen: Array<number> = [];

  // Generated audio buffer. `chunks[i]` is the synthesized audio for sentence
  // `baseSentence + i`; the buffer is always contiguous from `baseSentence`.
  private chunks: Array<AudioBuffer> = [];
  /** Buffer-relative start offset (seconds) of each chunk (chunk 0 → 0). */
  private chunkStart: Array<number> = [];
  /** Sentence index that `chunks[0]` corresponds to. */
  private baseSentence = 0;
  /** Total seconds of audio in the current buffer. */
  private totalGenerated = 0;
  private generationComplete = false;
  /** Total characters of the whole article (for the projected timeline). */
  private totalChars = 1;
  private producedChars = 0;
  /** Last duration pushed to the UI (for update throttling). */
  private displayedDuration = 0;

  // Cached projected-timeline starts, invalidated whenever the buffer, base
  // sentence, or rate changes.
  private timelineVersion = 0;
  private cachedStarts: Array<number> | null = null;
  private cachedStartsVersion = -1;

  // Playback transport. `currentChunkIndex` is buffer-relative; `pausedAt` is a
  // projected-timeline time (seconds).
  private source: AudioBufferSourceNode | null = null;
  private currentChunkIndex = 0;
  private offsetInBuffer = 0;
  private chunkPlayCtxStart = 0;
  private isPlaying = false;
  private waitingForChunk = false;
  private pausedAt = 0;
  private ticker: ReturnType<typeof globalThis.setInterval> | null = null;

  subscribe(listener: (state: ReaderState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ReaderState {
    return this.state;
  }

  /** The sentences currently loaded for playback (in narration order). */
  getSentences(): Array<string> {
    return this.sentences;
  }

  /**
   * Current position as a sentence index plus a 0..1 fraction through that
   * sentence's audio — used to drive word-level highlighting. Null until the
   * first chunk has been generated. The index is a global sentence index (it
   * accounts for the buffer's base sentence after a forward seek).
   */
  getProgress(): { index: number; fraction: number } | null {
    if (this.chunks.length === 0) return null;
    const rel = clamp(
      this.currentTime() - this.baseOffset(),
      0,
      this.totalGenerated,
    );
    const chunkIndex = Math.min(this.indexForRel(rel), this.chunks.length - 1);
    const start = this.chunkStart[chunkIndex] ?? 0;
    const duration = this.chunks[chunkIndex]?.duration ?? 0;
    const fraction = duration > 0 ? clamp((rel - start) / duration, 0, 1) : 0;
    return { index: this.baseSentence + chunkIndex, fraction };
  }

  private setState(patch: Partial<ReaderState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = globalThis.AudioContext;
    if (Ctor === undefined) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  private bumpTimeline(): void {
    this.timelineVersion += 1;
    this.cachedStarts = null;
  }

  /** Characters of buffered (generated) sentences — for the rate estimate. */
  private bufferedChars(): number {
    let total = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      total += this.charLen[this.baseSentence + i] ?? 0;
    }
    return total;
  }

  /**
   * Estimated seconds-per-character, blending the measured buffered rate with a
   * rate-aware prior (shrinkage) so it's stable from the first sentence.
   */
  private secPerChar(): number {
    const prior = BASE_SEC_PER_CHAR / this.rate;
    const chars = this.bufferedChars();
    if (chars === 0) return prior;
    return (
      (this.totalGenerated + ESTIMATE_PRIOR_CHARS * prior) /
      (chars + ESTIMATE_PRIOR_CHARS)
    );
  }

  /**
   * Projected start time (seconds) of every sentence (length `n + 1`). Generated
   * sentences contribute their real audio duration; the rest a chars→seconds
   * estimate. Cached between buffer/rate changes.
   */
  private projectedStarts(): Array<number> {
    if (
      this.cachedStarts &&
      this.cachedStartsVersion === this.timelineVersion
    ) {
      return this.cachedStarts;
    }
    const n = this.sentences.length;
    const spc = this.secPerChar();
    const starts = Array.from<number>({ length: n + 1 });
    starts[0] = 0;
    for (let i = 0; i < n; i++) {
      const rel = i - this.baseSentence;
      const duration =
        rel >= 0 && rel < this.chunks.length
          ? this.chunks[rel].duration
          : (this.charLen[i] ?? 0) * spc;
      starts[i + 1] = starts[i] + duration;
    }
    this.cachedStarts = starts;
    this.cachedStartsVersion = this.timelineVersion;
    return starts;
  }

  /** Projected start time of the buffer's first sentence. */
  private baseOffset(): number {
    if (this.baseSentence === 0) return 0;
    return this.projectedStarts()[this.baseSentence];
  }

  /** Projected total duration of the whole article. */
  private projectedTotal(): number {
    return this.projectedStarts().at(-1) ?? 0;
  }

  /** Sentence index whose projected span contains `time`. */
  private sentenceForTime(time: number, starts: Array<number>): number {
    for (let i = 0; i < this.sentences.length; i++) {
      if (time < starts[i + 1]) return i;
    }
    return Math.max(this.sentences.length - 1, 0);
  }

  /** Push a new estimated duration to the UI only on meaningful changes. */
  private updateDuration(force: boolean): void {
    const next = this.projectedTotal();
    if (
      force ||
      Math.abs(next - this.displayedDuration) >= DURATION_UPDATE_THRESHOLD
    ) {
      this.displayedDuration = next;
      this.setState({ duration: next });
    }
  }

  /** Current position on the projected timeline (seconds). */
  private currentTime(): number {
    const baseOff = this.baseOffset();
    if (!this.isPlaying) return this.pausedAt;
    if (this.ctx && this.source) {
      const rel =
        this.chunkStart[this.currentChunkIndex] +
        this.offsetInBuffer +
        (this.ctx.currentTime - this.chunkPlayCtxStart);
      return baseOff + clamp(rel, 0, this.totalGenerated);
    }
    // Outran generation: sitting at the live edge of the buffer.
    return baseOff + this.totalGenerated;
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = globalThis.setInterval(() => {
      this.setState({ currentTime: this.currentTime() });
    }, STATE_TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      globalThis.clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private stopSource(): void {
    if (this.source) {
      // Drop the reference first so the resulting `ended` event is ignored by
      // `handleSourceEnded` (which checks source identity).
      const source = this.source;
      this.source = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
  }

  /** Buffer-relative chunk index containing relative time `rel`. */
  private indexForRel(rel: number): number {
    if (this.chunks.length === 0) return 0;
    if (rel >= this.totalGenerated) return this.chunks.length;
    for (const [index, buffer] of this.chunks.entries()) {
      if (rel < this.chunkStart[index] + buffer.duration) return index;
    }
    return this.chunks.length - 1;
  }

  private handleSourceEnded(source: AudioBufferSourceNode): void {
    // Ignore the `ended` event from a source we replaced manually.
    if (source !== this.source) return;
    this.source = null;
    this.playChunkAt(this.currentChunkIndex + 1, 0);
  }

  private playChunkAt(index: number, offset: number): void {
    this.stopSource();
    const ctx = this.ctx;

    if (index >= this.chunks.length || !ctx) {
      this.currentChunkIndex = index;
      if (this.generationComplete || !ctx) {
        // Reached the end of the article.
        this.isPlaying = false;
        this.waitingForChunk = false;
        this.pausedAt = this.baseOffset() + this.totalGenerated;
        this.stopTicker();
        this.setState({ status: "paused", currentTime: this.pausedAt });
      } else {
        // Outran generation; resume when the next chunk lands.
        this.waitingForChunk = true;
        this.isPlaying = true;
        this.setState({
          status: this.chunks.length === 0 ? "generating" : "playing",
        });
      }
      return;
    }

    const buffer = this.chunks[index];
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.addEventListener("ended", () => {
      this.handleSourceEnded(source);
    });

    this.currentChunkIndex = index;
    this.offsetInBuffer = offset;
    this.chunkPlayCtxStart = ctx.currentTime;
    this.waitingForChunk = false;
    this.isPlaying = true;
    source.start(0, offset);
    this.source = source;

    this.startTicker();
    this.setState({ status: "playing", currentTime: this.currentTime() });
  }

  /** Start playback at a buffer-relative time. */
  private playFromRel(rel: number): void {
    const target = clamp(rel, 0, this.totalGenerated);
    const index = this.indexForRel(target);
    const offset =
      index < this.chunks.length ? target - this.chunkStart[index] : 0;
    this.isPlaying = true;
    this.playChunkAt(index, offset);
  }

  private appendChunk(buffer: AudioBuffer): void {
    const index = this.chunks.length;
    this.chunks.push(buffer);
    this.chunkStart[index] = this.totalGenerated;
    this.totalGenerated += buffer.duration;
    this.bumpTimeline();
    this.updateDuration(false);

    // Resume playback if we were waiting for exactly this chunk.
    if (
      this.isPlaying &&
      this.waitingForChunk &&
      this.currentChunkIndex === index
    ) {
      this.playChunkAt(index, 0);
    }
  }

  private resetPlayback(): void {
    this.stopSource();
    this.stopTicker();
    this.sentences = [];
    this.charLen = [];
    this.chunks = [];
    this.chunkStart = [];
    this.baseSentence = 0;
    this.totalGenerated = 0;
    this.generationComplete = false;
    this.currentChunkIndex = 0;
    this.offsetInBuffer = 0;
    this.chunkPlayCtxStart = 0;
    this.isPlaying = false;
    this.waitingForChunk = false;
    this.pausedAt = 0;
    this.totalChars = 1;
    this.producedChars = 0;
    this.displayedDuration = 0;
    this.bumpTimeline();
  }

  /** Total characters of the first `count` sentences. */
  private sumChars(count: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) total += this.charLen[i] ?? 0;
    return total;
  }

  /** Drop generated chunks from `relIndex` onward and rewind the buffer to it. */
  private truncateFrom(relIndex: number): void {
    this.chunks.length = relIndex;
    this.chunkStart.length = relIndex;
    this.totalGenerated =
      relIndex > 0
        ? this.chunkStart[relIndex - 1] + this.chunks[relIndex - 1].duration
        : 0;
    this.generationComplete = false;
    this.bumpTimeline();
    // Force the next estimate through the update throttle.
    this.displayedDuration = 0;
  }

  /**
   * Load the model (if needed) and stream-synthesize `text`, starting playback
   * as soon as the first sentence is ready. Resolves `true` once the full text
   * has been generated, or `false` if superseded or failed.
   */
  async prepare(
    text: string,
    voice: ReaderVoice | Promise<ReaderVoice>,
  ): Promise<boolean> {
    const runId = ++this.runId;
    this.resetPlayback();

    const ctx = this.ensureContext();
    if (!ctx) {
      this.setState({
        status: "error",
        error: "Audio isn’t supported in this browser.",
      });
      return false;
    }

    this.setState({
      status: "loading-model",
      currentTime: 0,
      duration: 0,
      modelProgress: 0,
      generationProgress: 0,
      error: null,
    });

    try {
      this.tts = await loadKokoro((loaded, total) => {
        if (runId === this.runId) {
          this.setState({ modelProgress: total > 0 ? loaded / total : 0 });
        }
      });
    } catch {
      if (runId === this.runId) {
        this.setState({
          status: "error",
          error: "Couldn’t load the reader voice.",
        });
      }
      return false;
    }
    if (runId !== this.runId) return false;

    // Voice detection runs concurrently with the model load above; resolve it
    // now (defaulting to the female voice if it failed).
    try {
      this.voice = await voice;
    } catch {
      this.voice = "af_heart";
    }
    if (runId !== this.runId) return false;

    try {
      this.sentences = await splitSentences(text);
    } catch {
      this.sentences = [text];
    }
    if (runId !== this.runId) return false;
    if (this.sentences.length === 0) {
      this.setState({ status: "error", error: "There’s nothing to read." });
      return false;
    }

    this.charLen = this.sentences.map((sentence) => sentence.length);
    this.totalChars = Math.max(this.sumChars(this.sentences.length), 1);
    this.bumpTimeline();
    this.setState({ status: "generating", generationProgress: 0 });

    // Start playback at the first sentence as soon as it has been synthesized.
    this.baseSentence = 0;
    this.isPlaying = true;
    this.waitingForChunk = true;
    this.currentChunkIndex = 0;
    this.pausedAt = 0;

    await this.generateFrom(0);
    return runId === this.runId;
  }

  /**
   * Synthesize sentences from `startIndex` onward at the current speed,
   * appending each as it completes. Bails out if superseded (new run id).
   */
  private async generateFrom(startIndex: number): Promise<void> {
    const runId = this.runId;
    const ctx = this.ctx;
    const tts = this.tts;
    if (!ctx || !tts) return;

    this.producedChars = this.sumChars(startIndex);

    for (let index = startIndex; index < this.sentences.length; index++) {
      let raw;
      try {
        raw = await tts.generate(this.sentences[index], {
          voice: this.voice,
          speed: this.rate,
        });
      } catch {
        if (runId === this.runId) {
          this.setState({ status: "error", error: "Couldn’t generate audio." });
        }
        return;
      }
      if (runId !== this.runId) return;

      // kokoro-js returns a single Float32Array; v4 types it as
      // `Float32Array | Float32Array[]`. Flatten to a single array so the
      // AudioBuffer's `set()` (which needs `ArrayLike<number>`) is happy.
      const audio = Array.isArray(raw.audio) ? raw.audio[0] : raw.audio;
      if (audio) {
        const buffer = ctx.createBuffer(1, audio.length, raw.sampling_rate);
        buffer.getChannelData(0).set(audio);
        this.producedChars += this.charLen[index] ?? 0;
        this.appendChunk(buffer);
      }
      this.setState({
        generationProgress: Math.min(
          this.producedChars / this.totalChars,
          0.99,
        ),
      });
    }

    if (runId !== this.runId) return;
    this.generationComplete = true;
    this.updateDuration(true);
    this.setState({ generationProgress: 1 });
  }

  play(): void {
    if (this.isPlaying) return;
    void this.ctx?.resume();
    this.isPlaying = true;
    this.resumeAt(this.pausedAt);
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.pausedAt = this.currentTime();
    this.stopSource();
    this.isPlaying = false;
    this.waitingForChunk = false;
    this.stopTicker();
    this.setState({ status: "paused", currentTime: this.pausedAt });
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  /** Resume/seek playback to a projected time (assumes `isPlaying` is set). */
  private resumeAt(projectedTime: number): void {
    const starts = this.projectedStarts();
    const target = clamp(projectedTime, 0, starts.at(-1) ?? 0);
    const sentence = this.sentenceForTime(target, starts);
    const inBuffer =
      sentence >= this.baseSentence &&
      sentence < this.baseSentence + this.chunks.length;

    if (inBuffer) {
      this.playFromRel(target - this.baseOffset());
      return;
    }
    this.rebaseTo(sentence, target);
  }

  /**
   * Rebase synthesis so the buffer starts at `sentenceIndex`, then regenerate
   * from there. Used when seeking past the synthesized buffer. Keeps playing (or
   * pre-buffers, if paused) and shows `displayTime` as the position.
   */
  private rebaseTo(sentenceIndex: number, displayTime: number): void {
    const wasPlaying = this.isPlaying;
    this.runId += 1;
    this.stopSource();

    this.baseSentence = clamp(sentenceIndex, 0, this.sentences.length - 1);
    this.chunks = [];
    this.chunkStart = [];
    this.totalGenerated = 0;
    this.generationComplete = false;
    this.currentChunkIndex = 0;
    this.offsetInBuffer = 0;
    this.pausedAt = displayTime;
    this.isPlaying = wasPlaying;
    this.waitingForChunk = wasPlaying;
    this.displayedDuration = 0;
    this.bumpTimeline();

    if (!wasPlaying) this.stopTicker();
    // Keep the transport visible (rather than flipping to the "generating"
    // label) while the target sentence synthesizes; `appendChunk` will start the
    // audio and ticker as soon as it lands.
    this.setState({
      status: wasPlaying ? "playing" : "paused",
      currentTime: displayTime,
      generationProgress: Math.min(
        this.sumChars(this.baseSentence) / this.totalChars,
        0.99,
      ),
    });

    void this.generateFrom(this.baseSentence);
  }

  private seek(projectedTime: number): void {
    if (this.sentences.length === 0) return;
    if (this.isPlaying) {
      this.resumeAt(projectedTime);
      return;
    }
    // Paused: just move the displayed position. The buffer is rebased lazily on
    // the next `play()` so dragging the scrubber doesn't thrash synthesis.
    const target = clamp(projectedTime, 0, this.projectedTotal());
    this.pausedAt = target;
    this.setState({ currentTime: target });
  }

  skip(seconds: number): void {
    this.seek(this.currentTime() + seconds);
  }

  /** Seek to an absolute time (seconds) on the projected timeline. */
  seekTo(seconds: number): void {
    this.seek(seconds);
  }

  setRate(rate: number): void {
    const next = clamp(rate, MIN_RATE, MAX_RATE);
    if (next === this.rate) return;
    this.rate = next;
    lastRate = next;
    this.setState({ rate: next });

    // Nothing synthesized yet — the pending `prepare` will use the new speed.
    if (!this.tts || this.sentences.length === 0) {
      this.bumpTimeline();
      return;
    }

    // Re-synthesize from the current sentence at the new speed (pitch-preserving
    // speed only exists at synthesis time). Earlier sentences keep their old
    // audio; we resume from the start of the current one.
    const wasPlaying = this.isPlaying;
    const resumeRel = Math.min(this.currentChunkIndex, this.chunks.length);

    this.runId += 1;
    this.stopSource();
    this.truncateFrom(resumeRel);

    this.currentChunkIndex = resumeRel;
    this.offsetInBuffer = 0;
    this.pausedAt = this.baseOffset() + this.totalGenerated;
    this.isPlaying = wasPlaying;
    this.waitingForChunk = wasPlaying;
    if (!wasPlaying) {
      this.stopTicker();
      this.setState({ currentTime: this.pausedAt });
    }

    void this.generateFrom(this.baseSentence + resumeRel);
  }

  /** Stop playback and return to the idle state (player bar hidden). */
  reset(): void {
    this.runId += 1;
    this.resetPlayback();
    this.setState({ ...INITIAL_STATE, rate: this.rate });
  }

  dispose(): void {
    this.runId += 1;
    this.resetPlayback();
    void this.ctx?.close();
    this.ctx = null;
    this.listeners.clear();
  }
}
