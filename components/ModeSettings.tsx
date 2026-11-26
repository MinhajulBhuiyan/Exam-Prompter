"use client";

import {
  GROUP_MAX, GROUP_MIN, type PlayMode, WPM_MAX, WPM_MIN, WPM_PRESETS,
} from "@/lib/usePlayer";

interface Props {
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  groupSize: number;
  onGroupSizeChange: (n: number) => void;
  wpm: number;
  onWpmChange: (wpm: number) => void;
  /** Shown while dictating, so changes are explained as live. */
  live?: boolean;
}

function speedName(wpm: number): string {
  let best = WPM_PRESETS[0];
  for (const p of WPM_PRESETS) if (Math.abs(p.wpm - wpm) < Math.abs(best.wpm - wpm)) best = p;
  return Math.abs(best.wpm - wpm) <= 2 ? best.label : wpm < 12 ? "Very slow" : wpm > 40 ? "Very fast" : "Custom";
}

export function ModeSettings({ mode, onModeChange, groupSize, onGroupSizeChange, wpm, onWpmChange, live }: Props) {
  const fill = ((wpm - WPM_MIN) / (WPM_MAX - WPM_MIN)) * 100;

  return (
    <div className="mode-settings">
      <div className="cough-row">
        <span className="cough-row-label">Reading mode</span>
        <div className="segmented" role="radiogroup" aria-label="Reading mode">
          {(["dictation", "continuous"] as PlayMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => onModeChange(m)}>
              {m === "dictation" ? "Dictation" : "Continuous"}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small-text cough-note">
        {mode === "dictation"
          ? `Reads ${groupSize} ${groupSize === 1 ? "word" : "words"} at a time, then waits while you write. Punctuation doesn't count as a word.`
          : "Reads each line straight through, one line after another."}
      </p>

      {mode === "dictation" && (
        <>
          <div className="cough-row">
            <span className="cough-row-label">Words at a time</span>
            <div className="stepper" role="group" aria-label="Words at a time">
              <button type="button" onClick={() => onGroupSizeChange(Math.max(GROUP_MIN, groupSize - 1))} disabled={groupSize <= GROUP_MIN} aria-label="Fewer words">−</button>
              <output aria-live="polite">{groupSize}</output>
              <button type="button" onClick={() => onGroupSizeChange(Math.min(GROUP_MAX, groupSize + 1))} disabled={groupSize >= GROUP_MAX} aria-label="More words">+</button>
            </div>
          </div>

          <div className="writing-speed">
            <div className="pace-head">
              <label htmlFor={live ? "wpm-live" : "wpm-setup"} className="cough-row-label">Writing speed</label>
              <div className="pace-readout">
                <span className="pace-value">{wpm}</span>
                <span className="muted small-text">words/min</span>
                <span className="pace-chip">{speedName(wpm)}</span>
              </div>
            </div>
            <input
              id={live ? "wpm-live" : "wpm-setup"}
              className="range"
              type="range"
              min={WPM_MIN}
              max={WPM_MAX}
              step={1}
              value={wpm}
              style={{ "--fill": `${fill}%` } as React.CSSProperties}
              aria-valuetext={`${wpm} words per minute, ${speedName(wpm)}`}
              onChange={(e) => onWpmChange(Number(e.target.value))}
            />
            <div className="preset-row">
              {WPM_PRESETS.map((p) => (
                <button key={p.label} type="button" className={`chip-button ${wpm === p.wpm ? "on" : ""}`} onClick={() => onWpmChange(p.wpm)}>
                  {p.label} <span className="muted">{p.wpm}</span>
                </button>
              ))}
            </div>
            <p className="muted small-text cough-note">
              {live
                ? "Changes apply straight away, even to the countdown that's running. Longer words get more time, plus a little extra at the end of each line."
                : "Longer words get more time, plus a little extra at the end of each line."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
