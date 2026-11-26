// Turns a line into what should be spoken when "read punctuation aloud" is on,
// e.g. "The plant's leaves (mostly), absorb light." →
//      "The plant apostrophe s leaves open bracket mostly close bracket comma, absorb light full stop."
//
// `map[i]` gives, for each character of the spoken text, the index of the
// character in the original line it came from, so the prompter can still
// highlight the right word and rewinds land in the right place.

export interface SpokenText {
  text: string;
  map: number[];
  /** Spoken-text positions where a short break goes (before/after a punctuation name). */
  breaks: number[];
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const isDigit = (c: string | undefined) => !!c && /\d/.test(c);

/** Words for each mark. A trailing , . ; : ? ! keeps the natural pause after the word. */
const NAMES: Record<string, string> = {
  ",": "comma,",
  ";": "semicolon;",
  ":": "colon:",
  "?": "question mark?",
  "!": "exclamation mark!",
  "(": "open bracket",
  ")": "close bracket",
  "[": "open square bracket",
  "]": "close square bracket",
  "{": "open curly bracket",
  "}": "close curly bracket",
  "“": "open quote",
  "”": "close quote",
  "/": "slash",
  "&": "ampersand",
  "%": "percent",
  "…": "ellipsis.",
  "—": "dash",
  "–": "dash",
};

export function speakPunctuation(line: string): SpokenText {
  let text = "";
  const map: number[] = [];
  const breaks: number[] = [];

  const put = (s: string, from: number) => {
    for (const ch of s) {
      text += ch;
      map.push(from);
    }
  };
  /** Say a punctuation name with a short break before it (and after it, for opening and in-word marks). */
  const word = (name: string, from: number, breakAfter = false) => {
    if (text && !text.endsWith(" ")) put(" ", from);
    if (text) breaks.push(text.length);
    put(name, from);
    put(" ", from);
    if (breakAfter) breaks.push(text.length);
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const prev = line[i - 1];
    const next = line[i + 1];

    if (/\s/.test(c)) {
      if (text && !text.endsWith(" ")) put(" ", i);
      continue;
    }
    if (isWordChar(c)) {
      put(c, i);
      continue;
    }

    if (c === "'" || c === "’" || c === "‘") {
      if (isWordChar(prev) && isWordChar(next)) word("apostrophe", i, true);
      else if (isWordChar(prev) && prev && /s/i.test(prev) && !isWordChar(next)) word("apostrophe", i); // plurals: "students'"
      else if (isWordChar(next)) word("open quote", i, true);
      else word("close quote", i);
      continue;
    }
    if (c === '"') {
      const opening = !isWordChar(prev) && isWordChar(next);
      word(opening ? "open quote" : "close quote", i, opening);
      continue;
    }
    if (c === "-") {
      if (isWordChar(prev) && isWordChar(next)) word("hyphen", i, true);
      else word("dash", i);
      continue;
    }
    if (c === ".") {
      if (next === "." && line[i + 2] === ".") { word("ellipsis.", i); i += 2; continue; }
      if (isDigit(prev) && isDigit(next)) { word("point", i); continue; }
      word("full stop.", i);
      continue;
    }
    if (c === "," && isDigit(prev) && isDigit(next) && /\d{3}/.test(line.slice(i + 1, i + 4))) {
      continue; // thousands separator in 1,000 — just say the number
    }
    const name = NAMES[c];
    if (name) word(name, i, /^open/.test(name));
    else put(c, i);
  }

  // Trim the trailing space but keep the map aligned (one entry per character + an end marker).
  while (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  map.push(line.length);
  return { text, map, breaks: breaks.filter((b) => b > 0 && b < text.length) };
}

export function plainSpoken(line: string): SpokenText {
  return { text: line, map: Array.from({ length: line.length + 1 }, (_, i) => i), breaks: [] };
}
