"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkForSpeech, wordStartAt } from "./text";
import { type SpokenText, plainSpoken, speakPunctuation } from "./punctuation";
import { type Accent, isEnglishVoice, pickVoice } from "./voices";

/*
 * Speaks part of one line with window.speechSynthesis.
 *
 * - `play(line, from, to)` speaks characters [from, to) of the line.
 * - With "read punctuation" on, marks are spoken by name with a short break
 *   before them; positions are mapped back to the original line.
 * - Pace changes apply immediately: speech restarts from the start of the
 *   word being spoken, at the new pace, up to the same end point.
 *
 * Pausing, coughs and what to read next are handled by the caller
 * (see usePlayer); this hook only reports where it is and when it's done.
 *
 * The current word comes from `boundary` events when the voice provides them;
 * otherwise it is estimated from elapsed time within the current piece.
 */

export type SpeechStatus = "idle" | "starting" | "speaking" | "ended" | "error";

/** Rough characters per second at rate 1, used only when no boundary events arrive. */
const CHARS_PER_SECOND = 14;
/** Wait for the slider to settle before restarting speech at the new pace. */
const PACE_SETTLE_MS = 280;
const SLOW_START_MS = 4500;
/** Short break before a spoken punctuation mark, at pace 1. */
const PUNCTUATION_BREAK_MS = 200;

export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

interface Options {
  rate: number;
  voiceURI: string;
  readPunctuation: boolean;
  /** Used when no specific voice is chosen. */
  accent: Accent;
}

export function useSpeech({ rate, voiceURI, readPunctuation, accent }: Options) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatusState] = useState<SpeechStatus>("idle");
  /** Character in the original line where the word being spoken starts. */
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slowStart, setSlowStart] = useState(false);
  const [paceNotice, setPaceNotice] = useState<number | null>(null);

  const statusRef = useRef<SpeechStatus>("idle");
  const genRef = useRef(0);
  const spokenRef = useRef<SpokenText>(plainSpoken(""));
  const endRef = useRef(0); // spoken-text end of the current range
  const rateRef = useRef(rate);
  const voiceURIRef = useRef(voiceURI);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const punctuationRef = useRef(readPunctuation);
  const accentRef = useRef(accent);
  accentRef.current = accent;
  voiceURIRef.current = voiceURI;
  punctuationRef.current = readPunctuation;

  // Position tracking for the piece being spoken.
  const activeRateRef = useRef(rate);
  const pieceStartRef = useRef(0);
  const pieceEndRef = useRef(0);
  const pieceTimeRef = useRef<number | null>(null);
  const boundaryRef = useRef(false);
  const posRef = useRef(0);

  const timers = useRef<number[]>([]);
  const paceTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);

  const setStatus = useCallback((s: SpeechStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    window.clearTimeout(paceTimer.current);
  };

  // --- voices -------------------------------------------------------------
  useEffect(() => {
    const ok = isSpeechSupported();
    setSupported(ok);
    if (!ok) return;
    const synth = window.speechSynthesis;
    const update = () => {
      const list = synth.getVoices().filter(isEnglishVoice);
      voicesRef.current = list;
      setVoices(list);
    };
    update();
    synth.addEventListener?.("voiceschanged", update);
    let tries = 0;
    const poll = window.setInterval(() => {
      if (voicesRef.current.length || ++tries > 10) window.clearInterval(poll);
      else update();
    }, 300);
    const stopOnLeave = () => synth.cancel();
    window.addEventListener("pagehide", stopOnLeave);
    return () => {
      synth.removeEventListener?.("voiceschanged", update);
      window.clearInterval(poll);
      window.removeEventListener("pagehide", stopOnLeave);
      genRef.current++;
      synth.cancel();
      clearTimers();
      window.clearTimeout(noticeTimer.current);
    };
  }, []);

  // --- position -----------------------------------------------------------
  /** Current position in the spoken text. */
  const spokenOffset = useCallback((): number => {
    if (statusRef.current === "ended") return endRef.current;
    if (boundaryRef.current) return posRef.current;
    if (pieceTimeRef.current === null) return pieceStartRef.current;
    const elapsed = (performance.now() - pieceTimeRef.current) / 1000;
    return Math.min(pieceStartRef.current + elapsed * CHARS_PER_SECOND * activeRateRef.current, pieceEndRef.current);
  }, []);

  /** Start of the word being spoken, as a character index in the original line. */
  const currentOffset = useCallback((): number => {
    const { text, map } = spokenRef.current;
    const at = wordStartAt(text, spokenOffset());
    return map[Math.max(0, Math.min(map.length - 1, at))] ?? 0;
  }, [spokenOffset]);

  useEffect(() => {
    if (status !== "speaking" && status !== "starting") return;
    const tick = () => setPosition(currentOffset());
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [status, currentOffset]);

  // --- speaking -----------------------------------------------------------
  const speakFrom = useCallback(
    (spokenFrom: number, pace: number) => {
      if (!isSpeechSupported()) return;
      const synth = window.speechSynthesis;
      const gen = ++genRef.current;
      const stale = () => gen !== genRef.current;
      clearTimers();
      setError(null);
      setSlowStart(false);

      const { text, breaks } = spokenRef.current;
      const pieces = chunkForSpeech(text, spokenFrom, endRef.current, breaks);
      if (!pieces.length) {
        synth.cancel();
        setStatus("ended");
        return;
      }

      activeRateRef.current = pace;
      pieceStartRef.current = pieces[0].start;
      pieceEndRef.current = pieces[0].end;
      pieceTimeRef.current = null;
      boundaryRef.current = false;
      posRef.current = pieces[0].start;
      setStatus("starting");

      const voice =
        voicesRef.current.find((v) => v.voiceURI === voiceURIRef.current) ?? pickVoice(voicesRef.current, accentRef.current);
      // Online voices already pause while each piece loads, so no extra break for them.
      const breakMs = voice && !voice.localService ? 0 : PUNCTUATION_BREAK_MS / pace;

      const speakPiece = (i: number) => {
        if (stale()) return;
        const piece = pieces[i];
        const u = new SpeechSynthesisUtterance(piece.text);
        u.rate = pace;
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else {
          u.lang = "en-US";
        }
        u.onstart = () => {
          if (stale()) return;
          setSlowStart(false);
          pieceStartRef.current = piece.start;
          pieceEndRef.current = piece.end;
          pieceTimeRef.current = performance.now();
          boundaryRef.current = false;
          posRef.current = piece.start;
          if (statusRef.current !== "speaking") setStatus("speaking");
        };
        u.onboundary = (e) => {
          if (stale() || (e.name && e.name !== "word")) return;
          boundaryRef.current = true;
          posRef.current = piece.start + e.charIndex;
        };
        u.onend = () => {
          if (stale()) return;
          if (i === pieces.length - 1) {
            pieceTimeRef.current = null;
            setStatus("ended");
            return;
          }
          // Hold the position at the next piece while waiting.
          const next = pieces[i + 1];
          pieceStartRef.current = next.start;
          pieceEndRef.current = next.start;
          pieceTimeRef.current = null;
          boundaryRef.current = false;
          const wait = next.breakBefore ? breakMs : 0;
          if (wait > 0) timers.current.push(window.setTimeout(() => speakPiece(i + 1), wait));
          else speakPiece(i + 1);
        };
        u.onerror = (e) => {
          if (stale() || e.error === "interrupted" || e.error === "canceled") return;
          genRef.current++;
          synth.cancel();
          setError(describeError(e.error));
          setStatus("error");
        };
        synth.speak(u);
      };

      const begin = () => {
        speakPiece(0);
        timers.current.push(
          window.setTimeout(() => {
            if (!stale() && statusRef.current === "starting") setSlowStart(true);
          }, SLOW_START_MS),
        );
      };

      if (synth.speaking || synth.pending) {
        // Chrome can drop an utterance queued in the same tick as cancel().
        synth.cancel();
        timers.current.push(window.setTimeout(begin, 70));
      } else {
        // Speak synchronously so iOS Safari treats it as part of the user's tap.
        synth.cancel();
        begin();
      }
    },
    [setStatus],
  );

  /**
   * Speak characters [from, to) of `line` (original-text positions).
   * `plain` skips spoken punctuation (for announcements like "New paragraph.").
   */
  const play = useCallback(
    (line: string, from = 0, to = line.length, opts?: { plain?: boolean }) => {
      const spoken = punctuationRef.current && !opts?.plain ? speakPunctuation(line) : plainSpoken(line);
      spokenRef.current = spoken;
      const toSpoken = (orig: number) => {
        const i = spoken.map.findIndex((m) => m >= orig);
        return i < 0 ? spoken.text.length : i;
      };
      endRef.current = to >= line.length ? spoken.text.length : toSpoken(to);
      setPosition(from);
      speakFrom(toSpoken(from), rateRef.current);
    },
    [speakFrom],
  );

  const stop = useCallback(() => {
    genRef.current++;
    clearTimers();
    setSlowStart(false);
    setError(null);
    if (isSpeechSupported()) window.speechSynthesis.cancel();
    setStatus("idle");
  }, [setStatus]);

  const isSpeaking = useCallback(() => statusRef.current === "speaking", []);
  const isActive = useCallback(() => statusRef.current === "speaking" || statusRef.current === "starting", []);

  // --- live pace ----------------------------------------------------------
  useEffect(() => {
    if (rateRef.current === rate) return;
    rateRef.current = rate;
    if (!isActive()) return;
    window.clearTimeout(paceTimer.current);
    paceTimer.current = window.setTimeout(() => {
      if (!isActive() || activeRateRef.current === rateRef.current) return;
      speakFrom(wordStartAt(spokenRef.current.text, spokenOffset()), rateRef.current);
      setPaceNotice(rateRef.current);
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setPaceNotice(null), 2200);
    }, PACE_SETTLE_MS);
  }, [rate, isActive, spokenOffset, speakFrom]);

  return {
    supported, voices, status, position, error, slowStart, paceNotice,
    play, stop, currentOffset, isSpeaking, isActive,
  };
}

function describeError(code: string): string {
  switch (code) {
    case "not-allowed":
      return "The browser blocked speech. Press Resume to start it yourself.";
    case "audio-busy":
    case "audio-hardware":
      return "Your device's audio isn't available right now. Check your sound settings and try again.";
    case "synthesis-unavailable":
    case "synthesis-failed":
    case "voice-unavailable":
      return "This voice couldn't be used. Try another voice on the answer page.";
    case "network":
      return "This voice needs an internet connection. Try a different voice or reconnect.";
    case "language-unavailable":
      return "No English voice is available. Try a different voice.";
    default:
      return "Speech stopped unexpectedly. Press Resume to try again.";
  }
}
