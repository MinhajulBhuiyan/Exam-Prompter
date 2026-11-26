"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkForSpeech, wordStartAt } from "./text";

/*
 * Wrapper around window.speechSynthesis for one sentence at a time.
 *
 * Pause, resume and pace changes are all done the same way: remember the
 * start of the word currently being spoken, cancel, and speak again from
 * that word. Native pause()/resume() is unreliable (broken on Android Chrome,
 * and it can't change the rate mid-utterance), so this behaves the same
 * everywhere.
 *
 * The current word comes from `boundary` events when the voice provides
 * them. Some voices (e.g. Chrome's online Google voices) don't, so then the
 * position is estimated from elapsed time within the current chunk.
 */

export type SpeechStatus = "idle" | "starting" | "speaking" | "paused" | "ended" | "error";

/** Rough characters per second at rate 1, used only when no boundary events arrive. */
const CHARS_PER_SECOND = 14;
/** Wait for the slider to settle before restarting speech at the new pace. */
const PACE_SETTLE_MS = 280;
const SLOW_START_MS = 4500;

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
}

export function useSpeech({ rate, voiceURI }: Options) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatusState] = useState<SpeechStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slowStart, setSlowStart] = useState(false);
  const [paceNotice, setPaceNotice] = useState<number | null>(null);

  const statusRef = useRef<SpeechStatus>("idle");
  const genRef = useRef(0);
  const textRef = useRef("");
  const rateRef = useRef(rate);
  const voiceURIRef = useRef(voiceURI);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Position tracking for the utterance chunk that is playing now.
  const activeRateRef = useRef(rate);
  const chunkStartRef = useRef(0);
  const chunkEndRef = useRef(0);
  const chunkTimeRef = useRef<number | null>(null);
  const boundaryRef = useRef(false);
  const posRef = useRef(0);
  const resumeAtRef = useRef(0);

  const paceTimer = useRef<number | undefined>(undefined);
  const slowTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);

  const setStatus = useCallback((s: SpeechStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  voiceURIRef.current = voiceURI;

  // --- voices -------------------------------------------------------------
  useEffect(() => {
    const ok = isSpeechSupported();
    setSupported(ok);
    if (!ok) return;
    const synth = window.speechSynthesis;
    const update = () => {
      const list = synth.getVoices();
      voicesRef.current = list;
      setVoices(list);
    };
    update();
    synth.addEventListener?.("voiceschanged", update);
    // Safari doesn't always fire voiceschanged; poll briefly as a fallback.
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
      window.clearTimeout(paceTimer.current);
      window.clearTimeout(slowTimer.current);
      window.clearTimeout(noticeTimer.current);
    };
  }, []);

  // --- position -----------------------------------------------------------
  const currentOffset = useCallback((): number => {
    const s = statusRef.current;
    if (s === "paused") return resumeAtRef.current;
    if (s === "ended") return textRef.current.length;
    if (boundaryRef.current) return posRef.current;
    if (chunkTimeRef.current === null) return chunkStartRef.current;
    const elapsed = (performance.now() - chunkTimeRef.current) / 1000;
    const estimate = chunkStartRef.current + elapsed * CHARS_PER_SECOND * activeRateRef.current;
    return Math.min(estimate, chunkEndRef.current);
  }, []);

  useEffect(() => {
    if (status === "idle") { setProgress(0); return; }
    if (status === "ended") { setProgress(1); return; }
    const tick = () => {
      const len = textRef.current.length || 1;
      setProgress(Math.min(1, currentOffset() / len));
    };
    tick();
    if (status !== "speaking") return;
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, [status, currentOffset]);

  // --- speaking -----------------------------------------------------------
  const speakFrom = useCallback(
    (offset: number, pace: number) => {
      if (!isSpeechSupported()) return;
      const synth = window.speechSynthesis;
      const gen = ++genRef.current;
      const text = textRef.current;
      window.clearTimeout(paceTimer.current);
      window.clearTimeout(slowTimer.current);
      setError(null);
      setSlowStart(false);

      const chunks = chunkForSpeech(text, offset);
      if (!chunks.length) {
        synth.cancel();
        setStatus("ended");
        return;
      }

      activeRateRef.current = pace;
      chunkStartRef.current = chunks[0].start;
      chunkEndRef.current = chunks[0].end;
      chunkTimeRef.current = null;
      boundaryRef.current = false;
      posRef.current = chunks[0].start;
      setStatus("starting");

      const voice = voicesRef.current.find((v) => v.voiceURI === voiceURIRef.current) ?? null;
      const stale = () => gen !== genRef.current;

      const queue = () => {
        if (stale()) return;
        chunks.forEach((chunk, i) => {
          const u = new SpeechSynthesisUtterance(chunk.text);
          u.rate = pace;
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang;
          }
          u.onstart = () => {
            if (stale()) return;
            window.clearTimeout(slowTimer.current);
            setSlowStart(false);
            chunkStartRef.current = chunk.start;
            chunkEndRef.current = chunk.end;
            chunkTimeRef.current = performance.now();
            boundaryRef.current = false;
            posRef.current = chunk.start;
            if (statusRef.current !== "speaking") setStatus("speaking");
          };
          u.onboundary = (e) => {
            if (stale()) return;
            if (e.name && e.name !== "word") return;
            boundaryRef.current = true;
            posRef.current = chunk.start + e.charIndex;
          };
          u.onend = () => {
            if (stale() || i !== chunks.length - 1) return;
            chunkTimeRef.current = null;
            setStatus("ended");
          };
          u.onerror = (e) => {
            if (stale()) return;
            if (e.error === "interrupted" || e.error === "canceled") return;
            genRef.current++;
            synth.cancel();
            window.clearTimeout(slowTimer.current);
            setError(describeError(e.error));
            setStatus("error");
          };
          synth.speak(u);
        });
        slowTimer.current = window.setTimeout(() => {
          if (!stale() && statusRef.current === "starting") setSlowStart(true);
        }, SLOW_START_MS);
      };

      if (synth.speaking || synth.pending) {
        // Chrome can drop an utterance queued in the same tick as cancel().
        synth.cancel();
        window.setTimeout(queue, 70);
      } else {
        // Speak synchronously so iOS Safari treats it as part of the user's tap.
        synth.cancel();
        queue();
      }
    },
    [setStatus],
  );

  /** Speak `text` from the beginning. */
  const play = useCallback(
    (text: string) => {
      textRef.current = text;
      resumeAtRef.current = 0;
      speakFrom(0, rateRef.current);
    },
    [speakFrom],
  );

  const pause = useCallback(() => {
    const s = statusRef.current;
    if (s !== "speaking" && s !== "starting") return;
    const at = wordStartAt(textRef.current, currentOffset());
    genRef.current++;
    window.clearTimeout(paceTimer.current);
    window.clearTimeout(slowTimer.current);
    setSlowStart(false);
    window.speechSynthesis.cancel();
    resumeAtRef.current = at;
    setStatus("paused");
  }, [currentOffset, setStatus]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    speakFrom(resumeAtRef.current, rateRef.current);
  }, [speakFrom]);

  const stop = useCallback(() => {
    genRef.current++;
    window.clearTimeout(paceTimer.current);
    window.clearTimeout(slowTimer.current);
    setSlowStart(false);
    setError(null);
    if (isSpeechSupported()) window.speechSynthesis.cancel();
    resumeAtRef.current = 0;
    setStatus("idle");
  }, [setStatus]);

  // --- live pace ----------------------------------------------------------
  useEffect(() => {
    if (rateRef.current === rate) return;
    rateRef.current = rate;
    const s = statusRef.current;
    if (s !== "speaking" && s !== "starting") return; // paused: resume() picks up the new pace
    window.clearTimeout(paceTimer.current);
    paceTimer.current = window.setTimeout(() => {
      const now = statusRef.current;
      if (now !== "speaking" && now !== "starting") return;
      if (activeRateRef.current === rateRef.current) return;
      const at = wordStartAt(textRef.current, currentOffset());
      speakFrom(at, rateRef.current);
      setPaceNotice(rateRef.current);
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setPaceNotice(null), 2200);
    }, PACE_SETTLE_MS);
  }, [rate, currentOffset, speakFrom]);

  return { supported, voices, status, progress, error, slowStart, paceNotice, play, pause, resume, stop };
}

function describeError(code: string): string {
  switch (code) {
    case "not-allowed":
      return "The browser blocked speech. Tap Play to start it yourself.";
    case "audio-busy":
    case "audio-hardware":
      return "Your device's audio isn't available right now. Check your sound settings and try again.";
    case "synthesis-unavailable":
    case "synthesis-failed":
    case "voice-unavailable":
      return "This voice couldn't be used. Try another voice on the setup screen.";
    case "network":
      return "This voice needs an internet connection. Try a different voice or reconnect.";
    case "language-unavailable":
      return "No voice is available for this language. Try a different voice.";
    default:
      return "Speech stopped unexpectedly. Try playing the sentence again.";
  }
}
