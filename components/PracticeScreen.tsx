"use client";

import { useEffect, useState } from "react";
import PaceControl from "./PaceControl";
import { AlertIcon, EyeIcon, EyeOffIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, ReplayIcon } from "./Icons";
import type { SpeechStatus } from "@/lib/useSpeech";

interface Props {
  sentences: string[];
  index: number;
  status: SpeechStatus;
  progress: number;
  speechAvailable: boolean;
  error: string | null;
  slowStart: boolean;
  rate: number;
  onRateChange: (value: number) => void;
  paceNotice: string | null;
  notes: string;
  onNotesChange: (value: string) => void;
  onPrimary: () => void;
  onReplay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
  onEdit: () => void;
  onFinish: () => void;
}

const STATUS_TEXT: Record<SpeechStatus, string> = {
  idle: "Ready to listen",
  starting: "Starting…",
  speaking: "Listening…",
  paused: "Paused",
  ended: "Sentence finished",
  error: "Speech stopped",
};

export default function PracticeScreen(p: Props) {
  const total = p.sentences.length;
  const isLast = p.index >= total - 1;
  const [peek, setPeek] = useState(false);

  useEffect(() => setPeek(false), [p.index]);

  const active = p.status === "speaking" || p.status === "starting";
  const primaryLabel = active ? "Pause" : p.status === "paused" ? "Resume" : p.status === "ended" ? "Play again" : "Play";

  return (
    <div className="screen">
      <div className="practice-progress">
        <div className="practice-progress-head">
          <span className="field-label">Sentence {p.index + 1} of {total}</span>
          <span className="muted small-text">{Math.round(((p.index + (p.status === "ended" ? 1 : 0)) / total) * 100)}% through</span>
        </div>
        <ol className="segments" aria-label="Sentences">
          {p.sentences.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                className={`segment ${i < p.index ? "done" : i === p.index ? "current" : ""}`}
                onClick={() => p.onJump(i)}
                aria-label={`Go to sentence ${i + 1}${i === p.index ? " (current)" : ""}`}
                aria-current={i === p.index ? "step" : undefined}
              />
            </li>
          ))}
        </ol>
      </div>

      <section className="card player" aria-label="Listening controls">
        {p.speechAvailable ? (
          <>
            <div className="player-status" role="status" aria-live="polite">
              <span className={`pulse ${active ? "on" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>
              <span>{STATUS_TEXT[p.status]}</span>
            </div>
            <div className="sentence-track" aria-hidden="true">
              <span style={{ width: `${p.progress * 100}%` }} />
            </div>

            {p.error && (
              <p className="inline-alert"><AlertIcon size={18} /> {p.error}</p>
            )}
            {p.slowStart && !p.error && (
              <p className="inline-alert soft">
                <AlertIcon size={18} /> Speech is taking a while to start. Check your volume, or try another voice from the setup screen.
              </p>
            )}

            <div className="controls">
              <button type="button" className="icon-button" onClick={p.onReplay} aria-label="Replay this sentence from the start">
                <ReplayIcon /><span>Replay</span>
              </button>
              <button type="button" className="play-button" onClick={p.onPrimary} aria-label={`${primaryLabel} sentence`}>
                {active ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
                <span>{primaryLabel}</span>
              </button>
              <button type="button" className="icon-button" onClick={p.onNext} aria-label={isLast ? "Finish and review" : "Next sentence"}>
                <NextIcon /><span>{isLast ? "Finish" : "Next"}</span>
              </button>
            </div>

            <PaceControl
              id="pace-live"
              value={p.rate}
              onChange={p.onRateChange}
              hint="Changes apply right away and continue from the current word."
              notice={p.paceNotice}
            />
          </>
        ) : (
          <div className="fallback">
            <p className="inline-alert soft">
              <AlertIcon size={18} />
              Read-aloud isn&rsquo;t available in this browser. Show the sentence, read it once, then hide it and write what you remember.
            </p>
            <div className="peek-box" aria-live="polite">
              {peek ? <p className="peek-text">{p.sentences[p.index]}</p> : <p className="muted">Sentence hidden</p>}
            </div>
            <div className="controls">
              <button type="button" className="play-button" onClick={() => setPeek((v) => !v)}>
                {peek ? <EyeOffIcon size={22} /> : <EyeIcon size={22} />}
                <span>{peek ? "Hide sentence" : "Show sentence"}</span>
              </button>
              <button type="button" className="icon-button" onClick={p.onNext} aria-label={isLast ? "Finish and review" : "Next sentence"}>
                <NextIcon /><span>{isLast ? "Finish" : "Next"}</span>
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card notes">
        <div className="card-head">
          <label htmlFor="notes" className="field-label">What you remember</label>
          <span className="muted small-text">Saved in this browser</span>
        </div>
        <textarea
          id="notes"
          className="textarea notes-input"
          value={p.notes}
          onChange={(e) => p.onNotesChange(e.target.value)}
          placeholder="Write the sentence in your own words, or as close to the original as you can…"
          rows={8}
        />
      </section>

      {p.speechAvailable && (
        <p className="shortcuts muted small-text">
          Shortcuts while typing: <kbd>Esc</kbd> pause / resume · <kbd>Alt</kbd>+<kbd>R</kbd> replay · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> next
        </p>
      )}

      <div className="actions split">
        <div className="actions-left">
          <button type="button" className="button ghost" onClick={p.onEdit}>Edit answer</button>
          {p.index > 0 && (
            <button type="button" className="button ghost" onClick={p.onPrevious}>
              <PrevIcon size={18} /> Previous
            </button>
          )}
        </div>
        <button type="button" className="button primary" onClick={p.onFinish}>Finish &amp; review</button>
      </div>
    </div>
  );
}
