import { PACE_DEFAULT, clampPace } from "./pace";

export type Phase = "setup" | "practice" | "review";

export interface SavedSession {
  source: string;
  notes: string;
  rate: number;
  voiceURI: string;
  phase: Phase;
  index: number;
}

const KEY = "recall:session:v1";

export const EMPTY_SESSION: SavedSession = {
  source: "",
  notes: "",
  rate: PACE_DEFAULT,
  voiceURI: "",
  phase: "setup",
  index: 0,
};

export function loadSession(): SavedSession {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_SESSION;
    const data = JSON.parse(raw) as Partial<SavedSession>;
    const phase: Phase = data.phase === "practice" || data.phase === "review" ? data.phase : "setup";
    return {
      source: typeof data.source === "string" ? data.source : "",
      notes: typeof data.notes === "string" ? data.notes : "",
      rate: clampPace(Number(data.rate ?? PACE_DEFAULT)),
      voiceURI: typeof data.voiceURI === "string" ? data.voiceURI : "",
      phase,
      index: Number.isInteger(data.index) && (data.index as number) >= 0 ? (data.index as number) : 0,
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
