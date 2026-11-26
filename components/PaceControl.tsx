"use client";

import { PACE_DEFAULT, PACE_MAX, PACE_MIN, PACE_STEP, clampPace, paceLabel, wordsPerMinute } from "@/lib/pace";

interface Props {
  id: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  notice?: string | null;
}

const TICKS = [0.5, 0.75, 1, 1.25, 1.5];

export default function PaceControl({ id, value, onChange, hint, notice }: Props) {
  const fill = ((value - PACE_MIN) / (PACE_MAX - PACE_MIN)) * 100;
  const label = paceLabel(value);

  return (
    <div className="pace">
      <div className="pace-head">
        <label htmlFor={id} className="field-label">Speaking pace</label>
        <div className="pace-readout" aria-hidden="true">
          <span className="pace-value">{value.toFixed(2)}×</span>
          <span className={`pace-chip pace-${label.toLowerCase().replace(" ", "-")}`}>{label}</span>
        </div>
      </div>

      <input
        id={id}
        className="range"
        type="range"
        min={PACE_MIN}
        max={PACE_MAX}
        step={PACE_STEP}
        value={value}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        aria-valuetext={`${value.toFixed(2)} times, ${label}, about ${wordsPerMinute(value)} words per minute`}
        onChange={(e) => onChange(clampPace(Number(e.target.value)))}
      />
      <div className="pace-ticks" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t} style={{ left: `${((t - PACE_MIN) / (PACE_MAX - PACE_MIN)) * 100}%` }}>{t}×</span>
        ))}
      </div>

      <div className="pace-foot">
        <span className="muted">≈ {wordsPerMinute(value)} words per minute</span>
        {Math.abs(value - PACE_DEFAULT) > 0.001 && (
          <button type="button" className="link-button" onClick={() => onChange(PACE_DEFAULT)}>
            Reset to {PACE_DEFAULT}×
          </button>
        )}
      </div>
      <p className="pace-hint" role="status" aria-live="polite">
        {notice ?? hint}
      </p>
    </div>
  );
}
