"use client";

import PaceControl from "./PaceControl";
import { AlertIcon, SpeakerIcon } from "./Icons";
import { formatDuration } from "@/lib/pace";
import { countWords } from "@/lib/text";

interface Props {
  source: string;
  onSourceChange: (value: string) => void;
  sentenceCount: number;
  rate: number;
  onRateChange: (value: number) => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  onVoiceChange: (value: string) => void;
  supported: boolean | null;
  paceNotice: string | null;
  canResume: boolean;
  resumeLabel: string;
  onUseSample: () => void;
  onClear: () => void;
  onPreview: () => void;
  onStart: () => void;
  onResume: () => void;
}

export default function SetupScreen(p: Props) {
  const words = countWords(p.source);
  const hasText = p.sentenceCount > 0;
  const english = p.voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const others = p.voices.filter((v) => !v.lang.toLowerCase().startsWith("en"));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Practice your teacher&rsquo;s answer</h1>
        <p className="lede">
          Paste the answer below. Recall reads it aloud one sentence at a time while it stays hidden,
          so you can write down what you remember.
        </p>
      </header>

      {p.supported === false && (
        <div className="notice" role="note">
          <AlertIcon />
          <div>
            <strong>This browser can&rsquo;t read text aloud.</strong>
            <p>
              You can still practice: during practice you can briefly show each sentence, then hide it
              and write from memory. For spoken practice, try a recent version of Chrome, Edge, Safari or Firefox.
            </p>
          </div>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <label htmlFor="source" className="field-label">Teacher&rsquo;s answer</label>
          <div className="card-head-actions">
            <button type="button" className="link-button" onClick={p.onUseSample}>Use a sample answer</button>
            {p.source && <button type="button" className="link-button subtle" onClick={p.onClear}>Clear</button>}
          </div>
        </div>
        <textarea
          id="source"
          className="textarea source-input"
          value={p.source}
          onChange={(e) => p.onSourceChange(e.target.value)}
          placeholder="Paste or type the answer you want to practice…"
          rows={9}
        />
        <div className="card-foot muted">
          {hasText ? (
            <>
              <span>{p.sentenceCount} {p.sentenceCount === 1 ? "sentence" : "sentences"}</span>
              <span aria-hidden="true">·</span>
              <span>{words} words</span>
              <span aria-hidden="true">·</span>
              <span>about {formatDuration(words, p.rate)} to listen</span>
            </>
          ) : (
            <span>Each sentence is read separately. Line breaks also start a new sentence.</span>
          )}
        </div>
      </section>

      {p.supported !== false && (
        <section className="card settings">
          <h2 className="card-title">Listening settings</h2>
          <div className="settings-grid">
            <div className="field">
              <label htmlFor="voice" className="field-label">Voice</label>
              <select id="voice" className="select" value={p.voiceURI} onChange={(e) => p.onVoiceChange(e.target.value)}>
                <option value="">Browser default</option>
                {english.length > 0 && (
                  <optgroup label="English">
                    {english.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Other languages">
                    {others.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                  </optgroup>
                )}
              </select>
              <button type="button" className="button ghost small" onClick={p.onPreview}>
                <SpeakerIcon size={18} /> Preview voice and pace
              </button>
            </div>
            <PaceControl
              id="pace-setup"
              value={p.rate}
              onChange={p.onRateChange}
              hint="You can change the pace while listening, too."
              notice={p.paceNotice}
            />
          </div>
        </section>
      )}

      <div className="actions">
        {p.canResume && (
          <button type="button" className="button secondary" onClick={p.onResume}>
            {p.resumeLabel}
          </button>
        )}
        <button type="button" className="button primary" onClick={p.onStart} disabled={!hasText}>
          {p.canResume ? "Start fresh" : "Start practice"}
        </button>
      </div>
      <p className="center muted small-text">
        {hasText ? "The answer stays hidden while you practice." : "Add an answer, or try the sample, to begin."}
      </p>
    </div>
  );
}
