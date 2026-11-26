"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Word, groupFrom, wordAt } from "./text";
import type { useSpeech } from "./useSpeech";

/*
 * Decides what to read next.
 *
 * Dictation:   say a group of `groupSize` words (never crossing a line), then wait
 *              long enough to write them at `wpm`, then the next group.
 * Continuous:  read each line from the current word to its end, then the next line.
 *
 * Moving into a new paragraph is announced ("New paragraph."), and so is the
 * end of the answer. Positions are global word indexes across the whole
 * answer, so going back after a cough (or picking a word) can cross lines.
 */

export type PlayMode = "dictation" | "continuous";
export type PlayerState = "idle" | "speaking" | "writing" | "announcing" | "paused" | "cough" | "finished";

export const GROUP_MIN = 1;
export const GROUP_MAX = 10;
export const GROUP_DEFAULT = 3;
export const WPM_MIN = 5;
export const WPM_MAX = 60;
export const WPM_DEFAULT = 20;
export const WPM_PRESETS = [
  { label: "Slow", wpm: 12 },
  { label: "Average", wpm: 20 },
  { label: "Fast", wpm: 30 },
  { label: "Typing", wpm: 40 },
];

const NEW_PARAGRAPH_TEXT = "New paragraph.";
const FINISHED_TEXT = "The answer is finished.";
/** Standard "word" for speed measurements: 5 characters. */
const CHARS_PER_WORD = 5;
const MIN_WRITING_MS = 1500;
/** Extra time at the end of a line (dictation). */
const LINE_END_EXTRA_MS = 1500;
/** Gap between lines (continuous). */
const LINE_GAP_MS = 700;

type Speech = ReturnType<typeof useSpeech>;

interface Options {
  lines: string[];
  /** Paragraph number of each line. */
  paragraphOf: number[];
  words: Word[];
  mode: PlayMode;
  groupSize: number;
  wpm: number;
  speech: Speech;
  enabled: boolean;
}

export interface Writing {
  startedAt: number;
  ms: number;
}

function writingMs(chars: number, wpm: number, lineEnds: boolean): number {
  const cps = (wpm * CHARS_PER_WORD) / 60;
  return Math.max(MIN_WRITING_MS, (chars / cps) * 1000) + (lineEnds ? LINE_END_EXTRA_MS : 0);
}

export function usePlayer({ lines, paragraphOf, words, mode, groupSize, wpm, speech, enabled }: Options) {
  const [state, setStateValue] = useState<PlayerState>("idle");
  const [segment, setSegment] = useState<{ first: number; last: number } | null>(null);
  const [marker, setMarker] = useState<number | null>(null);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const stateRef = useRef<PlayerState>("idle");
  const segRef = useRef<{ first: number; last: number } | null>(null);
  const markerRef = useRef<number | null>(null);
  const coughFromRef = useRef(0);
  /** Word to read after the current announcement (words.length = the end). */
  const afterAnnounceRef = useRef(0);
  /** The writing pause in progress. */
  const writeRef = useRef<{ startedAt: number; chars: number; lineEnds: boolean; next: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const optsRef = useRef({ lines, paragraphOf, words, mode, groupSize, wpm, speech });
  optsRef.current = { lines, paragraphOf, words, mode, groupSize, wpm, speech };

  const setState = (s: PlayerState) => {
    stateRef.current = s;
    setStateValue(s);
  };
  const setMarkerBoth = (g: number | null) => {
    markerRef.current = g;
    setMarker(g);
  };
  const clearTimer = () => window.clearTimeout(timer.current);

  const finish = useCallback(() => {
    clearTimer();
    segRef.current = null;
    setSegment(null);
    setWriting(null);
    setAnnouncement(null);
    setState("finished");
  }, []);

  const announce = useCallback((text: string, next: number) => {
    clearTimer();
    writeRef.current = null;
    setWriting(null);
    afterAnnounceRef.current = next;
    setAnnouncement(text);
    setState("announcing");
    optsRef.current.speech.play(text, 0, text.length, { plain: true });
  }, []);

  /** Start reading at word `g`. */
  const readFrom = useCallback((g: number) => {
    const { lines, words, mode, groupSize, speech } = optsRef.current;
    clearTimer();
    writeRef.current = null;
    setWriting(null);
    setAnnouncement(null);
    setMarkerBoth(null);
    if (g >= words.length || !words.length) {
      speech.stop();
      finish();
      return;
    }
    const start = Math.max(0, g);
    const w = words[start];
    let last = start;
    if (mode === "dictation") last = groupFrom(words, start, groupSize).last;
    else while (last + 1 < words.length && words[last + 1].line === w.line) last++;

    const seg = { first: start, last };
    segRef.current = seg;
    setSegment(seg);
    setState("speaking");
    const line = lines[w.line];
    speech.play(line, w.start, mode === "dictation" ? words[last].end : line.length);
  }, [finish]);

  /** Carry on to word `next`, announcing a new paragraph or the end on the way. */
  const advance = useCallback(
    (next: number) => {
      const { words, paragraphOf } = optsRef.current;
      if (next >= words.length) return announce(FINISHED_TEXT, words.length);
      const prevLine = words[next - 1]?.line;
      if (next > 0 && paragraphOf[words[next].line] !== paragraphOf[prevLine]) {
        return announce(NEW_PARAGRAPH_TEXT, next);
      }
      readFrom(next);
    },
    [announce, readFrom],
  );

  // A piece of speech finished.
  useEffect(() => {
    if (speech.status !== "ended") return;
    const s = stateRef.current;

    if (s === "announcing") {
      const next = afterAnnounceRef.current;
      setAnnouncement(null);
      if (next >= optsRef.current.words.length) finish();
      else readFrom(next);
      return;
    }
    if (s !== "speaking") return;
    const seg = segRef.current;
    if (!seg) return;
    const { lines, words, mode, wpm } = optsRef.current;
    const next = seg.last + 1;
    const lineEnds = next >= words.length || words[next].line !== words[seg.last].line;

    if (mode === "dictation") {
      const w0 = words[seg.first];
      const chars = lines[w0.line].slice(w0.start, words[seg.last].end).replace(/\s+/g, "").length;
      const startedAt = performance.now();
      const ms = writingMs(chars, wpm, lineEnds);
      writeRef.current = { startedAt, chars, lineEnds, next };
      setWriting({ startedAt, ms });
      setState("writing");
      timer.current = window.setTimeout(() => advance(next), ms);
    } else {
      timer.current = window.setTimeout(() => advance(next), lineEnds ? LINE_GAP_MS : 0);
    }
  }, [speech.status, advance, readFrom, finish]);

  // Writing speed changed during a writing pause: update the time left right away.
  useEffect(() => {
    const w = writeRef.current;
    if (stateRef.current !== "writing" || !w) return;
    const ms = writingMs(w.chars, wpm, w.lineEnds);
    const left = Math.max(0, ms - (performance.now() - w.startedAt));
    clearTimer();
    setWriting({ startedAt: w.startedAt, ms });
    timer.current = window.setTimeout(() => advance(w.next), left);
  }, [wpm, advance]);

  // Speech failed: switch to paused at that word so Resume tries again.
  useEffect(() => {
    if (speech.status !== "error") return;
    const s = stateRef.current;
    if (s !== "speaking" && s !== "announcing") return;
    clearTimer();
    const seg = segRef.current;
    setMarkerBoth(s === "announcing" ? Math.min(afterAnnounceRef.current, optsRef.current.words.length - 1) : seg ? seg.first : 0);
    setAnnouncement(null);
    setState("paused");
  }, [speech.status]);

  // Stop everything when leaving the practice screen.
  useEffect(() => {
    if (enabled) return;
    clearTimer();
    setState("idle");
    setWriting(null);
    setAnnouncement(null);
    setMarkerBoth(null);
    writeRef.current = null;
    segRef.current = null;
    setSegment(null);
  }, [enabled]);

  useEffect(() => () => clearTimer(), []);

  /** The word being read now (speaking) or the next one to read (writing / gaps). */
  const currentWord = useCallback((): number | null => {
    const { words, speech } = optsRef.current;
    const seg = segRef.current;
    if (!seg) return null;
    if (stateRef.current === "speaking") {
      if (!speech.isActive()) return seg.last + 1; // between pieces
      return Math.max(seg.first, wordAt(words, words[seg.first].line, speech.currentOffset()));
    }
    if (stateRef.current === "writing") return seg.last + 1;
    return null;
  }, []);

  const pause = useCallback(() => {
    const s = stateRef.current;
    if (s !== "speaking" && s !== "writing" && s !== "cough" && s !== "announcing") return;
    const { words, speech } = optsRef.current;
    clearTimer();
    speech.stop();
    setWriting(null);
    setAnnouncement(null);
    writeRef.current = null;
    if (s === "announcing" && afterAnnounceRef.current >= words.length) {
      finish();
      return;
    }
    const at = s === "cough" ? coughFromRef.current : s === "announcing" ? afterAnnounceRef.current : currentWord() ?? 0;
    setMarkerBoth(Math.min(at, words.length - 1));
    setState("paused");
  }, [currentWord, finish]);

  const resume = useCallback(() => {
    if (stateRef.current !== "paused") return;
    readFrom(markerRef.current ?? 0);
  }, [readFrom]);

  /** Choose the word to continue from. Pauses first if needed. */
  const pick = useCallback(
    (g: number) => {
      const s = stateRef.current;
      if (s === "speaking" || s === "writing" || s === "cough" || s === "announcing") pause();
      if (stateRef.current !== "paused") setState("paused");
      setMarkerBoth(Math.max(0, Math.min(g, optsRef.current.words.length - 1)));
    },
    [pause],
  );

  /** Move the chosen word: by words (±1) or to the start of the previous/next line. */
  const moveMarker = useCallback((by: "prev" | "next" | "up" | "down") => {
    if (stateRef.current !== "paused") return;
    const { words } = optsRef.current;
    if (!words.length) return;
    const g = Math.min(markerRef.current ?? 0, words.length - 1);
    let n = g;
    if (by === "prev") n = g - 1;
    else if (by === "next") n = g + 1;
    else {
      const line = words[g].line + (by === "up" ? -1 : 1);
      const i = words.findIndex((w) => w.line === line);
      if (i >= 0) n = i;
    }
    setMarkerBoth(Math.max(0, Math.min(n, words.length - 1)));
  }, []);

  // --- coughs ---------------------------------------------------------------
  /** What the cough detector records for each moment: the word being read (or next to read). */
  const snapshot = useCallback((): number | null => currentWord(), [currentWord]);

  /** First cough heard: stop at once and remember where it happened. */
  const coughStart = useCallback((g: number) => {
    const s = stateRef.current;
    if (s !== "speaking" && s !== "writing") return;
    clearTimer();
    optsRef.current.speech.stop();
    setWriting(null);
    writeRef.current = null;
    coughFromRef.current = g;
    setState("cough");
  }, []);

  /** Coughing is over: go back N words (×2 for two or more coughs) and carry on. */
  const coughEnd = useCallback(
    (count: number, wordsBack: number) => {
      if (stateRef.current !== "cough") return;
      const back = wordsBack * (count >= 2 ? 2 : 1);
      readFrom(Math.max(0, coughFromRef.current - back));
    },
    [readFrom],
  );

  const stop = useCallback(() => {
    clearTimer();
    optsRef.current.speech.stop();
    setWriting(null);
    setAnnouncement(null);
    setMarkerBoth(null);
    writeRef.current = null;
    segRef.current = null;
    setSegment(null);
    setState("idle");
  }, []);

  return {
    state, segment, marker, writing, announcement,
    readFrom, pause, resume, pick, moveMarker, snapshot, coughStart, coughEnd, stop,
  };
}
