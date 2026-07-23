/**
 * Kokoro American English voices shipped in `kokoro-js`, with quality grades from
 * [hexgrad/Kokoro-82M VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).
 */
export const AMERICAN_ENGLISH_VOICE_IDS = [
  "af_heart",
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_fenrir",
  "am_liam",
  "am_michael",
  "am_onyx",
  "am_puck",
  "am_santa",
] as const;

export type ReaderVoice = (typeof AMERICAN_ENGLISH_VOICE_IDS)[number];

export interface ReaderVoiceMeta {
  id: ReaderVoice;
  name: string;
  overallGrade: string;
  gender: "female" | "male";
}

/** Sorted by overall grade (best first), then name. */
export const AMERICAN_ENGLISH_VOICES: ReadonlyArray<ReaderVoiceMeta> = [
  { id: "af_heart", name: "Heart", overallGrade: "A", gender: "female" },
  { id: "af_bella", name: "Bella", overallGrade: "A-", gender: "female" },
  { id: "af_nicole", name: "Nicole", overallGrade: "B-", gender: "female" },
  { id: "af_aoede", name: "Aoede", overallGrade: "C+", gender: "female" },
  { id: "af_kore", name: "Kore", overallGrade: "C+", gender: "female" },
  { id: "af_sarah", name: "Sarah", overallGrade: "C+", gender: "female" },
  { id: "am_fenrir", name: "Fenrir", overallGrade: "C+", gender: "male" },
  { id: "am_michael", name: "Michael", overallGrade: "C+", gender: "male" },
  { id: "am_puck", name: "Puck", overallGrade: "C+", gender: "male" },
  { id: "af_alloy", name: "Alloy", overallGrade: "C", gender: "female" },
  { id: "af_nova", name: "Nova", overallGrade: "C", gender: "female" },
  { id: "af_sky", name: "Sky", overallGrade: "C-", gender: "female" },
  { id: "af_jessica", name: "Jessica", overallGrade: "D", gender: "female" },
  { id: "af_river", name: "River", overallGrade: "D", gender: "female" },
  { id: "am_echo", name: "Echo", overallGrade: "D", gender: "male" },
  { id: "am_eric", name: "Eric", overallGrade: "D", gender: "male" },
  { id: "am_liam", name: "Liam", overallGrade: "D", gender: "male" },
  { id: "am_onyx", name: "Onyx", overallGrade: "D", gender: "male" },
  { id: "am_santa", name: "Santa", overallGrade: "D-", gender: "male" },
  { id: "am_adam", name: "Adam", overallGrade: "F+", gender: "male" },
];

export function readerVoiceLabel(id: ReaderVoice): string {
  return AMERICAN_ENGLISH_VOICES.find((voice) => voice.id === id)?.name ?? id;
}
