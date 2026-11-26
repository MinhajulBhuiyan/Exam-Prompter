import { PACE_DEFAULT, clampPace } from "./pace";
import type { Sensitivity } from "./useCoughDetector";
import { GROUP_DEFAULT, GROUP_MAX, GROUP_MIN, type PlayMode, WPM_DEFAULT, WPM_MAX, WPM_MIN } from "./usePlayer";

export type Phase = "setup" | "practice";

export interface CoughSettings {
  enabled: boolean;
  sensitivity: Sensitivity;
  wordsBack: number;
}

export interface SavedSession {
  source: string;
  rate: number;
  voiceURI: string;
  cough: CoughSettings;
  /** Show the answer's words on the prompter (false = only show which line is being read). */
  showText: boolean;
  /** Say punctuation marks aloud ("comma", "full stop"…). */
  readPunctuation: boolean;
  mode: PlayMode;
  /** Dictation: words read at a time. */
  groupSize: number;
  /** Dictation: writing speed in words per minute. */
  wpm: number;
}

const KEY = "recall:session:v1";

export const DEFAULT_COUGH: CoughSettings = { enabled: false, sensitivity: "high", wordsBack: 3 };

export const EMPTY_SESSION: SavedSession = {
  source: "",
  rate: PACE_DEFAULT,
  voiceURI: "",
  cough: DEFAULT_COUGH,
  showText: true,
  readPunctuation: true,
  mode: "dictation",
  groupSize: GROUP_DEFAULT,
  wpm: WPM_DEFAULT,
};

/** Earlier versions saved the writing speed as a name. */
const OLD_SPEEDS: Record<string, number> = { slow: 12, average: 20, fast: 30, typing: 40 };

const intIn = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

function readCough(raw: unknown): CoughSettings {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<CoughSettings>;
  return {
    enabled: c.enabled === true,
    sensitivity: c.sensitivity === "low" || c.sensitivity === "medium" ? c.sensitivity : "high",
    wordsBack: intIn(c.wordsBack, 1, 5, DEFAULT_COUGH.wordsBack),
  };
}

export function loadSession(): SavedSession {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_SESSION;
    const data = JSON.parse(raw) as Partial<SavedSession> & { writingSpeed?: string };
    return {
      source: typeof data.source === "string" ? data.source : "",
      rate: clampPace(Number(data.rate ?? PACE_DEFAULT)),
      voiceURI: typeof data.voiceURI === "string" ? data.voiceURI : "",
      cough: readCough(data.cough),
      showText: data.showText !== false,
      readPunctuation: data.readPunctuation !== false,
      mode: data.mode === "continuous" ? "continuous" : "dictation",
      groupSize: intIn(data.groupSize, GROUP_MIN, GROUP_MAX, GROUP_DEFAULT),
      wpm: intIn(data.wpm ?? OLD_SPEEDS[data.writingSpeed ?? ""], WPM_MIN, WPM_MAX, WPM_DEFAULT),
    };
  } catch {
    return EMPTY_SESSION;
  }
}

export function saveSession(session: SavedSession): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
