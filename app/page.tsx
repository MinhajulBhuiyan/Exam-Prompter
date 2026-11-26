"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SetupScreen from "@/components/SetupScreen";
import PracticeScreen from "@/components/PracticeScreen";
import ReviewScreen from "@/components/ReviewScreen";
import { SAMPLE_ANSWER } from "@/lib/sample";
import { EMPTY_SESSION, type Phase, loadSession, saveSession } from "@/lib/storage";
import { splitSentences } from "@/lib/text";
import { useSpeech } from "@/lib/useSpeech";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "setup", label: "Add answer" },
  { phase: "practice", label: "Listen & write" },
  { phase: "review", label: "Review" },
];

const PREVIEW_TEXT = "This is how your teacher's answer will sound at this pace. You can change it at any time.";

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState(EMPTY_SESSION.source);
  const [notes, setNotes] = useState(EMPTY_SESSION.notes);
  const [rate, setRate] = useState(EMPTY_SESSION.rate);
  const [voiceURI, setVoiceURI] = useState(EMPTY_SESSION.voiceURI);
  const [phase, setPhase] = useState<Phase>(EMPTY_SESSION.phase);
  const [index, setIndex] = useState(EMPTY_SESSION.index);

  const sentences = useMemo(() => splitSentences(source), [source]);
  const speech = useSpeech({ rate, voiceURI });
  const speechAvailable = speech.supported === true;
  const mainRef = useRef<HTMLElement>(null);

  // Restore the saved session once, on the client.
  useEffect(() => {
    const saved = loadSession();
    const count = splitSentences(saved.source).length;
    setSource(saved.source);
    setNotes(saved.notes);
    setRate(saved.rate);
    setVoiceURI(saved.voiceURI);
    setPhase(count ? saved.phase : "setup");
    setIndex(Math.min(saved.index, Math.max(0, count - 1)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = window.setTimeout(() => saveSession({ source, notes, rate, voiceURI, phase, index }), 250);
    return () => window.clearTimeout(id);
  }, [hydrated, source, notes, rate, voiceURI, phase, index]);

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
  const playSentence = useCallback(
    (i: number) => {
      setIndex(i);
      if (speechAvailable && sentences[i]) speech.play(sentences[i]);
    },
    [speech, speechAvailable, sentences],
  );

  const startFresh = () => {
    setNotes("");
    goTo("practice");
    playSentence(0);
  };

  const resumeSession = () => {
    goTo("practice");
    speech.stop();
  };

  const togglePlay = () => {
    switch (speech.status) {
      case "speaking":
      case "starting":
        return speech.pause();
      case "paused":
        return speech.resume();
      default:
        return playSentence(index);
    }
  };

  const next = () => {
    if (index < sentences.length - 1) playSentence(index + 1);
    else finish();
  };

  const finish = () => {
    speech.stop();
    goTo("review");
  };

  const editAnswer = () => {
    speech.stop();
    goTo("setup");
  };

  const changeSource = (value: string) => {
    setSource(value);
    setIndex(0);
  };

  // Keyboard shortcuts that are safe to use while typing notes.
  const actions = useRef({ togglePlay, next, replay: () => playSentence(index) });
  actions.current = { togglePlay, next, replay: () => playSentence(index) };
  useEffect(() => {
    if (phase !== "practice" || !speechAvailable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); actions.current.togglePlay(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); actions.current.next(); }
      else if (e.altKey && e.code === "KeyR") { e.preventDefault(); actions.current.replay(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, speechAvailable]);

  const paceNotice = speech.paceNotice !== null
    ? `Pace changed to ${speech.paceNotice.toFixed(2)}× — continuing from the current word.`
    : null;
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);
  const canResume = sentences.length > 0 && (index > 0 || notes.trim().length > 0);

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
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{s.label}</span>
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
            onSourceChange={changeSource}
            sentenceCount={sentences.length}
            rate={rate}
            onRateChange={setRate}
            voices={speech.voices}
            voiceURI={voiceURI}
            onVoiceChange={setVoiceURI}
            supported={speech.supported}
            paceNotice={paceNotice}
            canResume={canResume}
            resumeLabel={`Continue at sentence ${Math.min(index + 1, sentences.length)}`}
            onUseSample={() => changeSource(SAMPLE_ANSWER)}
            onClear={() => { changeSource(""); setNotes(""); }}
            onPreview={() => speech.play(PREVIEW_TEXT)}
            onStart={startFresh}
            onResume={resumeSession}
          />
        ) : phase === "practice" ? (
          <PracticeScreen
            sentences={sentences}
            index={index}
            status={speech.status}
            progress={speech.progress}
            speechAvailable={speechAvailable}
            error={speech.error}
            slowStart={speech.slowStart}
            rate={rate}
            onRateChange={setRate}
            paceNotice={paceNotice}
            notes={notes}
            onNotesChange={setNotes}
            onPrimary={togglePlay}
            onReplay={() => playSentence(index)}
            onPrevious={() => playSentence(Math.max(0, index - 1))}
            onNext={next}
            onJump={playSentence}
            onEdit={editAnswer}
            onFinish={finish}
          />
        ) : (
          <ReviewScreen
            sentences={sentences}
            notes={notes}
            onNotesChange={setNotes}
            onBack={() => goTo("practice")}
            onPracticeAgain={startFresh}
            onNewAnswer={() => { changeSource(""); setNotes(""); goTo("setup"); }}
          />
        )}
      </main>

      <footer className="footer muted small-text">
        Your answer and notes are stored only in this browser. Nothing is uploaded.
      </footer>
    </div>
  );
}
