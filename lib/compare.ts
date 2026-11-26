// A simple, local key-word comparison. No AI: it only checks which
// meaningful words from the teacher's answer appear in the student's notes.

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being
  below between both but by can could did do does doing down during each few for from further had has
  have having he her here hers herself him himself his how i if in into is it its itself just let me
  more most my myself no nor not now of off on once only or other our ours ourselves out over own same
  she should so some such than that the their theirs them themselves then there these they this those
  through to too under until up very was we were what when where which while who whom why will with
  would you your yours yourself yourselves called use used using make makes made many much may might
  must one two three like via within without upon onto per thus therefore however`.split(/\s+/),
);

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[’']/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

/** Very light stemming so "plants" matches "plant" and "converted" matches "convert". */
export function stem(word: string): string {
  let w = word.replace(/'s$/, "");
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ied")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es") && /(ss|sh|ch|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

export function isKeyword(word: string): boolean {
  const n = normalizeWord(word);
  return n.length >= 3 && !STOPWORDS.has(n) && !/^\d+$/.test(n);
}

export function notesStems(notes: string): Set<string> {
  const set = new Set<string>();
  for (const token of notes.split(/[^A-Za-z0-9'’-]+/)) {
    for (const part of token.split("-")) {
      const n = normalizeWord(part);
      if (n) set.add(stem(n));
    }
  }
  return set;
}

export interface Coverage {
  found: number;
  total: number;
}

export function keywordCoverage(answer: string, notes: string): Coverage {
  const have = notesStems(notes);
  const keys = new Set<string>();
  for (const token of answer.split(/[^A-Za-z0-9'’-]+/)) {
    for (const part of token.split("-")) if (isKeyword(part)) keys.add(stem(normalizeWord(part)));
  }
  let found = 0;
  keys.forEach((k) => { if (have.has(k)) found++; });
  return { found, total: keys.size };
}
