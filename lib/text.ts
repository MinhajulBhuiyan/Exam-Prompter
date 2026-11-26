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
  const out: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.replace(BULLET, "").trim();
    if (!line) continue;

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
  }
  return out;
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
}

const MAX_CHUNK = 170;
const MIN_CHUNK = 50;

/**
 * Break the rest of a sentence (from `from`) into utterance-sized pieces.
 * Short utterances avoid Chrome's ~15s cut-off and give a finer position
 * estimate on voices that don't report word boundaries.
 */
export function chunkForSpeech(text: string, from: number): SpeechChunk[] {
  let start = from;
  while (start < text.length && /\s/.test(text[start])) start++;
  if (start >= text.length) return [];

  const chunks: SpeechChunk[] = [];
  while (start < text.length) {
    let end = text.length;
    if (end - start > MAX_CHUNK) {
      const window = text.slice(start, start + MAX_CHUNK);
      let cut = -1;
      const clause = /[,;:—–)]\s/g;
      let m: RegExpExecArray | null;
      while ((m = clause.exec(window))) if (m.index + 1 >= MIN_CHUNK) cut = m.index + 1;
      if (cut < 0) cut = window.lastIndexOf(" ");
      if (cut <= 0) cut = MAX_CHUNK;
      end = start + cut;
    }
    chunks.push({ start, end, text: text.slice(start, end) });
    start = end;
    while (start < text.length && /\s/.test(text[start])) start++;
  }
  return chunks;
}
