/**
 * devloop — feed scoring, explanation and interest learning (docs/SPEC.md §6).
 *
 * Pure, framework-free and deterministic: every function takes `now` (epoch ms) explicitly
 * and never reads the clock, the DOM or storage. The SQL implementation
 * (`feed_for_user`, `record_event`) follows the same rules; the choices the spec leaves
 * open are marked "Interpretation" below.
 */
import type { EventType, FeedReason, InterestSource, Level, PostKind, PostStatus } from '../api/contract';

// ── Constants (SPEC §6) ──────────────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  /** × Σ effective weight of the post's tags. */
  interest: 3.0,
  /** × exp(-ageHours / RECENCY_TAU_HOURS). */
  recency: 1.5,
  /** × ln(1 + helpfulCount + 2·solved). */
  quality: 0.8,
  /** × level match (1 same level, 0.5 adjacent, 0 otherwise). */
  level: 1.0,
  /** + when the author is followed by the viewer. */
  following: 0.6,
} as const;

export const RECENCY_TAU_HOURS = 72;
/** Effective weight = weight × DECAY_PER_DAY ^ days since the last update. */
export const DECAY_PER_DAY = 0.98;
/** Every 8th slot of the "for you" feed is an exploration slot. */
export const EXPLORE_EVERY = 8;
/** A topic counts as "not tried much" below this effective weight. */
export const EXPLORE_THRESHOLD = 0.15;
/** Minimum effective weight for an `interest` reason chip. */
export const INTEREST_REASON_THRESHOLD = 0.15;
export const FRESH_HOURS = 6;
export const MAX_REASONS = 2;
/** A dwell only counts from this many seconds. */
export const DWELL_MIN_SECONDS = 10;
/** `recentOpens` looks at this many days of history. */
export const RECENT_OPENS_DAYS = 14;
/** Base weight given to the interests picked during onboarding. */
export const ONBOARDING_WEIGHT = 0.6;

/** Learning gains: w ← clamp01(w + gain × (1 − w)). `less` is handled separately (halves the weight). */
export const EVENT_GAINS: Record<Exclude<EventType, 'less'>, number> = {
  impression: 0,
  open: 0.08,
  dwell: 0.08,
  expand_code: 0.05,
  copy_code: 0.1,
  run_repro: 0.1,
  helpful: 0.12,
  save: 0.12,
  answer: 0.2,
  accept: 0.2,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, senior: 2 };

// ── Types ────────────────────────────────────────────────────────────────────

/** One row of `user_interests`, keyed by interest slug in an `InterestMap`. */
export interface InterestState {
  /** Stored weight, 0..1 (before decay). */
  weight: number;
  muted: boolean;
  source: InterestSource;
  /** Weight to go back to on `resetLearning`; null for behaviour-only rows. */
  baseWeight: number | null;
  /** Epoch ms of the last change of `weight`. */
  updatedAt: number;
}

export type InterestMap = Record<string, InterestState>;

/** The minimum a post must expose to be scored. Extra fields are carried through untouched. */
export interface FeedPost {
  id: string;
  authorId: string;
  kind: PostKind;
  status: PostStatus;
  /** Interest slugs. */
  tags: readonly string[];
  difficulty: Level;
  helpfulCount: number;
  answerCount: number;
  /** Epoch ms or ISO-8601 string. */
  createdAt: number | string;
  circleSlug?: string | null;
}

export interface Viewer {
  id: string | null;
  level: Level;
  interests: InterestMap;
  /** Ids of the authors the viewer follows. */
  following: ReadonlySet<string>;
  /** Interest slug → posts of that topic opened in the last 14 days. */
  recentOpens?: Readonly<Record<string, number>>;
}

export interface ScoreBreakdown {
  interest: number;
  recency: number;
  quality: number;
  level: number;
  following: number;
  total: number;
}

export interface ExplainOptions {
  now: number;
  /** True when the post sits in an exploration slot. */
  explore?: boolean;
  /** Ids of the posts that are the most active of their circle over 48 h (see `pickTrending`). */
  trendingIds?: ReadonlySet<string>;
}

export interface RankOptions {
  now: number;
  trendingIds?: ReadonlySet<string>;
  /** Defaults to EXPLORE_EVERY; 0 disables exploration. */
  exploreEvery?: number;
  /**
   * Optional seeded RNG (see `mulberry32`). When given, an exploration slot picks at random
   * among the 3 best exploration candidates instead of always the best one.
   */
  rng?: () => number;
}

export interface RankedPost<T extends FeedPost = FeedPost> {
  post: T;
  score: number;
  reasons: FeedReason[];
  /** True when the post was placed by an exploration slot. */
  explore: boolean;
}

// ── Small helpers ────────────────────────────────────────────────────────────

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function toMs(date: number | string): number {
  return typeof date === 'number' ? date : Date.parse(date);
}

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1 when the levels are equal, 0.5 when adjacent, 0 otherwise. */
export function levelMatch(a: Level, b: Level): number {
  const gap = Math.abs(LEVEL_RANK[a] - LEVEL_RANK[b]);
  return gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
}

/** Decayed weight: `weight × 0.98 ^ days since updatedAt` (never grows when `now` is in the past). */
export function effectiveWeight(weight: number, updatedAt: number, now: number): number {
  const days = Math.max(0, (now - updatedAt) / DAY_MS);
  return clamp01(weight) * Math.pow(DECAY_PER_DAY, days);
}

/** Effective weight of one topic for a viewer; 0 when unknown or muted. */
export function topicWeight(interests: InterestMap, slug: string, now: number): number {
  const row = interests[slug];
  if (!row || row.muted) return 0;
  return effectiveWeight(row.weight, row.updatedAt, now);
}

/**
 * Interpretation of "muted tags excluded entirely": a muted tag never adds to the score,
 * and a post whose tags are *all* muted is removed from the "for you" feed. A post that
 * also carries a non-muted tag stays (it is ranked on that tag alone).
 */
export function isMutedOut(post: FeedPost, interests: InterestMap): boolean {
  return post.tags.length > 0 && post.tags.every((slug) => interests[slug]?.muted === true);
}

/** Exploration candidate: no muted tag and every tag below the exploration threshold. */
export function isExplorable(post: FeedPost, interests: InterestMap, now: number): boolean {
  if (post.tags.length === 0) return false;
  return post.tags.every((slug) => {
    const row = interests[slug];
    if (!row) return true;
    if (row.muted) return false;
    return effectiveWeight(row.weight, row.updatedAt, now) < EXPLORE_THRESHOLD;
  });
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function scoreBreakdown(post: FeedPost, viewer: Viewer, now: number): ScoreBreakdown {
  let tagWeights = 0;
  for (const slug of post.tags) tagWeights += topicWeight(viewer.interests, slug, now);

  const ageHours = Math.max(0, (now - toMs(post.createdAt)) / HOUR_MS);
  const interest = SCORE_WEIGHTS.interest * tagWeights;
  const recency = SCORE_WEIGHTS.recency * Math.exp(-ageHours / RECENCY_TAU_HOURS);
  const quality =
    SCORE_WEIGHTS.quality * Math.log(1 + Math.max(0, post.helpfulCount) + (post.status === 'solved' ? 2 : 0));
  const level = SCORE_WEIGHTS.level * levelMatch(post.difficulty, viewer.level);
  const following = viewer.following.has(post.authorId) ? SCORE_WEIGHTS.following : 0;

  return { interest, recency, quality, level, following, total: interest + recency + quality + level + following };
}

export function scorePost(post: FeedPost, viewer: Viewer, now: number): number {
  return scoreBreakdown(post, viewer, now).total;
}

// ── Reasons ("why am I seeing this?") ────────────────────────────────────────

/**
 * Reason chips for one card, at most MAX_REASONS, in the priority order of the spec:
 * following, interest, explore, trending, level, unanswered, fresh.
 */
export function explainPost(post: FeedPost, viewer: Viewer, options: ExplainOptions): FeedReason[] {
  const { now } = options;
  const reasons: FeedReason[] = [];

  if (viewer.following.has(post.authorId)) reasons.push({ kind: 'following' });

  let topSlug: string | null = null;
  let topWeight = 0;
  for (const slug of post.tags) {
    const weight = topicWeight(viewer.interests, slug, now);
    if (weight >= INTEREST_REASON_THRESHOLD && weight > topWeight) {
      topSlug = slug;
      topWeight = weight;
    }
  }
  if (topSlug) {
    reasons.push({ kind: 'interest', interestSlug: topSlug, count: viewer.recentOpens?.[topSlug] ?? 0 });
  }

  if (options.explore) {
    const slug = post.tags[0];
    reasons.push(slug ? { kind: 'explore', interestSlug: slug } : { kind: 'explore' });
  }

  if (options.trendingIds?.has(post.id)) {
    reasons.push(post.circleSlug ? { kind: 'trending', circleSlug: post.circleSlug } : { kind: 'trending' });
  }

  if (post.difficulty === viewer.level) reasons.push({ kind: 'level' });

  if (post.kind === 'problem' && post.status === 'open' && post.answerCount === 0) {
    reasons.push({ kind: 'unanswered' });
  }

  if (now - toMs(post.createdAt) < FRESH_HOURS * HOUR_MS) reasons.push({ kind: 'fresh' });

  return reasons.slice(0, MAX_REASONS);
}

// ── Ranking ──────────────────────────────────────────────────────────────────

function byNewest(a: FeedPost, b: FeedPost): number {
  return toMs(b.createdAt) - toMs(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * "For you" ranking: score order, with every `exploreEvery`-th slot given to the best post
 * among topics the viewer has not tried much. The viewer's own posts and fully muted posts
 * are left out. Stable: ties are broken by date, then id.
 */
export function rankFeed<T extends FeedPost>(posts: readonly T[], viewer: Viewer, options: RankOptions): RankedPost<T>[] {
  const { now } = options;
  const exploreEvery = options.exploreEvery ?? EXPLORE_EVERY;

  const scored = posts
    .filter((post) => post.authorId !== viewer.id && !isMutedOut(post, viewer.interests))
    .map((post) => ({ post, score: scorePost(post, viewer, now) }))
    .sort((a, b) => b.score - a.score || byNewest(a.post, b.post));

  const explorePool = exploreEvery > 0 ? scored.filter((entry) => isExplorable(entry.post, viewer.interests, now)) : [];
  const used = new Set<string>();
  const ranked: RankedPost<T>[] = [];
  let mainIndex = 0;
  let exploreIndex = 0;

  const place = (entry: { post: T; score: number }, explore: boolean) => {
    used.add(entry.post.id);
    ranked.push({
      post: entry.post,
      score: entry.score,
      explore,
      reasons: explainPost(entry.post, viewer, { now, explore, trendingIds: options.trendingIds }),
    });
  };

  while (ranked.length < scored.length) {
    const position = ranked.length + 1;
    if (exploreEvery > 0 && position % exploreEvery === 0) {
      while (exploreIndex < explorePool.length && used.has(explorePool[exploreIndex]!.post.id)) exploreIndex++;
      if (exploreIndex < explorePool.length) {
        let pick = explorePool[exploreIndex]!;
        if (options.rng) {
          const shortlist = explorePool.slice(exploreIndex).filter((entry) => !used.has(entry.post.id)).slice(0, 3);
          pick = shortlist[Math.floor(options.rng() * shortlist.length)] ?? pick;
        }
        place(pick, true);
        continue;
      }
    }
    while (mainIndex < scored.length && used.has(scored[mainIndex]!.post.id)) mainIndex++;
    if (mainIndex >= scored.length) break;
    place(scored[mainIndex]!, false);
  }

  return ranked;
}

/** Newest first (tabs `latest` and `following`). */
export function rankLatest<T extends FeedPost>(posts: readonly T[]): T[] {
  return [...posts].sort(byNewest);
}

/**
 * Tab `unanswered` — open problems nobody answered, "hardest matching level first".
 * Interpretation: problems at or below the viewer's level come first, hardest first;
 * problems above the viewer's level follow, easiest first; newest first inside a level.
 */
export function rankUnanswered<T extends FeedPost>(posts: readonly T[], viewer: Viewer): T[] {
  const viewerRank = LEVEL_RANK[viewer.level];
  const bucket = (post: FeedPost): number => {
    const rank = LEVEL_RANK[post.difficulty];
    return rank <= viewerRank ? viewerRank - rank : 10 + (rank - viewerRank);
  };
  return posts
    .filter((post) => post.kind === 'problem' && post.status === 'open' && post.answerCount === 0 && post.authorId !== viewer.id)
    .sort((a, b) => bucket(a) - bucket(b) || byNewest(a, b));
}

/**
 * Trending = the most active post of each circle (activity > 0). `activity` is whatever the
 * caller counts over the last 48 h (answers, helpful votes…). Ties go to the first item.
 */
export function pickTrending(items: readonly { id: string; circleSlug: string | null | undefined; activity: number }[]): Set<string> {
  const best = new Map<string, { id: string; activity: number }>();
  for (const item of items) {
    if (!item.circleSlug || item.activity <= 0) continue;
    const current = best.get(item.circleSlug);
    if (!current || item.activity > current.activity) best.set(item.circleSlug, { id: item.id, activity: item.activity });
  }
  return new Set([...best.values()].map((entry) => entry.id));
}

// ── Learning ─────────────────────────────────────────────────────────────────

/**
 * Applies one behaviour event to the viewer's interests and returns a new map (the input is
 * not mutated). For each tag of the post: `w ← clamp01(w + gain × (1 − w))`; `less` halves
 * the weight. Rows are created on first signal with `source = 'behavior'`.
 *
 * Interpretation: `w` is the *effective* (decayed) weight at the time of the event, and the
 * row's `updatedAt` moves to `now` — otherwise touching a row would silently cancel its
 * decay. Events with no effect (impression, a dwell under 10 s) leave the map untouched.
 * `value` is the dwell time in seconds; an omitted value counts as a qualifying dwell.
 */
export function applyEvent(
  interests: InterestMap,
  tags: readonly string[],
  type: EventType,
  now: number,
  value?: number,
): InterestMap {
  const gain = type === 'less' ? 0 : EVENT_GAINS[type];
  const dwellTooShort = type === 'dwell' && value !== undefined && value < DWELL_MIN_SECONDS;
  if (type !== 'less' && (gain <= 0 || dwellTooShort)) return interests;
  if (tags.length === 0) return interests;

  const next: InterestMap = { ...interests };
  for (const slug of new Set(tags)) {
    const row = next[slug];
    const current = row ? effectiveWeight(row.weight, row.updatedAt, now) : 0;
    const weight = type === 'less' ? current / 2 : clamp01(current + gain * (1 - current));
    next[slug] = row
      ? { ...row, weight, updatedAt: now }
      : { weight, muted: false, source: 'behavior', baseWeight: null, updatedAt: now };
  }
  return next;
}

/**
 * "Forget what you learned": restores `baseWeight` on the rows the viewer chose
 * (onboarding, GitHub, manual) and deletes behaviour-only rows. Mute flags are kept.
 */
export function resetLearning(interests: InterestMap, now: number): InterestMap {
  const next: InterestMap = {};
  for (const [slug, row] of Object.entries(interests)) {
    if (row.source === 'behavior' || row.baseWeight === null) continue;
    next[slug] = { ...row, weight: clamp01(row.baseWeight), updatedAt: now };
  }
  return next;
}
