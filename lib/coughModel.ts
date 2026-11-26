// Loads Google's YAMNet sound classifier (served from /public/models/yamnet)
// and scores short clips for coughing. Runs entirely in the browser.
// TensorFlow.js is imported lazily so it is only downloaded when cough
// detection is switched on.

import type { GraphModel } from "@tensorflow/tfjs-converter";

export const YAMNET_SAMPLE_RATE = 16000;
/** YAMNet analyses 0.975 s windows. */
export const YAMNET_WINDOW = 15600;
/** Index of "Cough" in YAMNet's 521 AudioSet classes. */
const COUGH_CLASS = 42;
const NUM_CLASSES = 521;

type Tf = typeof import("@tensorflow/tfjs-core");

let loading: Promise<{ tf: Tf; model: GraphModel; backend: string }> | null = null;

export function loadCoughModel(): Promise<{ tf: Tf; model: GraphModel; backend: string }> {
  if (!loading) {
    loading = (async () => {
      const [tf, converter] = await Promise.all([
        import("@tensorflow/tfjs-core"),
        import("@tensorflow/tfjs-converter"),
        import("@tensorflow/tfjs-backend-webgl"),
        import("@tensorflow/tfjs-backend-cpu"),
      ]);
      try {
        if (!(await tf.setBackend("webgl"))) throw new Error("webgl unavailable");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      const model = await converter.loadGraphModel("/models/yamnet/model.json");
      // Warm up once so the first real check isn't slow.
      const warm = tf.zeros([YAMNET_WINDOW]);
      const out = model.predict(warm) as import("@tensorflow/tfjs-core").Tensor[];
      await Promise.all(out.map((t) => t.data()));
      tf.dispose([warm, ...out]);
      return { tf, model, backend: tf.getBackend() };
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/**
 * Sounds that can look like a cough to the model. A cough only counts when its
 * score beats all of these: speech, laughter, breathing, wheeze, snore, gasp,
 * pant, snort, sneeze, sniff.
 */
const RIVAL_CLASSES = [0, 13, 14, 15, 16, 17, 18, 36, 37, 38, 39, 40, 41, 44, 45];

/**
 * Everyday sounds that are clearly NOT a cough: talking (speech, conversation,
 * narration, babbling, whispering, singing, the app's own synthetic voice),
 * laughing, breathing sounds (breathing, wheeze, snore, gasp, pant, snort,
 * sniff), and typing / keyboard / writing.
 */
const NOT_COUGH_CLASSES = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 24, 36, 37, 38, 39, 40, 41, 45, 378, 379, 380, 381];

/** Boost quiet clips so a faint cough looks like a normal one (capped, so silence stays silence). */
export const NORMALIZE = false;
const NORMALIZE_TARGET = 0.3;
const NORMALIZE_MAX_GAIN = 10 ** (30 / 20);

function normalize(clip: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < clip.length; i++) peak = Math.max(peak, Math.abs(clip[i]));
  const gain = Math.min(NORMALIZE_MAX_GAIN, NORMALIZE_TARGET / (peak + 1e-9));
  const out = new Float32Array(clip.length);
  for (let i = 0; i < clip.length; i++) out[i] = clip[i] * gain;
  return out;
}

/**
 * Cough score (0-1) and the best rival score from the frame where the cough
 * stands out most, plus `notCough`: the highest score for a sound that is
 * clearly something else (talking, laughing, typing, writing) in any frame.
 */
export async function coughScores(clip16k: Float32Array): Promise<{ cough: number; rival: number; notCough: number }> {
  const { tf, model } = await loadCoughModel();
  const input = tf.tensor1d(NORMALIZE ? normalize(clip16k) : clip16k);
  const outputs = model.predict(input) as import("@tensorflow/tfjs-core").Tensor[];
  try {
    // Outputs are [spectrogram, embeddings, scores] in this build; pick by shape to be safe.
    const scores = outputs.find((t) => t.shape[t.shape.length - 1] === NUM_CLASSES);
    if (!scores) throw new Error("Unexpected YAMNet outputs");
    const rows = (await scores.array()) as number[][];
    let best = { cough: 0, rival: 1 };
    let notCough = 0;
    for (const r of rows) {
      const rival = Math.max(...RIVAL_CLASSES.map((k) => r[k]));
      if (r[COUGH_CLASS] - rival > best.cough - best.rival) best = { cough: r[COUGH_CLASS], rival };
      notCough = Math.max(notCough, ...NOT_COUGH_CLASSES.map((k) => r[k]));
    }
    return { ...best, notCough };
  } finally {
    tf.dispose([input, ...outputs]);
  }
}

/** Downsample to 16 kHz, averaging each source span (a cheap anti-alias filter). */
export function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (fromRate === YAMNET_SAMPLE_RATE) return samples;
  const ratio = fromRate / YAMNET_SAMPLE_RATE;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / (end - start);
  }
  return out;
}
