"use client";

import { useEffect, useRef, useState } from "react";
import { YAMNET_WINDOW, coughScores, loadCoughModel, resampleTo16k } from "./coughModel";

/*
 * Cough detection, entirely on this device. Two ways to notice a cough:
 *
 * A. Loudness ("the bar crosses the line"): a SHORT sound (0.1–1 s) that rises
 *    above the line on the level meter. The model then only has to rule out
 *    sounds that are clearly something else (talking, laughing, typing,
 *    writing). This catches slight coughs the model alone would miss.
 *    It's switched off while Recall speaks if the mic can hear Recall's voice
 *    (laptop speakers), because then the voice itself fills the bar.
 *
 * B. Model: every HOP, the last ~1 s is scored by YAMNet; a clear "Cough" that
 *    beats similar sounds counts even if it never crossed the line.
 *
 * On a cough, `onCoughStart` fires with the reading position at the moment
 * the cough began. Further coughs are counted from loudness until it has been
 * quiet for COUGH_GAP_MS; then `onCoughEnd` reports how many there were.
 */

export type Sensitivity = "low" | "medium" | "high";
export type DetectorState = "off" | "loading" | "listening" | "error";

const BLOCK = 1024;
/** Full meter = this many dB above the room's background. */
const METER_RANGE_DB = 30;
/** Where the trigger line sits on the meter (0–1), per sensitivity. */
export const TRIGGER_LINE: Record<Sensitivity, number> = { high: 0.4, medium: 0.6, low: 0.8 };
/** A loud sound only counts if it's this short (coughs are; talking isn't). */
const MIN_BURST_MS = 100;
const MAX_BURST_MS = 1000;
/** Audio kept from before the sound started, for the model check. */
const PRE_ROLL_S = 0.3;
/** It's "clearly something else" when the model is this sure of talking/typing/etc. */
const NOT_COUGH_SURE = 0.35;
/** Coughs closer together than this count as one coughing fit. */
const COUGH_GAP_MS = 1000;
/** Never wait longer than this before going back. */
const MAX_FIT_MS = 4000;

// Model-only path (B): minimum "Cough" score, and how clearly it must beat the
// closest similar sound. Tested on recorded coughs vs. speech, mumbling,
// typing, laughing and breathing: no non-cough passed, 3 of 4 coughs did.
const COUGH_SCORE: Record<Sensitivity, number> = { high: 0.05, medium: 0.1, low: 0.2 };
const RIVAL_MARGIN = 0.05;

interface Options<T> {
  active: boolean;
  sensitivity: Sensitivity;
  /** Is Recall's voice playing right now? */
  isSpeaking: () => boolean;
  /** Where reading is right now, recorded for every audio block (null = ignore coughs). */
  snapshot: () => T | null;
  onCoughStart: (moment: T) => void;
  onCoughEnd: (moment: T, count: number) => void;
}

const TAP_WORKLET = `
class RecallTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${BLOCK}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === ${BLOCK}) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("recall-tap", RecallTap);
`;

const toDb = (sumSquares: number, n: number) => 20 * Math.log10(Math.sqrt(sumSquares / n) + 1e-9);

export function useCoughDetector<T>(opts: Options<T>) {
  const [state, setState] = useState<DetectorState>("off");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [hearsVoice, setHearsVoice] = useState(false);
  const [coughing, setCoughing] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!opts.active) {
      setState("off");
      setLevel(0);
      setHearsVoice(false);
      setCoughing(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cleanupNode: (() => void) | null = null;
    let hopSeconds = 0.25;
    let modelReady = false;

    setState("loading");
    setError(null);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
      const [media] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        }),
        loadCoughModel().then(({ backend }) => {
          modelReady = true;
          hopSeconds = backend === "webgl" ? 0.25 : 0.5; // go easier on slow devices
        }),
      ]);
      stream = media;
      if (cancelled) return;

      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const rate = ctx.sampleRate;
      const blockMs = (BLOCK / rate) * 1000;
      const source = ctx.createMediaStreamSource(media);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      mute.connect(ctx.destination);

      // ---- analysis state ----
      const ring = new Float32Array(Math.ceil(rate * 3));
      const need = Math.ceil((YAMNET_WINDOW / 16000) * rate);
      let total = 0;
      /** Per-block history: start sample, level, and reading position. */
      const history: { at: number; db: number; snap: T | null }[] = [];
      let floor = NaN;
      let nextCheckAt = 0;
      let ignoreBefore = 0;
      let classifying = false;
      let lastMeter = 0;
      // Own-voice check.
      let voiceLevel = NaN;
      let voiceBlocks = 0;
      let echo = false;
      // Loudness trigger (A).
      let loudStart: number | null = null; // first sample above the line
      let loudBlocks = 0;
      let candidate: number | null = null; // onset of a short loud sound waiting for the model
      // Current coughing fit.
      let fit: {
        moment: T;
        startedAt: number;
        count: number;
        inBurst: boolean;
        above: number;
        below: number;
        lastBurstEnd: number;
      } | null = null;

      const lineDb = () => TRIGGER_LINE[optsRef.current.sensitivity] * METER_RANGE_DB;

      const clipAt = (from: number): Float32Array => {
        const out = new Float32Array(need);
        const lo = Math.max(from, total - ring.length);
        const hi = Math.min(total, from + need);
        for (let i = lo; i < hi; i++) out[i - from] = ring[i % ring.length];
        return resampleTo16k(out, rate).subarray(0, YAMNET_WINDOW);
      };

      /** Reading position when a sound started (latest one recorded at or before it). */
      const momentAt = (onset: number): T | null => {
        let moment: T | null = null;
        for (const h of history) {
          if (h.at > onset) break;
          if (h.snap !== null) moment = h.snap;
        }
        return moment ?? history.find((h) => h.at >= onset && h.snap !== null)?.snap ?? null;
      };

      /** Feed one block's level into the cough counter of the current fit. */
      const countBurst = (db: number, now: number) => {
        if (!fit) return;
        if (db > floor + lineDb() * 0.75) {
          fit.above++;
          fit.below = 0;
          if (!fit.inBurst && fit.above >= 2) {
            fit.inBurst = true;
            fit.count++;
          }
        } else {
          fit.below++;
          fit.above = 0;
          if (fit.inBurst && fit.below >= 5) {
            fit.inBurst = false;
            fit.lastBurstEnd = now;
          }
        }
      };

      /** A cough starting at sample `onset`: stop reading and start counting. */
      const beginFit = (onset: number) => {
        const moment = momentAt(onset);
        if (moment === null) return; // paused or finished: coughs don't matter
        const now = performance.now();
        fit = { moment, startedAt: now, count: 0, inBurst: false, above: 0, below: 0, lastBurstEnd: now };
        for (const h of history) if (h.at >= onset) countBurst(h.db, now);
        if (fit.count === 0) fit.count = 1;
        candidate = null;
        loudStart = null;
        loudBlocks = 0;
        setCoughing(true);
        optsRef.current.onCoughStart(moment);
      };

      /** Start of the loudest part of a window (first block within 12 dB of its peak). */
      const onsetIn = (from: number): number => {
        const inWindow = history.filter((h) => h.at >= from && h.at < from + need);
        if (!inWindow.length) return from;
        const peak = Math.max(...inWindow.map((h) => h.db));
        return inWindow[Math.max(0, inWindow.findIndex((h) => h.db >= peak - 12))].at;
      };

      const onBlock = (block: Float32Array) => {
        let sum = 0;
        for (let i = 0; i < block.length; i++) {
          ring[(total + i) % ring.length] = block[i];
          sum += block[i] * block[i];
        }
        const blockStart = total;
        total += block.length;
        const now = performance.now();
        const o = optsRef.current;
        const db = toDb(sum, block.length);
        const speaking = o.isSpeaking();

        history.push({ at: blockStart, db, snap: fit ? null : o.snapshot() });
        while (history.length && history[0].at < total - ring.length) history.shift();

        // Does the mic hear Recall's own voice?
        if (speaking) {
          voiceLevel = Number.isNaN(voiceLevel) ? db : voiceLevel + (db - voiceLevel) * 0.02;
          voiceBlocks++;
          const nowEcho = voiceBlocks > 90 && voiceLevel - floor > 10;
          if (nowEcho !== echo) { echo = nowEcho; setHearsVoice(nowEcho); }
        }
        /**
         * The mic is hearing only the room and the student: Recall is silent, or
         * it's speaking and we've confirmed (after ~2 s) the mic doesn't hear it.
         */
        const roomOnly = !speaking || (voiceBlocks > 90 && !echo);

        // Background level: follows drops quickly and rises slowly, so short
        // sounds (coughs, words) barely move it. Not learned over our own voice.
        if (Number.isNaN(floor)) floor = db;
        if (roomOnly && !fit && loudStart === null) floor += (db - floor) * (db < floor ? 0.2 : 0.004);

        if (now - lastMeter > 60) {
          lastMeter = now;
          setLevel(Math.max(0, Math.min(1, (db - floor) / METER_RANGE_DB)));
        }

        // ---- inside a coughing fit: count coughs until it goes quiet ----
        if (fit) {
          countBurst(db, now);
          const quietFor = fit.inBurst ? 0 : now - fit.lastBurstEnd;
          if (quietFor >= COUGH_GAP_MS || now - fit.startedAt >= MAX_FIT_MS) {
            const done = fit;
            fit = null;
            ignoreBefore = total; // never re-detect the same coughs
            setCoughing(false);
            o.onCoughEnd(done.moment, Math.max(1, done.count));
          }
          return;
        }

        if (!modelReady) return;

        // ---- A. loudness: a short sound above the line ----
        if (roomOnly && candidate === null && blockStart >= ignoreBefore) {
          if (db > floor + lineDb()) {
            if (loudStart === null) loudStart = blockStart;
            loudBlocks++;
            if (loudBlocks * blockMs > MAX_BURST_MS) loudStart = -1; // too long: talking or ongoing noise
          } else if (loudStart !== null) {
            const lasted = loudBlocks * blockMs;
            if (loudStart >= 0 && lasted >= MIN_BURST_MS) candidate = loudStart;
            loudStart = null;
            loudBlocks = 0;
          }
        } else if (!roomOnly) {
          loudStart = null;
          loudBlocks = 0;
        }

        if (classifying) return;

        // A short loud sound: count it unless the model is sure it's something else.
        if (candidate !== null) {
          const from = candidate - Math.round(PRE_ROLL_S * rate);
          if (total < from + need) return;
          const onset = candidate;
          candidate = null;
          classifying = true;
          coughScores(clipAt(from))
            .then(({ cough, notCough }) => {
              if (cancelled || fit || onset < ignoreBefore) return;
              const clearlyOther = notCough >= NOT_COUGH_SURE && cough < COUGH_SCORE[optsRef.current.sensitivity];
              if (!clearlyOther) beginFit(onset);
            })
            .catch(() => { /* a failed check is just skipped */ })
            .finally(() => { classifying = false; });
          return;
        }

        // ---- B. model: a clear cough in the last second ----
        const from = total - need;
        if (total < nextCheckAt || from < ignoreBefore || from < 0 || loudStart !== null) return;
        nextCheckAt = total + Math.round(hopSeconds * rate);
        classifying = true;
        coughScores(clipAt(from))
          .then(({ cough, rival }) => {
            if (cancelled || fit || from < ignoreBefore) return;
            if (cough >= COUGH_SCORE[optsRef.current.sensitivity] && cough - rival >= RIVAL_MARGIN) beginFit(onsetIn(from));
          })
          .catch(() => { /* a failed check is just skipped */ })
          .finally(() => { classifying = false; });
      };

      if (ctx.audioWorklet && typeof AudioWorkletNode === "function") {
        const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: "application/javascript" }));
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (cancelled) return;
        const node = new AudioWorkletNode(ctx, "recall-tap");
        node.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data);
        source.connect(node);
        node.connect(mute);
        cleanupNode = () => { node.port.onmessage = null; node.disconnect(); source.disconnect(); };
      } else {
        const node = ctx.createScriptProcessor(BLOCK, 1, 1);
        node.onaudioprocess = (e) => onBlock(new Float32Array(e.inputBuffer.getChannelData(0)));
        source.connect(node);
        node.connect(mute);
        cleanupNode = () => { node.onaudioprocess = null; node.disconnect(); source.disconnect(); };
      }

      if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
      if (!cancelled) setState("listening");
    };

    start().catch((err: unknown) => {
      if (cancelled) return;
      setState("error");
      setError(describe(err));
    });

    // Browsers may keep audio suspended until the next tap; resume on any interaction.
    const wake = () => { if (ctx?.state === "suspended") ctx.resume().catch(() => undefined); };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      cleanupNode?.();
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => undefined);
    };
  }, [opts.active]);

  return { state, error, level, hearsVoice, coughing };
}

function describe(err: unknown): string {
  const name = err instanceof Error ? (err as DOMException).name : "";
  const message = err instanceof Error ? err.message : "";
  if (message === "insecure") return "The microphone only works on a secure (https) page or on localhost.";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was blocked. Allow it from the address bar, then switch cough detection on again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found on this device.";
  if (name === "NotReadableError") return "The microphone is being used by another app.";
  return "The cough detector couldn't start on this device. Speech still works normally.";
}
