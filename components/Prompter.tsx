"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import type { Word } from "@/lib/text";

interface Props {
  lines: string[];
  /** Paragraph number of each line. */
  paragraphOf: number[];
  words: Word[];
  /** Words being read now, or just read (dictation group / rest of line). */
  segment: { first: number; last: number } | null;
  /** Word being spoken right now. */
  speakingWord: number | null;
  /** Word chosen to continue from (while paused). */
  marker: number | null;
  /** Show real words (otherwise grey bars). */
  showText: boolean;
  finished: boolean;
  onPick: (wordIndex: number) => void;
}

/**
 * Teleprompter: all lines, the active one highlighted and kept in view.
 * Every word can be tapped to choose where reading continues.
 */
export default function Prompter({ lines, paragraphOf, words, segment, speakingWord, marker, showText, finished, onPick }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const byLine = useMemo(() => {
    const out: { g: number; w: Word }[][] = lines.map(() => []);
    words.forEach((w, g) => out[w.line]?.push({ g, w }));
    return out;
  }, [lines, words]);

  const focusWord = marker ?? speakingWord ?? segment?.first ?? null;
  const activeLine = focusWord !== null && words[focusWord] ? words[focusWord].line : finished ? lines.length - 1 : 0;

  useEffect(() => {
    const box = boxRef.current;
    const line = activeRef.current;
    if (!box || !line) return;
    const target = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeLine]);

  return (
    <div className={`prompter ${showText ? "" : "masked"} ${marker !== null ? "picking" : ""}`} ref={boxRef} aria-label="Prompter. Tap a word to continue from there.">
      <ol>
        {lines.map((line, li) => {
          const lineState = finished || li < activeLine ? "read" : li === activeLine ? "current" : "next";
          const items = byLine[li];
          let cursor = 0;
          return (
            <li
              key={li}
              ref={li === activeLine ? activeRef : undefined}
              className={`${lineState} ${li > 0 && paragraphOf[li] !== paragraphOf[li - 1] ? "para-start" : ""}`}
            >
              <span className="line-num" aria-hidden="true">{li + 1}</span>
              <span className={`line-text ${showText ? "" : "hidden-line"}`}>
                {items.map(({ g, w }) => {
                  const gap = line.slice(cursor, w.start);
                  cursor = w.end;
                  const inSegment = segment !== null && g >= segment.first && g <= segment.last;
                  const cls = [
                    "word",
                    inSegment ? "in-group" : "",
                    g === speakingWord ? "now" : "",
                    g === marker ? "marker" : "",
                    segment !== null && g < segment.first && li === activeLine ? "done" : "",
                  ].join(" ");
                  const text = line.slice(w.start, w.end);
                  return (
                    <Fragment key={g}>
                      {showText ? gap : null}
                      <span
                        role="button"
                        tabIndex={-1}
                        className={cls}
                        onClick={() => onPick(g)}
                        aria-label={showText ? undefined : `Word ${g + 1}`}
                        style={showText ? undefined : { width: `${Math.min(8, Math.max(2, text.length)) * 0.55}em` }}
                      >
                        {showText ? text : null}
                      </span>
                    </Fragment>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
