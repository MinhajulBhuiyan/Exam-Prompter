"use client";

import { Fragment, useMemo, useState } from "react";
import { EyeIcon, EyeOffIcon } from "./Icons";
import { isKeyword, keywordCoverage, normalizeWord, notesStems, stem } from "@/lib/compare";

interface Props {
  sentences: string[];
  notes: string;
  onNotesChange: (value: string) => void;
  onBack: () => void;
  onPracticeAgain: () => void;
  onNewAnswer: () => void;
}

export default function ReviewScreen(p: Props) {
  const [revealed, setRevealed] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const answer = p.sentences.join(" ");
  const coverage = useMemo(() => keywordCoverage(answer, p.notes), [answer, p.notes]);
  const have = useMemo(() => notesStems(p.notes), [p.notes]);

  const renderSentence = (sentence: string) =>
    sentence.split(/(\s+)/).map((token, i) => {
      if (!highlight || /^\s+$/.test(token)) return <Fragment key={i}>{token}</Fragment>;
      // Handle hyphenated words piece by piece.
      const parts = token.split(/(-)/);
      return (
        <Fragment key={i}>
          {parts.map((part, j) => {
            const hit = isKeyword(part) && have.has(stem(normalizeWord(part)));
            return hit ? <mark key={j} className="hit">{part}</mark> : <Fragment key={j}>{part}</Fragment>;
          })}
        </Fragment>
      );
    });

  return (
    <div className="screen wide">
      <header className="screen-head">
        <h1>Compare your answer</h1>
        <p className="lede">Read through what you wrote, then reveal your teacher&rsquo;s answer when you&rsquo;re ready.</p>
      </header>

      <div className="compare">
        <section className="card">
          <div className="card-head">
            <label htmlFor="review-notes" className="field-label">Your answer</label>
            <span className="muted small-text">You can still edit</span>
          </div>
          <textarea
            id="review-notes"
            className="textarea notes-input"
            value={p.notes}
            onChange={(e) => p.onNotesChange(e.target.value)}
            placeholder="You didn't write anything this time — that's fine. Listening is practice too."
            rows={12}
          />
        </section>

        <section className="card" aria-labelledby="teacher-head">
          <div className="card-head">
            <h2 id="teacher-head" className="field-label">Teacher&rsquo;s answer</h2>
            {revealed && (
              <button type="button" className="link-button" onClick={() => setRevealed(false)}>
                <EyeOffIcon size={16} /> Hide
              </button>
            )}
          </div>

          {revealed ? (
            <div className="teacher">
              <div className="coverage">
                <div>
                  <strong>{coverage.found} of {coverage.total}</strong> key words appear in your answer
                  <div className="meter" aria-hidden="true">
                    <span style={{ width: `${coverage.total ? (coverage.found / coverage.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
                  Highlight matches
                </label>
              </div>
              <ol className="teacher-sentences">
                {p.sentences.map((s, i) => <li key={i}>{renderSentence(s)}</li>)}
              </ol>
              <p className="muted small-text">
                Key-word matching is a rough guide. Check whether your answer carries the same ideas, not just the same words.
              </p>
            </div>
          ) : (
            <div className="reveal-box">
              <p className="muted">Hidden until you&rsquo;re ready to compare.</p>
              <button type="button" className="button primary" onClick={() => setRevealed(true)}>
                <EyeIcon size={18} /> Reveal teacher&rsquo;s answer
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="actions split">
        <button type="button" className="button ghost" onClick={p.onBack}>Back to practice</button>
        <div className="actions-right">
          <button type="button" className="button secondary" onClick={p.onNewAnswer}>New answer</button>
          <button type="button" className="button primary" onClick={p.onPracticeAgain}>Practice again</button>
        </div>
      </div>
      <p className="right muted small-text">&ldquo;Practice again&rdquo; clears your answer and starts from the first sentence.</p>
    </div>
  );
}
