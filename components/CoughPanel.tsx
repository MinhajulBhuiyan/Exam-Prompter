"use client";

import type { CoughSettings } from "@/lib/storage";
import { type DetectorState, type Sensitivity, TRIGGER_LINE } from "@/lib/useCoughDetector";

interface Props {
  settings: CoughSettings;
  onChange: (next: CoughSettings) => void;
  /** Live detector info; omitted on the setup screen. */
  live?: { state: DetectorState; error: string | null; level: number; holding: boolean };
  collapsible?: boolean;
}

function Segmented<T extends string | number>({ name, value, options, onChange }: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function CoughPanel({ settings, onChange, live, collapsible }: Props) {
  const set = (patch: Partial<CoughSettings>) => onChange({ ...settings, ...patch });
  const n = settings.wordsBack;
  const line = TRIGGER_LINE[settings.sensitivity];

  const options = (
    <div className="cough-options">
      <div className="cough-row">
        <span className="cough-row-label">After a cough, go back</span>
        <Segmented<number>
          name="Words to go back"
          value={n}
          onChange={(wordsBack) => set({ wordsBack })}
          options={[2, 3, 4, 5].map((v) => ({ value: v, label: `${v} words` }))}
        />
      </div>
      <div className="cough-row">
        <span className="cough-row-label">Sensitivity</span>
        <Segmented<Sensitivity>
          name="Sensitivity"
          value={settings.sensitivity}
          onChange={(sensitivity) => set({ sensitivity })}
          options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]}
        />
      </div>
      <p className="muted small-text cough-note">
        1 cough → back {n} words. 2 or more coughs → back {n * 2} words. A short sound that pushes the bar past the
        line counts as a cough (unless it&rsquo;s clearly talking, typing or writing). High puts the line lowest, so slight coughs count.
      </p>
    </div>
  );

  return (
    <div className="cough">
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        <span>
          <strong>Go back when I cough</strong>
          <span className="muted small-text block">
            Only coughs count — talking, typing and writing are ignored. Works best with headphones. Audio is checked on this device and never saved or sent.
          </span>
        </span>
      </label>

      {settings.enabled && live && (
        <div className={`cough-status ${live.state}`} role="status" aria-live="polite">
          {live.state === "loading" && <span>Starting the microphone and cough detector… (about 16 MB the first time)</span>}
          {live.state === "error" && <span>{live.error}</span>}
          {live.state === "listening" && (
            <>
              <span className="mic-dot" aria-hidden="true" />
              <span>{live.holding ? "Cough heard — going back…" : "Listening for coughs"}</span>
              <span className={`mic-meter ${live.level >= line ? "over" : ""}`} aria-hidden="true">
                <span className="mic-fill" style={{ width: `${live.level * 100}%` }} />
                <span className="mic-line" style={{ left: `${line * 100}%` }} />
              </span>
            </>
          )}
        </div>
      )}
      {settings.enabled && !live && (
        <p className="muted small-text cough-note">The microphone turns on when practice starts. Your browser will ask for permission.</p>
      )}

      {settings.enabled &&
        (collapsible ? (
          <details className="cough-details">
            <summary>Cough options</summary>
            {options}
          </details>
        ) : (
          options
        ))}
    </div>
  );
}
