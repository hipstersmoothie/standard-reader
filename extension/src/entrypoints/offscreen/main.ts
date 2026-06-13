import type { ReaderVoicePreference } from "#/lib/reader-voice";

import { env } from "@huggingface/transformers";
import { PageReaderEngine } from "#/lib/page-reader/page-reader-engine";
import {
  DEFAULT_READER_VOICE_PREFERENCE,
  parseReaderVoicePreference,
  resolveReaderVoicePreference,
} from "#/lib/reader-voice";

import type {
  OffscreenReaderMessage,
  ReaderNowPlaying,
  ReaderSnapshot,
} from "../../lib/reader-messaging";

import {
  READER_STATE_BROADCAST,
  READER_TARGET,
} from "../../lib/reader-messaging";

// The offscreen document hosts the same PageReaderEngine the app's page reader
// uses: Kokoro TTS synthesized on-device and streamed through Web Audio. It
// outlives the popup, so playback continues after the popup closes; the popup
// reattaches via `getState` + the state broadcasts below.

// onnxruntime-web loads its WASM loader module from a CDN by default, which
// the extension CSP (script-src 'self') blocks. Point it at the copies the
// build bundles under /ort/ (see wxt.config.ts `build:publicAssets`).
const ortWasm = env.backends.onnx.wasm;
if (ortWasm) ortWasm.wasmPaths = new URL("/ort/", location.href).href;

const engine = new PageReaderEngine();

let voicePreference: ReaderVoicePreference = DEFAULT_READER_VOICE_PREFERENCE;
let nowPlaying: ReaderNowPlaying | null = null;
let lastPlayback: {
  documentUri: string;
  title: string;
  author: string | null;
  text: string;
  voicePreference: ReaderVoicePreference;
} | null = null;

function snapshot(): ReaderSnapshot {
  return {
    state: engine.getState(),
    nowPlaying,
    progress: engine.getProgress(),
  };
}

engine.subscribe(() => {
  // Broadcast to whoever is listening (popup, background). No listener (popup
  // closed, background asleep) is fine — drop the error.
  void browser.runtime
    .sendMessage({ type: READER_STATE_BROADCAST, snapshot: snapshot() })
    .catch(() => {});
});

function startPlayback(message: {
  documentUri: string;
  title: string;
  author: string | null;
  text: string;
  voicePreference: ReaderVoicePreference;
}): void {
  nowPlaying = { documentUri: message.documentUri, title: message.title };
  lastPlayback = message;
  voicePreference = message.voicePreference;
  // Same flow as the app: voice detection runs concurrently with the model
  // load inside `prepare`, and playback starts on the first synthesized chunk.
  void engine.prepare(
    message.text,
    resolveReaderVoicePreference(message.author, voicePreference),
  );
}

function reprepareIfLoaded(): void {
  if (!lastPlayback) return;
  const { status } = engine.getState();
  if (status === "idle" || status === "error") return;
  void engine.prepare(
    lastPlayback.text,
    resolveReaderVoicePreference(lastPlayback.author, voicePreference),
  );
}

/**
 * Chrome closes AUDIO_PLAYBACK offscreen documents after ~30s without audio,
 * which would drop a paused article (position, synthesized buffer, and the
 * loaded model) mid-session. A near-silent loop counts as playback and keeps
 * the document alive for as long as a read-aloud session is loaded.
 */
function startKeepalive(): void {
  const Ctor = globalThis.AudioContext;
  if (Ctor === undefined) return;
  const ctx = new Ctor();
  const seconds = 1;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // ~-66dB 30Hz hum: registers as audio output, inaudible in practice.
  for (let i = 0; i < data.length; i++) {
    data[i] = 0.0005 * Math.sin((2 * Math.PI * 30 * i) / ctx.sampleRate);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(ctx.destination);
  source.start();
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as OffscreenReaderMessage;
  if (typeof msg !== "object" || msg === null || msg.target !== READER_TARGET) {
    // Not addressed to the reader — leave the response channel untouched.
    return;
  }

  switch (msg.type) {
    case "play": {
      startPlayback(msg);
      break;
    }
    case "toggle": {
      engine.toggle();
      break;
    }
    case "retry": {
      if (lastPlayback) startPlayback(lastPlayback);
      break;
    }
    case "stop": {
      nowPlaying = null;
      lastPlayback = null;
      engine.reset();
      break;
    }
    case "skip": {
      engine.skip(msg.seconds);
      break;
    }
    case "seekTo": {
      engine.seekTo(msg.seconds);
      break;
    }
    case "setRate": {
      engine.setRate(msg.rate);
      break;
    }
    case "getState": {
      return Promise.resolve(snapshot());
    }
    case "getSentences": {
      return Promise.resolve({
        documentUri: nowPlaying?.documentUri ?? null,
        sentences: engine.getSentences(),
      });
    }
  }
  return Promise.resolve({ ok: true });
});

startKeepalive();

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.readerVoice) return;
  const next = parseReaderVoicePreference(changes.readerVoice.newValue);
  if (next === voicePreference) return;
  voicePreference = next;
  reprepareIfLoaded();
});
