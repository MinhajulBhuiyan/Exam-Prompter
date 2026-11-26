"use client";

import PaceControl from "./PaceControl";
import CoughPanel from "./CoughPanel";
import type { CoughSettings } from "@/lib/storage";
import type { PlayMode } from "@/lib/usePlayer";
import { ModeSettings } from "./ModeSettings";
import { groupVoices, pickVoice } from "@/lib/voices";
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
  onUseSample: () => void;
  onClear: () => void;
  onPreview: () => void;
  onStart: () => void;
  cough: CoughSettings;
  onCoughChange: (next: CoughSettings) => void;
  showText: boolean;
  onShowTextChange: (value: boolean) => void;
  readPunctuation: boolean;
  onReadPunctuationChange: (value: boolean) => void;
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  groupSize: number;
  onGroupSizeChange: (n: number) => void;
  wpm: number;
  onWpmChange: (wpm: number) => void;
}

export default function SetupScreen(p: Props) {
  const words = countWords(p.source);
  const hasText = p.sentenceCount > 0;
  // Automatic prefers an Indian English voice when one is installed.
  const autoVoice = pickVoice(p.voices, "south-asian");

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Practice your teacher&rsquo;s answer</h1>
        <p className="lede">
          Paste the answer below. Recall reads it aloud line by line on a prompter,
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
                <option value="">Automatic{autoVoice ? ` — ${autoVoice.name}` : ""}</option>
                {groupVoices(p.voices, "south-asian").map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                  </optgroup>
                ))}
              </select>
              {p.voices.length === 0 && p.supported && (
                <span className="muted small-text">No English voices were found yet. Recall will use the browser&rsquo;s default voice.</span>
              )}
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
          <div className="settings-divider" />
          <ModeSettings
            mode={p.mode}
            onModeChange={p.onModeChange}
            groupSize={p.groupSize}
            onGroupSizeChange={p.onGroupSizeChange}
            wpm={p.wpm}
            onWpmChange={p.onWpmChange}
          />
          <div className="settings-divider" />
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={p.showText}
              onChange={(e) => p.onShowTextChange(e.target.checked)}
            />
            <span>
              <strong>Show the words on the prompter</strong>
              <span className="muted small-text block">
                On: the prompter shows each line and highlights the word being read. Off: it only shows which line is being read, so you practice from memory (the words appear while paused, so you can pick where to continue).
              </span>
            </span>
          </label>
          <div className="settings-divider" />
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={p.readPunctuation}
              onChange={(e) => p.onReadPunctuationChange(e.target.checked)}
            />
            <span>
              <strong>Read punctuation aloud</strong>
              <span className="muted small-text block">
                Says each mark: &ldquo;comma&rdquo;, &ldquo;full stop&rdquo;, &ldquo;open bracket&rdquo;, &ldquo;apostrophe&rdquo;, &ldquo;hyphen&rdquo;, &ldquo;question mark&rdquo; and so on.
              </span>
            </span>
          </label>
          <div className="settings-divider" />
          <CoughPanel settings={p.cough} onChange={p.onCoughChange} />
        </section>
      )}

      <div className="actions">
        <button type="button" className="button primary" onClick={p.onStart} disabled={!hasText}>
          Start from the beginning
        </button>
      </div>
      <p className="center muted small-text">
        {hasText ? "Reading runs by itself. Pause any time, or tap a word to continue from it. Use “Change answer” to come back here." : "Add an answer, or try the sample, to begin."}
      </p>
    </div>
  );
}
