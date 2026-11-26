// Text helpers: sentence splitting, speech chunking and word positions.

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "vs", "etc", "e.g", "i.e",
  "eg", "ie", "fig", "no", "nos", "vol", "approx", "inc", "ltd", "co", "corp", "dept",
  "est", "cf", "al", "ca", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep",
  "sept", "oct", "nov", "dec", "a.m", "p.m", "u.s", "u.k", "ph.d",
]);

const BULLET = /^\s*(?:[-*•‣◦▪]|\d+[.)]|[a-zA-Z][.)])\s+/;

/** Split an answer into sentences. Line breaks always end a sentence. */
export function splitSentences(text: string): string[] {
  return splitAnswer(text).lines;
}

/**
 * Split an answer into sentences ("lines") and note which paragraph each one
 * belongs to. Every line break in the pasted text starts a new paragraph.
 */
export function splitAnswer(text: string): { lines: string[]; paragraph: number[] } {
  const out: string[] = [];
  const paragraph: number[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para = -1;

  for (const rawLine of lines) {
    const line = rawLine.replace(BULLET, "").trim();
    if (!line) continue;
    para++;
    const before = out.length;

    const terminator = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
    let start = 0;
    let match: RegExpExecArray | null;

    while ((match = terminator.exec(line))) {
      const end = match.index + match[0].length;
      if (match[0].startsWith(".") && !isRealSentenceEnd(line, match.index, end)) continue;
      const sentence = line.slice(start, end).trim();
      if (sentence) out.push(sentence);
      start = end;
    }
    const rest = line.slice(start).trim();
    if (rest) out.push(rest);
    for (let i = before; i < out.length; i++) paragraph.push(para);
  }
  return { lines: out, paragraph };
}

function isRealSentenceEnd(line: string, dotIndex: number, end: number): boolean {
  const before = line.slice(0, dotIndex);
  const word = before.slice(before.search(/\S+$/)).toLowerCase().replace(/^[("'“‘]+/, "");
  if (ABBREVIATIONS.has(word)) return false;
  if (/^[a-z]$/i.test(word)) return false; // initials such as "J. Smith"
  const next = line.slice(end).trimStart();
  if (next && /^[a-z]/.test(next)) return false; // "approx. five" style continuations
  return true;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Start index of the word that contains (or ends right before) `pos`. */
export function wordStartAt(text: string, pos: number): number {
  let p = Math.max(0, Math.min(Math.floor(pos), text.length));
  if (p >= text.length) return text.length;
  while (p > 0 && !/\s/.test(text[p - 1])) p--;
  return p;
}

export interface SpeechChunk {
  start: number;
  end: number;
  text: string;
  /** Take a short break before this chunk (it starts at a punctuation break). */
  breakBefore: boolean;
}

const MAX_CHUNK = 170;
const MIN_CHUNK = 50;

/**
 * Break text[from, to) into utterance-sized pieces. Pieces are cut at every
 * break point (so a short pause can go there), and long pieces are cut again
 * at clause punctuation. Short utterances also avoid Chrome's ~15 s cut-off
 * and give a finer position estimate on voices without word boundaries.
 */
export function chunkForSpeech(text: string, from: number, to = text.length, breaks: number[] = []): SpeechChunk[] {
  const end = Math.min(to, text.length);
  const cuts = breaks.filter((b) => b > from && b < end).sort((a, b) => a - b);
  const pieces: [number, number, boolean][] = [];
  let last = from;
  for (const c of cuts) {
    pieces.push([last, c, last !== from || breaks.includes(from)]);
    last = c;
  }
  pieces.push([last, end, last !== from || breaks.includes(from)]);

  const chunks: SpeechChunk[] = [];
  for (const [pFrom, pTo, breakBefore] of pieces) {
    let start = pFrom;
    while (start < pTo && /\s/.test(text[start])) start++;
    let first = true;
    while (start < pTo) {
      let stop = pTo;
      if (stop - start > MAX_CHUNK) {
        const window = text.slice(start, start + MAX_CHUNK);
        let cut = -1;
        const clause = /[,;:—–)]\s/g;
        let m: RegExpExecArray | null;
        while ((m = clause.exec(window))) if (m.index + 1 >= MIN_CHUNK) cut = m.index + 1;
        if (cut < 0) cut = window.lastIndexOf(" ");
        if (cut <= 0) cut = MAX_CHUNK;
        stop = start + cut;
      }
      const piece = text.slice(start, stop);
      if (piece.trim()) chunks.push({ start, end: stop, text: piece, breakBefore: first && breakBefore && chunks.length > 0 });
      first = false;
      start = stop;
      while (start < pTo && /\s/.test(text[start])) start++;
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Words across the whole answer

export interface Word {
  line: number;
  /** Character range in the original line, including attached punctuation. */
  start: number;
  end: number;
}

/**
 * Words of one line. Punctuation never counts as a word: a stand-alone mark
 * (like a dash between spaces) is attached to the word before it, or to the
 * next word at the start of a line.
 */
export function lineWords(line: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let pendingStart: number | null = null;
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    const hasWord = /[\p{L}\p{N}]/u.test(m[0]);
    if (!hasWord) {
      if (out.length) out[out.length - 1].end = end;
      else if (pendingStart === null) pendingStart = start;
      continue;
    }
    out.push({ start: pendingStart ?? start, end });
    pendingStart = null;
  }
  return out;
}

export function buildWords(lines: string[]): Word[] {
  const words: Word[] = [];
  lines.forEach((line, i) => lineWords(line).forEach((w) => words.push({ line: i, ...w })));
  return words;
}

/** Index of the word in `line` containing (or nearest before) character `pos`. */
export function wordAt(words: Word[], line: number, pos: number): number {
  let found = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.line < line) continue;
    if (w.line > line) break;
    if (found < 0 || w.start <= pos) found = i;
    if (w.start > pos) break;
  }
  return found < 0 ? 0 : found;
}

/** The next group of up to `size` words starting at word `from`, never crossing a line. */
export function groupFrom(words: Word[], from: number, size: number): { first: number; last: number } {
  let last = from;
  while (last + 1 < words.length && last + 1 - from < size && words[last + 1].line === words[from].line) last++;
  return { first: from, last };
}
