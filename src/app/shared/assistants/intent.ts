// Multinomial Naive Bayes with Laplace smoothing. The small Spanish training
// corpus is shipped with the app; inference never sends a question off-device.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const stop = new Set(
  'a al la las el los de del con que un una en y me mi para puedo hay cuanto cuantos cuales se por tengo quiero ver'.split(
    ' ',
  ),
);
function tokens(text: string): string[] {
  return (normalize(text).match(/[a-z]+/g) ?? []).filter((w) => !stop.has(w));
}

export function trainIntents<K extends string>(examples: Record<K, string[]>) {
  const vocabulary = new Set<string>();
  const models = (Object.keys(examples) as K[]).map((intent) => {
    const words = examples[intent].flatMap(tokens);
    const counts = new Map<string, number>();
    for (const word of words) {
      vocabulary.add(word);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return { intent, count: words.length, counts };
  });
  return (question: string): K | null => {
    const words = tokens(question).filter((w) => vocabulary.has(w));
    if (!words.length) return null;
    const ranked = models
      .map((m) => ({
        intent: m.intent,
        score: words.reduce(
          (s, w) => s + Math.log(((m.counts.get(w) ?? 0) + 1) / (m.count + vocabulary.size)),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score);
    return ranked[0].score - ranked[1].score >= 0.25 ? ranked[0].intent : null;
  };
}
