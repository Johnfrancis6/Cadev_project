import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  DECAY_PER_DAY,
  effectiveWeight,
  EVENT_GAINS,
  explainPost,
  isExplorable,
  levelMatch,
  mulberry32,
  pickTrending,
  rankFeed,
  rankLatest,
  rankUnanswered,
  resetLearning,
  scoreBreakdown,
  scorePost,
  type FeedPost,
  type InterestMap,
  type InterestState,
  type Viewer,
} from './scoring';

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function interest(weight: number, patch: Partial<InterestState> = {}): InterestState {
  return { weight, muted: false, source: 'onboarding', baseWeight: weight, updatedAt: NOW, ...patch };
}

function post(id: string, patch: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    authorId: 'author-1',
    kind: 'problem',
    status: 'open',
    tags: ['react'],
    difficulty: 'intermediate',
    helpfulCount: 0,
    answerCount: 1,
    createdAt: NOW - 24 * HOUR,
    circleSlug: null,
    ...patch,
  };
}

function viewer(interests: InterestMap = {}, patch: Partial<Viewer> = {}): Viewer {
  return { id: 'viewer', level: 'intermediate', interests, following: new Set(), recentOpens: {}, ...patch };
}

describe('effectiveWeight (decay)', () => {
  it('keeps the weight when it was just updated', () => {
    expect(effectiveWeight(0.6, NOW, NOW)).toBeCloseTo(0.6, 10);
  });

  it('loses 2 % per day', () => {
    expect(effectiveWeight(0.6, NOW - DAY, NOW)).toBeCloseTo(0.6 * DECAY_PER_DAY, 10);
    expect(effectiveWeight(1, NOW - 30 * DAY, NOW)).toBeCloseTo(Math.pow(0.98, 30), 10);
  });

  it('never grows when updatedAt is in the future', () => {
    expect(effectiveWeight(0.5, NOW + DAY, NOW)).toBeCloseTo(0.5, 10);
  });

  it('makes an old interest rank below a fresh one of the same stored weight', () => {
    const v = viewer({ react: interest(0.6, { updatedAt: NOW - 60 * DAY }), python: interest(0.6) });
    const ranked = rankFeed([post('react', { tags: ['react'] }), post('python', { tags: ['python'] })], v, { now: NOW });
    expect(ranked.map((r) => r.post.id)).toEqual(['python', 'react']);
  });
});

describe('scorePost', () => {
  it('matches the formula of the spec', () => {
    const v = viewer({ react: interest(0.5), typescript: interest(0.2) }, { following: new Set(['author-1']) });
    const p = post('p', { tags: ['react', 'typescript'], helpfulCount: 4, status: 'solved', createdAt: NOW - 72 * HOUR });
    const parts = scoreBreakdown(p, v, NOW);
    expect(parts.interest).toBeCloseTo(3 * 0.7, 10);
    expect(parts.recency).toBeCloseTo(1.5 * Math.exp(-1), 10);
    expect(parts.quality).toBeCloseTo(0.8 * Math.log(1 + 4 + 2), 10);
    expect(parts.level).toBe(1);
    expect(parts.following).toBe(0.6);
    expect(scorePost(p, v, NOW)).toBeCloseTo(parts.interest + parts.recency + parts.quality + parts.level + parts.following, 10);
  });

  it('gives 1 / 0.5 / 0 for same / adjacent / distant levels', () => {
    expect(levelMatch('beginner', 'beginner')).toBe(1);
    expect(levelMatch('beginner', 'intermediate')).toBe(0.5);
    expect(levelMatch('senior', 'intermediate')).toBe(0.5);
    expect(levelMatch('beginner', 'senior')).toBe(0);
  });

  it('ranks a post at the viewer level above the same post at a distant level', () => {
    const v = viewer({}, { level: 'beginner' });
    const ranked = rankFeed(
      [post('hard', { difficulty: 'senior' }), post('mid', { difficulty: 'intermediate' }), post('easy', { difficulty: 'beginner' })],
      v,
      { now: NOW, exploreEvery: 0 },
    );
    expect(ranked.map((r) => r.post.id)).toEqual(['easy', 'mid', 'hard']);
  });
});

describe('rankFeed', () => {
  it('ranks by interest weight', () => {
    const v = viewer({ python: interest(0.9), react: interest(0.3) });
    const ranked = rankFeed(
      [post('css', { tags: ['css'] }), post('react', { tags: ['react'] }), post('python', { tags: ['python'] })],
      v,
      { now: NOW },
    );
    expect(ranked.map((r) => r.post.id)).toEqual(['python', 'react', 'css']);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('excludes the viewer’s own posts', () => {
    const ranked = rankFeed([post('mine', { authorId: 'viewer' }), post('other')], viewer(), { now: NOW });
    expect(ranked.map((r) => r.post.id)).toEqual(['other']);
  });

  it('ignores muted tags in the score and drops posts whose tags are all muted', () => {
    const v = viewer({ php: interest(0.9, { muted: true }), databases: interest(0.4) });
    const onlyMuted = post('only-php', { tags: ['php'] });
    const mixed = post('php-db', { tags: ['php', 'databases'] });
    const plain = post('db', { tags: ['databases'] });

    expect(scoreBreakdown(mixed, v, NOW).interest).toBeCloseTo(3 * 0.4, 10);
    expect(scorePost(mixed, v, NOW)).toBeCloseTo(scorePost(plain, v, NOW), 10);

    const ids = rankFeed([onlyMuted, mixed, plain], v, { now: NOW }).map((r) => r.post.id);
    expect(ids).not.toContain('only-php');
    expect(ids).toContain('php-db');
  });

  it('never explains a post by a muted interest', () => {
    const v = viewer({ php: interest(0.9, { muted: true }), databases: interest(0.4) });
    const reasons = explainPost(post('p', { tags: ['php', 'databases'] }), v, { now: NOW });
    expect(reasons).toContainEqual({ kind: 'interest', interestSlug: 'databases', count: 0 });
  });

  it('gives every 8th slot to the best post of a topic the viewer has not tried', () => {
    const v = viewer({ react: interest(0.8) });
    const posts: FeedPost[] = [];
    for (let i = 0; i < 20; i++) posts.push(post(`react-${String(i).padStart(2, '0')}`, { tags: ['react'], createdAt: NOW - (i + 1) * HOUR }));
    posts.push(post('go-best', { tags: ['go'], helpfulCount: 8 }));
    posts.push(post('go-other', { tags: ['go'], helpfulCount: 1 }));
    posts.push(post('php-mid', { tags: ['php'], helpfulCount: 4 }));

    const ranked = rankFeed(posts, v, { now: NOW });
    expect(ranked).toHaveLength(posts.length);
    expect(new Set(ranked.map((r) => r.post.id)).size).toBe(posts.length);

    expect(ranked[7]!.post.id).toBe('go-best');
    expect(ranked[7]!.explore).toBe(true);
    expect(ranked[7]!.reasons[0]).toEqual({ kind: 'explore', interestSlug: 'go' });
    expect(ranked[15]!.post.id).toBe('php-mid');
    expect(ranked[15]!.explore).toBe(true);

    const exploreSlots = ranked.map((r, index) => (r.explore ? index + 1 : 0)).filter(Boolean);
    expect(exploreSlots).toEqual([8, 16, 24].filter((slot) => slot <= ranked.length));
    for (const slot of [0, 1, 2, 3, 4, 5, 6]) expect(ranked[slot]!.post.tags).toEqual(['react']);
  });

  it('does not treat a known topic (weight ≥ 0.15) or a muted one as exploration', () => {
    const interests = { react: interest(0.8), css: interest(0.1), php: interest(0, { muted: true }) };
    expect(isExplorable(post('a', { tags: ['react'] }), interests, NOW)).toBe(false);
    expect(isExplorable(post('b', { tags: ['css'] }), interests, NOW)).toBe(true);
    expect(isExplorable(post('c', { tags: ['go'] }), interests, NOW)).toBe(true);
    expect(isExplorable(post('d', { tags: ['go', 'react'] }), interests, NOW)).toBe(false);
    expect(isExplorable(post('e', { tags: ['php'] }), interests, NOW)).toBe(false);
  });

  it('falls back to the normal ranking when there is nothing to explore', () => {
    const v = viewer({ react: interest(0.8) });
    const posts = Array.from({ length: 10 }, (_, i) => post(`p${i}`, { createdAt: NOW - (i + 1) * HOUR }));
    const ranked = rankFeed(posts, v, { now: NOW });
    expect(ranked.map((r) => r.post.id)).toEqual(posts.map((p) => p.id));
    expect(ranked.some((r) => r.explore)).toBe(false);
  });

  it('is deterministic, including with a seeded RNG', () => {
    const v = viewer({ react: interest(0.8) });
    const posts: FeedPost[] = [];
    for (let i = 0; i < 12; i++) posts.push(post(`react-${i}`, { createdAt: NOW - (i + 1) * HOUR }));
    for (let i = 0; i < 4; i++) posts.push(post(`go-${i}`, { tags: ['go'], helpfulCount: i }));
    const run = (seed: number) => rankFeed(posts, v, { now: NOW, rng: mulberry32(seed) }).map((r) => r.post.id);
    expect(run(42)).toEqual(run(42));
    expect(rankFeed(posts, v, { now: NOW }).map((r) => r.post.id)).toEqual(rankFeed(posts, v, { now: NOW }).map((r) => r.post.id));
    expect(run(42)[7]).toMatch(/^go-/);
  });
});

describe('applyEvent (learning)', () => {
  it('creates a behaviour row on the first signal', () => {
    const next = applyEvent({}, ['go'], 'open', NOW);
    expect(next.go).toEqual({ weight: 0.08, muted: false, source: 'behavior', baseWeight: null, updatedAt: NOW });
  });

  it('applies w ← w + gain × (1 − w) for every tag of the post', () => {
    const start = { react: interest(0.5), typescript: interest(0.2) };
    const next = applyEvent(start, ['react', 'typescript'], 'answer', NOW);
    expect(next.react!.weight).toBeCloseTo(0.5 + 0.2 * 0.5, 10);
    expect(next.typescript!.weight).toBeCloseTo(0.2 + 0.2 * 0.8, 10);
    expect(next.react!.source).toBe('onboarding');
    expect(next.react!.baseWeight).toBe(0.5);
    expect(start.react.weight).toBe(0.5);
  });

  it('uses the gains of the spec', () => {
    expect(EVENT_GAINS).toEqual({
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
    });
    for (const [type, gain] of Object.entries(EVENT_GAINS)) {
      const next = applyEvent({}, ['go'], type as keyof typeof EVENT_GAINS, NOW);
      expect(next.go?.weight ?? 0).toBeCloseTo(gain, 10);
    }
  });

  it('does nothing on an impression or a dwell shorter than 10 s', () => {
    const start = { react: interest(0.5, { updatedAt: NOW - 10 * DAY }) };
    expect(applyEvent(start, ['react'], 'impression', NOW)).toBe(start);
    expect(applyEvent(start, ['react'], 'dwell', NOW, 4)).toBe(start);
    expect(applyEvent(start, ['react'], 'dwell', NOW, 12).react!.weight).toBeGreaterThan(0.4);
  });

  it('halves the weight on `less`', () => {
    const next = applyEvent({ react: interest(0.8) }, ['react'], 'less', NOW);
    expect(next.react!.weight).toBeCloseTo(0.4, 10);
    const twice = applyEvent(next, ['react'], 'less', NOW);
    expect(twice.react!.weight).toBeCloseTo(0.2, 10);
  });

  it('never leaves the 0..1 range', () => {
    let interests: InterestMap = { react: interest(0.99) };
    for (let i = 0; i < 50; i++) interests = applyEvent(interests, ['react'], 'accept', NOW);
    expect(interests.react!.weight).toBeLessThanOrEqual(1);
    expect(interests.react!.weight).toBeGreaterThan(0.99);
  });

  it('folds the decay in before learning', () => {
    const next = applyEvent({ react: interest(0.5, { updatedAt: NOW - 10 * DAY }) }, ['react'], 'open', NOW);
    const decayed = 0.5 * Math.pow(0.98, 10);
    expect(next.react!.weight).toBeCloseTo(decayed + 0.08 * (1 - decayed), 10);
    expect(next.react!.updatedAt).toBe(NOW);
  });

  it('re-ranks the feed after three opens on a topic', () => {
    const v = viewer({ react: interest(0.6) });
    const posts = [post('react', { tags: ['react'] }), post('go', { tags: ['go'] })];
    expect(rankFeed(posts, v, { now: NOW })[0]!.post.id).toBe('react');

    let interests = v.interests;
    for (let i = 0; i < 3; i++) {
      interests = applyEvent(interests, ['go'], 'open', NOW);
      interests = applyEvent(interests, ['go'], 'dwell', NOW, 15);
    }
    interests = applyEvent(interests, ['react'], 'less', NOW);
    interests = applyEvent(interests, ['react'], 'less', NOW);

    const after = rankFeed(posts, { ...v, interests, recentOpens: { go: 3 } }, { now: NOW });
    expect(after[0]!.post.id).toBe('go');
    expect(after[0]!.reasons).toContainEqual({ kind: 'interest', interestSlug: 'go', count: 3 });
  });

  it('resetLearning restores base weights and drops behaviour-only rows', () => {
    let interests: InterestMap = { react: interest(0.6), css: interest(0.3, { muted: true, source: 'manual' }) };
    interests = applyEvent(interests, ['react', 'go'], 'answer', NOW);
    expect(interests.go).toBeDefined();
    const reset = resetLearning(interests, NOW + HOUR);
    expect(reset.go).toBeUndefined();
    expect(reset.react!.weight).toBe(0.6);
    expect(reset.react!.updatedAt).toBe(NOW + HOUR);
    expect(reset.css!.muted).toBe(true);
  });
});

describe('explainPost (reasons)', () => {
  it('returns at most two reasons in priority order', () => {
    const v = viewer({ react: interest(0.7) }, { following: new Set(['author-1']), recentOpens: { react: 4 } });
    const p = post('p', { answerCount: 0, createdAt: NOW - HOUR, circleSlug: 'react' });
    const reasons = explainPost(p, v, { now: NOW, trendingIds: new Set(['p']) });
    expect(reasons).toEqual([{ kind: 'following' }, { kind: 'interest', interestSlug: 'react', count: 4 }]);
  });

  it('picks the strongest matching tag and reports recent opens', () => {
    const v = viewer({ react: interest(0.3), typescript: interest(0.7), css: interest(0.1) }, { recentOpens: { typescript: 2 } });
    const reasons = explainPost(post('p', { tags: ['react', 'typescript', 'css'], difficulty: 'senior' }), v, { now: NOW });
    expect(reasons).toEqual([{ kind: 'interest', interestSlug: 'typescript', count: 2 }]);
  });

  it('does not use an interest below 0.15', () => {
    const v = viewer({ css: interest(0.14) });
    const reasons = explainPost(post('p', { tags: ['css'], difficulty: 'senior' }), v, { now: NOW });
    expect(reasons.find((r) => r.kind === 'interest')).toBeUndefined();
  });

  it('orders explore, trending, level, unanswered, fresh', () => {
    const v = viewer();
    const p = post('p', { tags: ['go'], answerCount: 0, createdAt: NOW - HOUR, circleSlug: 'devops' });
    expect(explainPost(p, v, { now: NOW, explore: true, trendingIds: new Set(['p']) })).toEqual([
      { kind: 'explore', interestSlug: 'go' },
      { kind: 'trending', circleSlug: 'devops' },
    ]);
    expect(explainPost(p, v, { now: NOW })).toEqual([{ kind: 'level' }, { kind: 'unanswered' }]);
    expect(explainPost({ ...p, difficulty: 'senior' }, v, { now: NOW })).toEqual([{ kind: 'unanswered' }, { kind: 'fresh' }]);
  });

  it('marks a post fresh only under 6 hours', () => {
    const v = viewer({}, { level: 'senior' });
    const base = { difficulty: 'beginner' as const, answerCount: 2 };
    expect(explainPost(post('a', { ...base, createdAt: NOW - 5.9 * HOUR }), v, { now: NOW })).toEqual([{ kind: 'fresh' }]);
    expect(explainPost(post('b', { ...base, createdAt: NOW - 6.1 * HOUR }), v, { now: NOW })).toEqual([]);
  });

  it('does not call a discussion or a solved problem unanswered', () => {
    const v = viewer({}, { level: 'senior' });
    const old = NOW - 100 * HOUR;
    expect(explainPost(post('d', { kind: 'discussion', answerCount: 0, createdAt: old }), v, { now: NOW })).toEqual([]);
    expect(explainPost(post('s', { status: 'solved', answerCount: 0, createdAt: old }), v, { now: NOW })).toEqual([]);
  });
});

describe('other tabs', () => {
  it('rankLatest sorts newest first without mutating the input', () => {
    const posts = [post('old', { createdAt: NOW - 5 * HOUR }), post('new', { createdAt: NOW - HOUR }), post('iso', { createdAt: new Date(NOW - 3 * HOUR).toISOString() })];
    expect(rankLatest(posts).map((p) => p.id)).toEqual(['new', 'iso', 'old']);
    expect(posts[0]!.id).toBe('old');
  });

  it('rankUnanswered keeps open unanswered problems, hardest matching level first', () => {
    const open = { answerCount: 0 };
    const posts = [
      post('beginner', { ...open, difficulty: 'beginner' }),
      post('senior', { ...open, difficulty: 'senior' }),
      post('intermediate-old', { ...open, difficulty: 'intermediate', createdAt: NOW - 50 * HOUR }),
      post('intermediate-new', { ...open, difficulty: 'intermediate', createdAt: NOW - 2 * HOUR }),
      post('answered', { answerCount: 2 }),
      post('solved', { ...open, status: 'solved' }),
      post('discussion', { ...open, kind: 'discussion' }),
      post('mine', { ...open, authorId: 'viewer' }),
    ];
    expect(rankUnanswered(posts, viewer()).map((p) => p.id)).toEqual(['intermediate-new', 'intermediate-old', 'beginner', 'senior']);
    expect(rankUnanswered(posts, viewer({}, { level: 'senior' })).map((p) => p.id)).toEqual([
      'senior',
      'intermediate-new',
      'intermediate-old',
      'beginner',
    ]);
    expect(rankUnanswered(posts, viewer({}, { level: 'beginner' })).map((p) => p.id)).toEqual([
      'beginner',
      'intermediate-new',
      'intermediate-old',
      'senior',
    ]);
  });

  it('pickTrending keeps the most active post of each circle', () => {
    const trending = pickTrending([
      { id: 'a', circleSlug: 'react', activity: 2 },
      { id: 'b', circleSlug: 'react', activity: 5 },
      { id: 'c', circleSlug: 'python', activity: 0 },
      { id: 'd', circleSlug: null, activity: 9 },
      { id: 'e', circleSlug: 'devops', activity: 1 },
    ]);
    expect([...trending].sort()).toEqual(['b', 'e']);
  });
});
