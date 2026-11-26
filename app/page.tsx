"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SetupScreen from "@/components/SetupScreen";
import PracticeScreen from "@/components/PracticeScreen";
import { SAMPLE_ANSWER } from "@/lib/sample";
import { type CoughSettings, EMPTY_SESSION, type Phase, loadSession, saveSession } from "@/lib/storage";
import { useSpeech } from "@/lib/useSpeech";
import { type PlayMode, usePlayer } from "@/lib/usePlayer";
import { useCoughDetector } from "@/lib/useCoughDetector";
import { loadCoughModel } from "@/lib/coughModel";
import { buildWords, splitAnswer, wordAt } from "@/lib/text";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "setup", label: "Add answer" },
  { phase: "practice", label: "Listen & write" },
];

const PREVIEW_TEXT = "This is how your teacher's answer will sound, at this pace.";

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState(EMPTY_SESSION.source);
  const [rate, setRate] = useState(EMPTY_SESSION.rate);
  const [voiceURI, setVoiceURI] = useState(EMPTY_SESSION.voiceURI);
  const [phase, setPhase] = useState<Phase>("setup");
  const [cough, setCough] = useState<CoughSettings>(EMPTY_SESSION.cough);
  const [showText, setShowText] = useState(EMPTY_SESSION.showText);
  const [readPunctuation, setReadPunctuation] = useState(EMPTY_SESSION.readPunctuation);
  const [mode, setMode] = useState<PlayMode>(EMPTY_SESSION.mode);
  const [groupSize, setGroupSize] = useState(EMPTY_SESSION.groupSize);
  const [wpm, setWpm] = useState(EMPTY_SESSION.wpm);

  const answer = useMemo(() => splitAnswer(source), [source]);
  const lines = answer.lines;
  const words = useMemo(() => buildWords(lines), [lines]);
  const speech = useSpeech({ rate, voiceURI, readPunctuation, accent: "south-asian" });
  const speechAvailable = speech.supported === true;
  const player = usePlayer({
    lines, paragraphOf: answer.paragraph, words, mode, groupSize, wpm, speech, enabled: phase === "practice",
  });
  const mainRef = useRef<HTMLElement>(null);

  // Cough detection: only while practising, and only when switched on.
  const detector = useCoughDetector<number>({
    active: hydrated && cough.enabled && phase === "practice" && speechAvailable && player.state !== "finished",
    sensitivity: cough.sensitivity,
    isSpeaking: speech.isSpeaking,
    snapshot: player.snapshot,
    onCoughStart: player.coughStart,
    onCoughEnd: (_moment, count) => player.coughEnd(count, cough.wordsBack),
  });

  // Start downloading the detector as soon as it's switched on.
  useEffect(() => {
    if (hydrated && cough.enabled && speechAvailable) loadCoughModel().catch(() => undefined);
  }, [hydrated, cough.enabled, speechAvailable]);

  // Restore saved settings once, on the client. Reading can't restart by itself
  // after a reload (browsers need a tap first), so practice reopens on the answer page.
  useEffect(() => {
    const saved = loadSession();
    setSource(saved.source);
    setRate(saved.rate);
    setVoiceURI(saved.voiceURI);
    setCough(saved.cough);
    setShowText(saved.showText);
    setReadPunctuation(saved.readPunctuation);
    setMode(saved.mode);
    setGroupSize(saved.groupSize);
    setWpm(saved.wpm);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(
      () => saveSession({ source, rate, voiceURI, cough, showText, readPunctuation, mode, groupSize, wpm }),
      250,
    );
    return () => window.clearTimeout(id);
  }, [hydrated, source, rate, voiceURI, cough, showText, readPunctuation, mode, groupSize, wpm]);

  // Forget a saved voice that this device doesn't have.
  useEffect(() => {
    if (voiceURI && speech.voices.length && !speech.voices.some((v) => v.voiceURI === voiceURI)) setVoiceURI("");
  }, [speech.voices, voiceURI]);

  const goTo = useCallback((next: Phase) => {
    setPhase(next);
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  // --- actions ------------------------------------------------------------
  const { readFrom, pause, resume, pick, moveMarker, stop } = player;

  const startFromBeginning = () => {
    goTo("practice");
    readFrom(0);
  };

  const changeAnswer = () => {
    stop();
    goTo("setup");
  };

  const togglePause = useCallback(() => {
    if (player.state === "paused") resume();
    else pause();
  }, [player.state, pause, resume]);

  // Keyboard: Esc pause/resume; while paused, arrows move the chosen word and Enter continues.
  useEffect(() => {
    if (phase !== "practice" || !speechAvailable) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY)$/.test(target.tagName) && e.key !== "Escape") return;
      if (e.key === "Escape") { e.preventDefault(); togglePause(); return; }
      if (player.state !== "paused") return;
      const moves: Record<string, "prev" | "next" | "up" | "down"> = {
        ArrowLeft: "prev", ArrowRight: "next", ArrowUp: "up", ArrowDown: "down",
      };
      if (moves[e.key]) { e.preventDefault(); moveMarker(moves[e.key]); }
      else if (e.key === "Enter") { e.preventDefault(); resume(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, speechAvailable, togglePause, player.state, moveMarker, resume]);

  const speakingWord = useMemo(() => {
    if (player.state !== "speaking" || !player.segment) return null;
    if (speech.status !== "speaking" && speech.status !== "starting") return null;
    const line = words[player.segment.first]?.line ?? 0;
    return Math.max(player.segment.first, Math.min(player.segment.last, wordAt(words, line, speech.position)));
  }, [player.state, player.segment, speech.status, speech.position, words]);

  const paceNotice = speech.paceNotice !== null
    ? `Pace changed to ${speech.paceNotice.toFixed(2)}× — continuing from the current word.`
    : null;
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          Recall
        </div>
        <ol className="steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.phase} className={i === stepIndex ? "current" : i < stepIndex ? "done" : ""} aria-current={i === stepIndex ? "step" : undefined}>
              {s.phase === "setup" && phase !== "setup" ? (
                <button type="button" className="step-link" onClick={changeAnswer}>
                  <span className="step-num">{i + 1}</span>
                  <span className="step-label">{s.label}</span>
                </button>
              ) : (
                <>
                  <span className="step-num">{i + 1}</span>
                  <span className="step-label">{s.label}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      </header>

      <main ref={mainRef} tabIndex={-1} className="main">
        {!hydrated ? (
          <div className="loading" aria-busy="true" />
        ) : phase === "setup" ? (
          <SetupScreen
            source={source}
            onSourceChange={setSource}
            sentenceCount={lines.length}
            rate={rate}
            onRateChange={setRate}
            voices={speech.voices}
            voiceURI={voiceURI}
            onVoiceChange={setVoiceURI}
            supported={speech.supported}
            paceNotice={paceNotice}
            onUseSample={() => setSource(SAMPLE_ANSWER)}
            onClear={() => setSource("")}
            onPreview={() => speech.play(PREVIEW_TEXT)}
            onStart={startFromBeginning}
            cough={cough}
            onCoughChange={setCough}
            showText={showText}
            onShowTextChange={setShowText}
            readPunctuation={readPunctuation}
            onReadPunctuationChange={setReadPunctuation}
            mode={mode}
            onModeChange={setMode}
            groupSize={groupSize}
            onGroupSizeChange={setGroupSize}
            wpm={wpm}
            onWpmChange={setWpm}
          />
        ) : (
          <PracticeScreen
            lines={lines}
            words={words}
            state={player.state}
            segment={player.segment}
            speakingWord={speakingWord}
            marker={player.marker}
            writing={player.writing}
            speechAvailable={speechAvailable}
            error={speech.error}
            slowStart={speech.slowStart}
            showText={showText}
            rate={rate}
            onRateChange={setRate}
            paceNotice={paceNotice}
            paragraphOf={answer.paragraph}
            announcement={player.announcement}
            mode={mode}
            onModeChange={setMode}
            groupSize={groupSize}
            onGroupSizeChange={setGroupSize}
            wpm={wpm}
            onWpmChange={setWpm}
            onTogglePause={togglePause}
            onPick={pick}
            onChangeAnswer={changeAnswer}
            onRestart={() => readFrom(0)}
            cough={cough}
            onCoughChange={setCough}
            coughLive={{ ...detector, holding: player.state === "cough" }}
          />
        )}
      </main>

      <footer className="footer muted small-text">
        Your answer and settings are stored only in this browser. Nothing is uploaded.
      </footer>
    </div>
  );
}
