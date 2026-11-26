"use client";

import { useEffect, useState } from "react";
import PaceControl from "./PaceControl";
import Prompter from "./Prompter";
import CoughPanel from "./CoughPanel";
import { AlertIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons";
import type { Word } from "@/lib/text";
import type { CoughSettings } from "@/lib/storage";
import type { DetectorState } from "@/lib/useCoughDetector";
import type { PlayMode, PlayerState, Writing } from "@/lib/usePlayer";
import { ModeSettings } from "./ModeSettings";

interface Props {
  lines: string[];
  words: Word[];
  state: PlayerState;
  segment: { first: number; last: number } | null;
  speakingWord: number | null;
  marker: number | null;
  writing: Writing | null;
  speechAvailable: boolean;
  error: string | null;
  slowStart: boolean;
  showText: boolean;
  rate: number;
  onRateChange: (value: number) => void;
  paceNotice: string | null;
  paragraphOf: number[];
  announcement: string | null;
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  groupSize: number;
  onGroupSizeChange: (n: number) => void;
  wpm: number;
  onWpmChange: (wpm: number) => void;
  onTogglePause: () => void;
  onPick: (wordIndex: number) => void;
  onChangeAnswer: () => void;
  onRestart: () => void;
  cough: CoughSettings;
  onCoughChange: (next: CoughSettings) => void;
  coughLive: { state: DetectorState; error: string | null; level: number; holding: boolean; hearsVoice: boolean };
}

function WritingCountdown({ writing }: { writing: Writing }) {
  const [left, setLeft] = useState(writing.ms);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, writing.ms - (performance.now() - writing.startedAt)));
    tick();
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [writing]);
  return (
    <span className="countdown">
      <span>Write… {Math.ceil(left / 1000)} s</span>
      <span className="countdown-bar" aria-hidden="true"><span style={{ width: `${(left / writing.ms) * 100}%` }} /></span>
    </span>
  );
}

export default function PracticeScreen(p: Props) {
  const total = p.lines.length;
  const focus = p.marker ?? p.speakingWord ?? p.segment?.first ?? null;
  const lineNow = focus !== null && p.words[focus] ? p.words[focus].line : p.state === "finished" ? total - 1 : 0;
  const paused = p.state === "paused";
  const finished = p.state === "finished";
  const markerText =
    p.marker !== null && p.words[p.marker]
      ? p.lines[p.words[p.marker].line].slice(p.words[p.marker].start, p.words[p.marker].end)
      : null;

  let status: React.ReactNode;
  switch (p.state) {
    case "speaking": status = p.mode === "dictation" ? "Listen…" : `Reading line ${lineNow + 1}`; break;
    case "writing": status = p.writing ? <WritingCountdown writing={p.writing} /> : "Write…"; break;
    case "cough": status = "Cough heard — going back…"; break;
    case "announcing": status = p.announcement ?? "…"; break;
    case "paused": status = markerText ? <>Paused — will continue from <strong>&ldquo;{markerText}&rdquo;</strong></> : "Paused"; break;
    case "finished": status = "The answer is finished"; break;
    default: status = "Starting…";
  }

  return (
    <div className="screen">
      <div className="practice-bar">
        <button type="button" className="link-button" onClick={p.onChangeAnswer}>
          <PrevIcon size={18} /> Change answer
        </button>
        <span className="muted small-text">Line {Math.min(lineNow + 1, total)} of {total}</span>
      </div>

      <div className="line-progress" aria-hidden="true">
        <span style={{ width: `${((finished ? total : lineNow) / total) * 100}%` }} />
      </div>

      {p.speechAvailable && (
        <div className="status-row">
          <div className={`live-status ${p.state === "cough" ? "waiting" : ""} ${p.state === "writing" ? "writing" : ""}`} role="status" aria-live="polite">
            <span className={`pulse ${p.state === "speaking" ? "on" : ""} ${p.state === "cough" ? "hold" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>
            <span>{status}</span>
          </div>
          {!finished && (
            <button type="button" className="play-button" onClick={p.onTogglePause} aria-keyshortcuts="Escape">
              {paused ? <PlayIcon size={22} /> : <PauseIcon size={22} />}
              <span>{paused ? "Resume" : "Pause"}</span>
            </button>
          )}
        </div>
      )}

      {p.speechAvailable && !finished && (
        <p className="pick-hint muted small-text">
          {paused
            ? "Tap any word to continue from there. Keyboard: ← → move by word, ↑ ↓ by line, Enter to continue."
            : "Lost your place? Tap the word you missed — reading pauses so you can continue from it."}
        </p>
      )}

      {p.cough.enabled && p.coughLive.hearsVoice && (
        <p className="inline-alert">
          <AlertIcon size={18} /> Your microphone can hear Recall&rsquo;s own voice, so coughs while it speaks can&rsquo;t be detected reliably. Please use headphones or earphones.
        </p>
      )}
      {p.error && <p className="inline-alert"><AlertIcon size={18} /> {p.error}</p>}
      {p.slowStart && !p.error && (
        <p className="inline-alert soft">
          <AlertIcon size={18} /> Speech is taking a while to start. Check your volume, or choose another voice after changing the answer.
        </p>
      )}
      {!p.speechAvailable && (
        <p className="inline-alert soft">
          <AlertIcon size={18} /> This browser can&rsquo;t read aloud, so the prompter shows the whole answer to read yourself.
        </p>
      )}

      <Prompter
        lines={p.lines}
        paragraphOf={p.paragraphOf}
        words={p.words}
        segment={finished ? null : p.segment}
        speakingWord={p.state === "speaking" ? p.speakingWord : null}
        marker={paused ? p.marker : null}
        showText={p.showText || paused || finished || !p.speechAvailable}
        finished={finished}
        onPick={p.onPick}
      />

      {finished && (
        <div className="finish-row">
          <button type="button" className="link-button" onClick={p.onRestart}>Listen again from the start</button>
          <span aria-hidden="true" className="muted">·</span>
          <button type="button" className="link-button" onClick={p.onChangeAnswer}>Change answer</button>
        </div>
      )}

      {p.speechAvailable && (
        <section className="card practice-settings">
          <ModeSettings
            mode={p.mode}
            onModeChange={p.onModeChange}
            groupSize={p.groupSize}
            onGroupSizeChange={p.onGroupSizeChange}
            wpm={p.wpm}
            onWpmChange={p.onWpmChange}
            live
          />
          <div className="settings-divider" />
          <PaceControl
            id="pace-live"
            value={p.rate}
            onChange={p.onRateChange}
            hint="Changes apply right away and continue from the current word."
            notice={p.paceNotice}
          />
          <div className="player-cough">
            <CoughPanel settings={p.cough} onChange={p.onCoughChange} live={p.coughLive} collapsible />
          </div>
        </section>
      )}
    </div>
  );
}
