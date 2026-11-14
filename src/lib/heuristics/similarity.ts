/**
 * Keyword similarity for local mode (`search.posts`, `search.similar`) and as the fallback
 * when embeddings are unavailable. Pure: no DOM, no network.
 *
 * Method: tokenise (lower-case, accents stripped, FR + EN stop-words removed, light plural
 * stemming), weight fields (title > tags > body > code), TF-IDF vectors, then
 * `similarity = 0.5 × cosine + 0.5 × coverage` where coverage is the IDF-weighted share of
 * the query terms found in the document. The result is always in 0..1.
 */

const STOP_WORDS = new Set(
  (
    // French
    'a au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y ' +
    'ai as avait avez avoir avons ont sont suis est etait ete etre es fait faire fais font peut peux veux veut dois doit ' +
    'alors apres aussi autre avant bien car cela ca chez comme comment donc encore entre ici la-bas lors moins non oui plus pourquoi quand quel quelle quelles quels sans si sous tout tous toute toutes tres trop vers voici voila deja jamais toujours juste quelque chose ' +
    'bonjour salut merci svp help aide quelqu ' +
    // English
    'about after again all also am an and any are aren as at be because been before being both but by can cannot could did do does doing don down each few for from further had has have having he her here hers him his how i if in into is isn it its itself just me more most my myself no nor not of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours ' +
    'hello hi thanks please using use used get got one two'
  ).split(/\s+/),
);

/** Spellings that should end up as a single token. */
const ALIASES: [RegExp, string][] = [
  [/\bnode\.?js\b/g, 'nodejs'],
  [/\bnext\.?js\b/g, 'nextjs'],
  [/\bvue\.?js\b/g, 'vuejs'],
  [/\breact[\s-]native\b/g, 'reactnative'],
  [/\bc\+\+/g, 'cpp'],
  [/\bc#/g, 'csharp'],
  [/\bz-index\b/g, 'zindex'],
  [/\bre-?rend(?:er|u)s?\b/g, 'rerender'],
];

export function normalizeText(text: string): string {
  let out = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [pattern, replacement] of ALIASES) out = out.replace(pattern, replacement);
  return out;
}

function stem(token: string): string {
  if (token.length > 4 && /[^s]s$/.test(token)) return token.slice(0, -1);
  if (token.length > 5 && token.endsWith('aux')) return `${token.slice(0, -3)}al`;
  return token;
}

/** Lower-cased, accent-free, stop-word-free tokens (identifiers and error codes are kept whole). */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of normalizeText(text).split(/[^a-z0-9_]+/)) {
    if (!raw) continue;
    const token = raw.replace(/^_+|_+$/g, '');
    if (token.length < 2 && !/^\d$/.test(token)) continue;
    if (STOP_WORDS.has(token)) continue;
    tokens.push(stem(token));
  }
  return tokens;
}

export interface SimilarityDoc {
  id: string;
  title: string;
  body?: string | null;
  /** Interest slugs or labels. */
  tags?: readonly string[];
  code?: string | null;
}

export interface SimilarityHit {
  id: string;
  /** 0..1 */
  similarity: number;
}

export interface QueryOptions {
  limit?: number;
  /** Hits below this similarity are dropped. Default 0.08. */
  minSimilarity?: number;
  /** Match unfinished words by prefix (search-as-you-type). Default true. */
  prefix?: boolean;
}

export interface SimilarityIndex {
  size: number;
  query(text: string, options?: QueryOptions): SimilarityHit[];
}

const FIELD_BOOST = { title: 3, tags: 2, body: 1, code: 0.5 } as const;

function addTokens(target: Map<string, number>, text: string | null | undefined, boost: number): void {
  if (!text) return;
  for (const token of tokenize(text)) target.set(token, (target.get(token) ?? 0) + boost);
}

function toVector(counts: Map<string, number>, idf: (term: string) => number): { vector: Map<string, number>; norm: number } {
  const vector = new Map<string, number>();
  let sum = 0;
  for (const [term, count] of counts) {
    const weight = (1 + Math.log(count)) * idf(term);
    if (weight <= 0) continue;
    vector.set(term, weight);
    sum += weight * weight;
  }
  return { vector, norm: Math.sqrt(sum) };
}

/** Builds a TF-IDF index over the documents. Cheap enough to rebuild whenever the corpus changes. */
export function createSimilarityIndex(docs: readonly SimilarityDoc[]): SimilarityIndex {
  const counts = docs.map((doc) => {
    const map = new Map<string, number>();
    addTokens(map, doc.title, FIELD_BOOST.title);
    addTokens(map, doc.tags?.join(' '), FIELD_BOOST.tags);
    addTokens(map, doc.body, FIELD_BOOST.body);
    addTokens(map, doc.code, FIELD_BOOST.code);
    return map;
  });

  const documentFrequency = new Map<string, number>();
  for (const map of counts) for (const term of map.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const vocabulary = [...documentFrequency.keys()].sort();
  const total = docs.length;
  const idf = (term: string): number => Math.log(1 + total / (1 + (documentFrequency.get(term) ?? 0)));

  const vectors = counts.map((map) => toVector(map, idf));

  return {
    size: total,
    query(text, options = {}) {
      const limit = options.limit ?? 10;
      const minSimilarity = options.minSimilarity ?? 0.08;
      const usePrefix = options.prefix ?? true;

      const queryCounts = new Map<string, number>();
      for (const token of tokenize(text)) {
        if (documentFrequency.has(token) || !usePrefix || token.length < 3) {
          queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
          continue;
        }
        // Unknown word: treat it as the beginning of known words ("useeff" → "useeffect").
        const expansions = vocabulary.filter((term) => term.startsWith(token)).slice(0, 5);
        if (expansions.length === 0) queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
        for (const term of expansions) queryCounts.set(term, (queryCounts.get(term) ?? 0) + 0.7 / expansions.length + 0.3);
      }
      if (queryCounts.size === 0 || total === 0) return [];

      const query = toVector(queryCounts, idf);
      if (query.norm === 0) return [];
      let queryIdfTotal = 0;
      for (const term of query.vector.keys()) queryIdfTotal += idf(term);

      const hits: SimilarityHit[] = [];
      for (let i = 0; i < total; i++) {
        const doc = vectors[i]!;
        if (doc.norm === 0) continue;
        let dot = 0;
        let covered = 0;
        for (const [term, weight] of query.vector) {
          const docWeight = doc.vector.get(term);
          if (docWeight === undefined) continue;
          dot += weight * docWeight;
          covered += idf(term);
        }
        if (dot === 0) continue;
        const cosine = dot / (query.norm * doc.norm);
        const coverage = queryIdfTotal > 0 ? covered / queryIdfTotal : 0;
        const similarity = Math.min(1, Math.max(0, 0.5 * cosine + 0.5 * coverage));
        if (similarity >= minSimilarity) hits.push({ id: docs[i]!.id, similarity: Math.round(similarity * 1000) / 1000 });
      }

      hits.sort((a, b) => b.similarity - a.similarity || (a.id < b.id ? -1 : 1));
      return hits.slice(0, limit);
    },
  };
}

/** Quick pairwise similarity (0..1) between two texts, without a corpus: cosine over term counts. */
export function textSimilarity(a: string, b: string): number {
  const countsA = new Map<string, number>();
  const countsB = new Map<string, number>();
  for (const token of tokenize(a)) countsA.set(token, (countsA.get(token) ?? 0) + 1);
  for (const token of tokenize(b)) countsB.set(token, (countsB.get(token) ?? 0) + 1);
  if (countsA.size === 0 || countsB.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, count] of countsA) {
    normA += count * count;
    dot += count * (countsB.get(term) ?? 0);
  }
  for (const count of countsB.values()) normB += count * count;
  return Math.min(1, dot / Math.sqrt(normA * normB));
}
