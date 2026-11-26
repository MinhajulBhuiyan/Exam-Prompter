// Voice choice by accent. Browsers only offer the voices installed on the
// device (plus a few online ones), so this sorts what's there and picks the
// best match for the preferred accent.

export type Accent = "south-asian" | "british" | "american";

const SOUTH_ASIAN_LANGS = ["en-in", "en-bd", "en-pk", "en-lk", "en-np"];
/** Known South Asian English voices whose language tag isn't always set correctly. */
const SOUTH_ASIAN_NAMES = /india|indian|bangla|heera|ravi|neerja|prabhat|rishi|veena|kajal|aditi|raveena|isha|sangeeta/i;

const lang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-");

export function isEnglishVoice(v: SpeechSynthesisVoice): boolean {
  return lang(v).startsWith("en");
}

export function accentOf(v: SpeechSynthesisVoice): Accent | "other" {
  const l = lang(v);
  if (SOUTH_ASIAN_LANGS.includes(l) || SOUTH_ASIAN_NAMES.test(v.name)) return "south-asian";
  if (l === "en-gb" || l === "en-ie") return "british";
  if (l === "en-us" || l === "en") return "american";
  return "other";
}

/** Higher = clearer. Natural/neural/online voices sound much more human. */
function quality(v: SpeechSynthesisVoice): number {
  let q = 0;
  if (/natural|neural|premium|enhanced/i.test(v.name)) q += 3;
  if (/online|google/i.test(v.name) || !v.localService) q += 1;
  if (v.default) q += 0.5;
  return q;
}

/** Best voice for the accent, falling back to any English voice. */
export function pickVoice(list: SpeechSynthesisVoice[], accent: Accent): SpeechSynthesisVoice | null {
  const english = list.filter(isEnglishVoice);
  const best = (vs: SpeechSynthesisVoice[]) => [...vs].sort((a, b) => quality(b) - quality(a))[0] ?? null;
  return best(english.filter((v) => accentOf(v) === accent)) ?? best(english);
}

/** Voices grouped for the picker, the preferred accent first. */
export function groupVoices(list: SpeechSynthesisVoice[], accent: Accent) {
  const order: (Accent | "other")[] = [accent, ...(["south-asian", "british", "american", "other"] as const).filter((a) => a !== accent)];
  const names: Record<Accent | "other", string> = {
    "south-asian": "South Asian English",
    british: "British English",
    american: "American English",
    other: "Other English",
  };
  return order
    .map((a) => ({
      label: names[a],
      voices: list.filter((v) => isEnglishVoice(v) && accentOf(v) === a).sort((x, y) => quality(y) - quality(x)),
    }))
    .filter((g) => g.voices.length);
}
