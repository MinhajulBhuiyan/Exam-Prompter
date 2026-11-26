export const PACE_MIN = 0.5;
export const PACE_MAX = 1.5;
export const PACE_STEP = 0.05;
export const PACE_DEFAULT = 0.9;

/** Typical speech-synthesis words per minute at rate 1. */
const BASE_WPM = 165;

export function clampPace(value: number): number {
  if (!Number.isFinite(value)) return PACE_DEFAULT;
  return Math.min(PACE_MAX, Math.max(PACE_MIN, Math.round(value / PACE_STEP) * PACE_STEP));
}

export function paceLabel(rate: number): string {
  if (rate < 0.7) return "Very slow";
  if (rate < 0.875) return "Slow";
  if (rate <= 1.125) return "Normal";
  if (rate <= 1.3) return "Quick";
  return "Fast";
}

export function wordsPerMinute(rate: number): number {
  return Math.round(BASE_WPM * rate);
}

export function formatDuration(words: number, rate: number): string {
  const seconds = Math.max(1, Math.round((words / wordsPerMinute(rate)) * 60));
  if (seconds < 60) return `${seconds} sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}
