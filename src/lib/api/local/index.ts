/**
 * Local mode — the whole `Api` running in the browser on top of `db.ts`.
 * Auth is simulated (demo store), data lives in localStorage, AI uses the heuristics.
 */
import {
  ApiError,
  type Answer,
  type Api,
  type AppNotification,
  type Author,
  type ChatMessage,
  type Circle,
  type Interest,
  type InterestSource,
  type Level,
  type Page,
  type Post,
  type PostInput,
  type Profile,
  type ProfileStats,
  type UserInterest,
} from '../contract';
import {
  applyEvent,
  effectiveWeight,
  ONBOARDING_WEIGHT,
  pickTrending,
  rankFeed,
  rankLatest,
  rankUnanswered,
  resetLearning,
  type FeedPost,
  type InterestMap,
  type Viewer,
} from '../../feed/scoring';
import { fetchGithubImport } from '../../heuristics/github';
import { createSimilarityIndex } from '../../heuristics/similarity';
import { heuristicDraft, heuristicTriage } from '../../heuristics/triage';
import { db, INTEREST_BY_ID, INTEREST_BY_SLUG, INTERESTS, save, SEED_USER_IDS, type DbAnswer, type DbPost, type DbUser } from './db';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PAGE_SIZE = 10;

const delay = (ms = 120 + Math.random() * 180) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const iso = (ms: number) => new Date(ms).toISOString();
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Session ──────────────────────────────────────────────────────────────────

const authListeners = new Set<(profile: Profile | null) => void>();

function me(): DbUser | null {
  const state = db();
  return state.sessionUserId ? (state.users[state.sessionUserId] ?? null) : null;
}

function requireUser(): DbUser {
  const user = me();
  if (!user) throw new ApiError('unauthenticated');
  return user;
}

function toAuthor(user: DbUser | undefined): Author {
  if (!user) return { id: 'deleted', handle: 'inconnu', displayName: 'Compte supprimé', avatarUrl: null, level: 'intermediate', reputation: 0 };
  return { id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl, level: user.level, reputation: user.reputation };
}

function toProfile(user: DbUser): Profile {
  return {
    ...toAuthor(user),
    bio: user.bio,
    githubLogin: user.githubLogin,
    locale: user.locale,
    isGuest: user.isGuest,
    onboarded: user.onboarded,
    createdAt: iso(user.createdAt),
  };
}

function setSession(userId: string | null): Profile | null {
  const state = db();
  state.sessionUserId = userId;
  save();
  const profile = userId ? toProfile(state.users[userId]) : null;
  authListeners.forEach((cb) => cb(profile));
  return profile;
}

function uniqueHandle(base: string): string {
  const taken = new Set(Object.values(db().users).map((u) => u.handle));
  const root =
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 18) || 'dev';
  let handle = root.length >= 3 ? root : `${root}_dev`;
  let n = 1;
  while (taken.has(handle)) handle = `${root}_${++n}`;
  return handle;
}

function createUser(input: Partial<DbUser> & { displayName: string }): DbUser {
  const user: DbUser = {
    id: uid(),
    avatarUrl: null,
    level: 'intermediate',
    bio: '',
    githubLogin: null,
    locale: 'fr',
    isGuest: false,
    onboarded: false,
    reputation: 0,
    createdAt: Date.now(),
    ...input,
    handle: uniqueHandle(input.handle ?? input.displayName),
  };
  const state = db();
  state.users[user.id] = user;
  state.interests[user.id] = {};
  return user;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function tagsOf(slugs: readonly string[]): Interest[] {
  return slugs.map((slug) => INTEREST_BY_SLUG.get(slug)).filter((i): i is Interest => Boolean(i));
}

function answersOf(postId: string): DbAnswer[] {
  return Object.values(db().answers).filter((a) => a.postId === postId);
}

function answerCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const answer of Object.values(db().answers)) counts.set(answer.postId, (counts.get(answer.postId) ?? 0) + 1);
  return counts;
}

function toPost(post: DbPost, counts = answerCounts()): Post {
  const state = db();
  const viewerId = state.sessionUserId;
  const circle = post.circleId ? state.circles[post.circleId] : null;
  return {
    id: post.id,
    kind: post.kind,
    title: post.title,
    bodyMd: post.bodyMd,
    code: post.code,
    language: post.language,
    repro: post.repro,
    difficulty: post.difficulty,
    aiSummary: post.aiSummary,
    aiHints: post.aiHints,
    status: post.status,
    acceptedAnswerId: post.acceptedAnswerId,
    author: toAuthor(state.users[post.authorId]),
    circle: circle ? { id: circle.id, slug: circle.slug, name: circle.name } : null,
    tags: tagsOf(post.tags),
    helpfulCount: post.helpfulCount,
    answerCount: counts.get(post.id) ?? 0,
    viewCount: post.viewCount,
    createdAt: iso(post.createdAt),
    viewer: {
      helpful: viewerId ? `${viewerId}|post|${post.id}` in state.votes : false,
      saved: viewerId ? `${viewerId}|${post.id}` in state.saves : false,
    },
  };
}

function toAnswer(answer: DbAnswer): Answer {
  const state = db();
  const viewerId = state.sessionUserId;
  return {
    id: answer.id,
    postId: answer.postId,
    author: toAuthor(state.users[answer.authorId]),
    bodyMd: answer.bodyMd,
    repro: answer.repro,
    isAi: answer.isAi,
    isAccepted: answer.isAccepted,
    helpfulCount: answer.helpfulCount,
    createdAt: iso(answer.createdAt),
    viewer: { helpful: viewerId ? `${viewerId}|answer|${answer.id}` in state.votes : false },
  };
}

function toCircle(id: string): Circle {
  const state = db();
  const circle = state.circles[id];
  return {
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    descriptionFr: circle.descriptionFr,
    descriptionEn: circle.descriptionEn,
    interest: circle.interestSlug ? (INTEREST_BY_SLUG.get(circle.interestSlug) ?? null) : null,
    externalInviteUrl: circle.externalInviteUrl,
    memberCount: circle.memberIds.length + 12,
    postCount: Object.values(state.posts).filter((p) => p.circleId === id).length,
    viewer: { isMember: state.sessionUserId ? circle.memberIds.includes(state.sessionUserId) : false },
  };
}

function page<T>(all: T[], cursor: string | null | undefined, limit = PAGE_SIZE): Page<T> {
  const offset = Math.max(0, Number(cursor ?? 0) || 0);
  const items = all.slice(offset, offset + limit);
  return { items, nextCursor: offset + limit < all.length ? String(offset + limit) : null };
}

const byNewest = (a: DbPost, b: DbPost) => b.createdAt - a.createdAt;

// ── Feed helpers ─────────────────────────────────────────────────────────────

function recentOpens(userId: string): Record<string, number> {
  const state = db();
  const since = Date.now() - 14 * DAY;
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const event of state.events) {
    if (event.userId !== userId || event.type !== 'open' || event.at < since || seen.has(event.postId)) continue;
    seen.add(event.postId);
    for (const slug of state.posts[event.postId]?.tags ?? []) counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return counts;
}

function viewerOf(user: DbUser): Viewer {
  const state = db();
  return {
    id: user.id,
    level: user.level,
    interests: state.interests[user.id] ?? {},
    following: new Set(state.follows.filter((f) => f.followerId === user.id).map((f) => f.followeeId)),
    recentOpens: recentOpens(user.id),
  };
}

type Row = FeedPost & { source: DbPost };

function feedRows(): Row[] {
  const state = db();
  const counts = answerCounts();
  return Object.values(state.posts).map((post) => ({
    id: post.id,
    authorId: post.authorId,
    kind: post.kind,
    status: post.status,
    tags: post.tags,
    difficulty: post.difficulty,
    helpfulCount: post.helpfulCount,
    answerCount: counts.get(post.id) ?? 0,
    createdAt: post.createdAt,
    circleSlug: post.circleId ? state.circles[post.circleId]?.slug : null,
    source: post,
  }));
}

function notify(userId: string, type: AppNotification['type'], actorId: string, postId: string | null) {
  if (userId === actorId) return;
  const state = db();
  const row = { id: uid(), userId, type, actorId, postId, read: false, createdAt: Date.now() };
  state.notifications.push(row);
  if (userId === state.sessionUserId) notificationListeners.forEach((cb) => cb(toNotification(row)));
}

function toNotification(row: { id: string; type: AppNotification['type']; actorId: string; postId: string | null; read: boolean; createdAt: number }): AppNotification {
  const state = db();
  return {
    id: row.id,
    type: row.type,
    actor: toAuthor(state.users[row.actorId]),
    postId: row.postId,
    postTitle: row.postId ? (state.posts[row.postId]?.title ?? null) : null,
    read: row.read,
    createdAt: iso(row.createdAt),
  };
}

const notificationListeners = new Set<(n: AppNotification) => void>();
const chatListeners = new Map<string, Set<{ onMessage: (m: ChatMessage) => void }>>();

function toMessage(row: { id: string; circleId: string; authorId: string; body: string; createdAt: number }): ChatMessage {
  return { id: row.id, circleId: row.circleId, author: toAuthor(db().users[row.authorId]), body: row.body, createdAt: iso(row.createdAt) };
}

const CHAT_REPLIES = [
  'Bonne question, tu as un bout de code à montrer ?',
  'J’ai eu le même souci la semaine dernière. Poste-le en problème, on regarde.',
  'Intéressant ! Tu as essayé d’isoler le cas dans une repro ?',
  'Bienvenue 👋 n’hésite pas à poser ton problème dans le cercle.',
  'Je regarde ça dans cinq minutes.',
];

function validatePost(input: Partial<PostInput>, full: boolean) {
  const bad = () => new ApiError('validation');
  if (full || input.title !== undefined) {
    const title = (input.title ?? '').trim();
    if (title.length < 8 || title.length > 160) throw bad();
  }
  if ((input.bodyMd ?? '').length > 10_000 || (input.code ?? '').length > 20_000) throw bad();
  if (full || input.tags !== undefined) {
    const tags = input.tags ?? [];
    if (tags.length < 1 || tags.length > 5 || tags.some((slug) => !INTEREST_BY_SLUG.has(slug))) throw bad();
  }
  if (input.repro && JSON.stringify(input.repro).length > 60_000) throw bad();
}

function profileStats(userId: string): ProfileStats {
  const state = db();
  const answers = Object.values(state.answers).filter((a) => a.authorId === userId);
  const accepted = answers.filter((a) => a.isAccepted);
  const weekAgo = Date.now() - 7 * DAY;
  const posts = Object.values(state.posts).filter((p) => p.authorId === userId);
  const problems = posts.filter((p) => p.kind === 'problem');
  return {
    unblockedThisWeek: accepted.filter((a) => (state.posts[a.postId]?.acceptedAt ?? a.createdAt) >= weekAgo).length,
    unblockedTotal: accepted.length,
    problemsAsked: problems.length,
    problemsSolved: problems.filter((p) => p.status === 'solved').length,
    answersGiven: answers.length,
    helpfulReceived: posts.reduce((sum, p) => sum + p.helpfulCount, 0) + answers.reduce((sum, a) => sum + a.helpfulCount, 0),
    unblockRate: answers.length ? accepted.length / answers.length : 0,
    followers: state.follows.filter((f) => f.followeeId === userId).length,
    following: state.follows.filter((f) => f.followerId === userId).length,
  };
}

function searchIndex(posts: DbPost[]) {
  return createSimilarityIndex(posts.map((p) => ({ id: p.id, title: p.title, body: p.bodyMd, tags: p.tags, code: p.code })));
}

// ── The API ──────────────────────────────────────────────────────────────────

export const localApi: Api = {
  mode: 'local',

  auth: {
    async current() {
      const user = me();
      return user ? toProfile(user) : null;
    },
    onChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signUpEmail({ email, password, displayName }) {
      await delay();
      const key = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) || password.length < 8 || displayName.trim().length < 2) throw new ApiError('validation');
      const state = db();
      if (state.accounts[key]) throw new ApiError('conflict');
      const user = createUser({ displayName: displayName.trim() });
      const salt = uid();
      // Demo store only: a salted hash kept in this browser, never sent anywhere.
      state.accounts[key] = { userId: user.id, salt, hash: await sha256(`${salt}:${password}`) };
      return setSession(user.id)!;
    },
    async signInEmail({ email, password }) {
      await delay();
      const state = db();
      const account = state.accounts[email.trim().toLowerCase()];
      if (!account || (await sha256(`${account.salt}:${password}`)) !== account.hash) throw new ApiError('unauthenticated');
      return setSession(account.userId)!;
    },
    async signInGithub() {
      await delay();
      const state = db();
      const existing = Object.values(state.users).find((u) => u.githubLogin === 'octocat' && !SEED_USER_IDS.has(u.id));
      const user = existing ?? createUser({ displayName: 'Octo Dev', handle: 'octodev', githubLogin: 'octocat' });
      setSession(user.id);
    },
    async signInGuest() {
      await delay();
      const number = 1000 + Math.floor(Math.random() * 9000);
      const user = createUser({ displayName: `Invité ${number}`, handle: `invite_${number}`, isGuest: true });
      return setSession(user.id)!;
    },
    async signOut() {
      setSession(null);
    },
  },

  profiles: {
    async get(handle) {
      await delay();
      const state = db();
      const user = Object.values(state.users).find((u) => u.handle === handle.toLowerCase());
      if (!user) throw new ApiError('not_found');
      const viewerId = state.sessionUserId;
      const map = state.interests[user.id] ?? {};
      const slugs = Object.entries(map)
        .filter(([, row]) => !row.muted)
        .sort((a, b) => b[1].weight - a[1].weight)
        .slice(0, 8)
        .map(([slug]) => slug);
      return {
        profile: toProfile(user),
        stats: profileStats(user.id),
        interests: tagsOf(slugs),
        viewer: {
          isSelf: viewerId === user.id,
          isFollowing: state.follows.some((f) => f.followerId === viewerId && f.followeeId === user.id),
        },
      };
    },
    async update(patch) {
      await delay();
      const user = requireUser();
      if (patch.handle !== undefined && patch.handle !== user.handle) {
        if (!/^[a-z0-9_]{3,24}$/.test(patch.handle)) throw new ApiError('validation');
        if (Object.values(db().users).some((u) => u.handle === patch.handle)) throw new ApiError('conflict');
      }
      if (patch.bio !== undefined && patch.bio.length > 280) throw new ApiError('validation');
      if (patch.displayName !== undefined && patch.displayName.trim().length < 2) throw new ApiError('validation');
      Object.assign(user, patch);
      return setSession(user.id)!;
    },
    async completeOnboarding({ level, interestSlugs, displayName }) {
      await delay();
      const user = requireUser();
      const state = db();
      const now = Date.now();
      const map: InterestMap = { ...(state.interests[user.id] ?? {}) };
      for (const slug of interestSlugs) {
        if (!INTEREST_BY_SLUG.has(slug)) continue;
        map[slug] = { weight: ONBOARDING_WEIGHT, muted: false, source: 'onboarding', baseWeight: ONBOARDING_WEIGHT, updatedAt: now };
      }
      state.interests[user.id] = map;
      user.level = level;
      if (displayName?.trim()) user.displayName = displayName.trim();
      user.onboarded = true;
      return setSession(user.id)!;
    },
    async posts(userId, cursor) {
      await delay();
      const counts = answerCounts();
      const all = Object.values(db().posts)
        .filter((p) => p.authorId === userId)
        .sort(byNewest);
      const result = page(all, cursor);
      return { ...result, items: result.items.map((p) => toPost(p, counts)) };
    },
    async setFollowing(userId, following) {
      await delay(80);
      const user = requireUser();
      if (userId === user.id) throw new ApiError('validation');
      const state = db();
      state.follows = state.follows.filter((f) => !(f.followerId === user.id && f.followeeId === userId));
      if (following) {
        state.follows.push({ followerId: user.id, followeeId: userId, createdAt: Date.now() });
        notify(userId, 'follow', user.id, null);
      }
      save();
    },
    async suggestions(limit = 3) {
      await delay();
      const state = db();
      const user = me();
      const mine = user ? (state.interests[user.id] ?? {}) : {};
      const followed = new Set(state.follows.filter((f) => f.followerId === user?.id).map((f) => f.followeeId));
      return Object.values(state.users)
        .filter((u) => u.id !== user?.id && !followed.has(u.id) && !u.isGuest && SEED_USER_IDS.has(u.id))
        .map((u) => {
          const theirs = state.interests[u.id] ?? {};
          const shared = Object.keys(theirs).reduce((sum, slug) => sum + (mine[slug]?.weight ?? 0) * theirs[slug].weight, 0);
          return { u, score: shared + u.reputation / 5000 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ u }) => toAuthor(u));
    },
  },

  interests: {
    async list() {
      return [...INTERESTS];
    },
    async mine() {
      await delay(80);
      const user = requireUser();
      const map = db().interests[user.id] ?? {};
      const opens = recentOpens(user.id);
      const now = Date.now();
      return Object.entries(map)
        .map(([slug, row]): UserInterest | null => {
          const interest = INTEREST_BY_SLUG.get(slug);
          if (!interest) return null;
          return { interest, weight: effectiveWeight(row.weight, row.updatedAt, now), muted: row.muted, source: row.source, recentOpens: opens[slug] ?? 0 };
        })
        .filter((row): row is UserInterest => row !== null)
        .sort((a, b) => b.weight - a.weight);
    },
    async setWeight(interestId, weight) {
      const user = requireUser();
      const interest = INTEREST_BY_ID.get(interestId);
      if (!interest) throw new ApiError('not_found');
      const state = db();
      const map = (state.interests[user.id] ??= {});
      const w = Math.min(1, Math.max(0, weight));
      const row = map[interest.slug];
      map[interest.slug] = { weight: w, muted: row?.muted ?? false, source: 'manual', baseWeight: w, updatedAt: Date.now() };
      save();
    },
    async setMuted(interestId, muted) {
      const user = requireUser();
      const interest = INTEREST_BY_ID.get(interestId);
      if (!interest) throw new ApiError('not_found');
      const map = (db().interests[user.id] ??= {});
      const row = map[interest.slug];
      map[interest.slug] = row ? { ...row, muted } : { weight: 0, muted, source: 'manual', baseWeight: 0, updatedAt: Date.now() };
      save();
    },
    importFromGithub: fetchGithubImport,
    async saveMany(items) {
      const user = requireUser();
      const map = (db().interests[user.id] ??= {});
      const now = Date.now();
      for (const item of items) {
        if (!INTEREST_BY_SLUG.has(item.slug)) continue;
        const w = Math.min(1, Math.max(0, item.weight));
        const source: InterestSource = item.source;
        map[item.slug] = { weight: w, muted: false, source, baseWeight: w, updatedAt: now };
      }
      save();
    },
    async resetLearning() {
      const user = requireUser();
      const state = db();
      state.interests[user.id] = resetLearning(state.interests[user.id] ?? {}, Date.now());
      state.hidden[user.id] = [];
      save();
    },
  },

  feed: {
    async list({ tab, interestSlug, cursor, limit }) {
      await delay();
      const user = requireUser();
      const state = db();
      const viewer = viewerOf(user);
      const hidden = new Set(state.hidden[user.id] ?? []);
      const now = Date.now();
      let rows = feedRows().filter((row) => !hidden.has(row.id));
      if (interestSlug) rows = rows.filter((row) => row.tags.includes(interestSlug));
      const counts = answerCounts();
      const since = now - 2 * DAY;
      const trendingIds = pickTrending(
        rows.map((row) => ({
          id: row.id,
          circleSlug: row.circleSlug,
          activity: answersOf(row.id).filter((a) => a.createdAt >= since).length + (row.source.createdAt >= since ? row.helpfulCount : 0),
        })),
      );

      let posts: Post[];
      if (tab === 'for-you') {
        posts = rankFeed(rows, viewer, { now, trendingIds }).map((ranked) => ({
          ...toPost(ranked.post.source, counts),
          reasons: ranked.reasons,
          score: ranked.score,
        }));
      } else if (tab === 'following') {
        posts = rankLatest(rows.filter((row) => viewer.following.has(row.authorId))).map((row) => ({
          ...toPost(row.source, counts),
          reasons: [{ kind: 'following' as const }],
        }));
      } else if (tab === 'unanswered') {
        posts = rankUnanswered(rows, viewer).map((row) => ({ ...toPost(row.source, counts), reasons: [{ kind: 'unanswered' as const }] }));
      } else {
        posts = rankLatest(rows).map((row) => toPost(row.source, counts));
      }
      return page(posts, cursor, limit ?? PAGE_SIZE);
    },
    recordEvent(postId, type, value) {
      try {
        const user = me();
        const state = db();
        const post = state.posts[postId];
        if (!user || !post) return;
        const now = Date.now();
        state.events.push({ userId: user.id, postId, type, value: value ?? null, at: now });
        if (type === 'open') post.viewCount += 1;
        if (type === 'less') (state.hidden[user.id] ??= []).push(postId);
        state.interests[user.id] = applyEvent(state.interests[user.id] ?? {}, post.tags, type, now, value);
        save();
      } catch {
        // Signals never break the UI.
      }
    },
  },

  posts: {
    async get(id) {
      await delay();
      const post = db().posts[id];
      if (!post) throw new ApiError('not_found');
      return toPost(post);
    },
    async create(input) {
      await delay();
      const user = requireUser();
      validatePost(input, true);
      const state = db();
      const hourAgo = Date.now() - HOUR;
      if (Object.values(state.posts).filter((p) => p.authorId === user.id && p.createdAt > hourAgo).length >= 10) throw new ApiError('rate_limited');
      const post: DbPost = {
        id: uid(),
        authorId: user.id,
        circleId: input.circleId && state.circles[input.circleId] ? input.circleId : null,
        kind: input.kind,
        title: input.title.trim(),
        bodyMd: input.bodyMd,
        code: input.code?.trim() ? input.code : null,
        language: input.language ?? null,
        repro: input.repro ?? null,
        tags: [...new Set(input.tags)],
        difficulty: input.difficulty,
        aiSummary: input.aiSummary ?? null,
        aiHints: input.aiHints ?? [],
        status: 'open',
        acceptedAnswerId: null,
        acceptedAt: null,
        helpfulCount: 0,
        viewCount: 0,
        createdAt: Date.now(),
      };
      state.posts[post.id] = post;
      save();
      return toPost(post);
    },
    async update(id, patch) {
      await delay();
      const user = requireUser();
      const post = db().posts[id];
      if (!post) throw new ApiError('not_found');
      if (post.authorId !== user.id) throw new ApiError('forbidden');
      validatePost(patch, false);
      const { tags, circleId, aiHints, ...rest } = patch;
      Object.assign(post, rest);
      if (tags) post.tags = [...new Set(tags)];
      if (circleId !== undefined) post.circleId = circleId;
      if (aiHints) post.aiHints = aiHints;
      save();
      return toPost(post);
    },
    async remove(id) {
      await delay();
      const user = requireUser();
      const state = db();
      const post = state.posts[id];
      if (!post) throw new ApiError('not_found');
      if (post.authorId !== user.id) throw new ApiError('forbidden');
      delete state.posts[id];
      for (const answer of answersOf(id)) delete state.answers[answer.id];
      save();
    },
    async setHelpful(id, on) {
      const user = requireUser();
      const state = db();
      const post = state.posts[id];
      if (!post) throw new ApiError('not_found');
      const key = `${user.id}|post|${id}`;
      const had = key in state.votes;
      if (on && !had) {
        state.votes[key] = Date.now();
        post.helpfulCount += 1;
        const author = state.users[post.authorId];
        if (author && author.id !== user.id) author.reputation += 2;
        notify(post.authorId, 'helpful', user.id, id);
        localApi.feed.recordEvent(id, 'helpful');
      } else if (!on && had) {
        delete state.votes[key];
        post.helpfulCount = Math.max(0, post.helpfulCount - 1);
      }
      save();
    },
    async setSaved(id, on) {
      const user = requireUser();
      const state = db();
      const key = `${user.id}|${id}`;
      if (on) {
        if (!(key in state.saves)) localApi.feed.recordEvent(id, 'save');
        state.saves[key] = Date.now();
      } else delete state.saves[key];
      save();
    },
    async saved(cursor) {
      await delay();
      const user = requireUser();
      const state = db();
      const counts = answerCounts();
      const all = Object.entries(state.saves)
        .filter(([key]) => key.startsWith(`${user.id}|`))
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => state.posts[key.split('|')[1]])
        .filter((p): p is DbPost => Boolean(p));
      const result = page(all, cursor);
      return { ...result, items: result.items.map((p) => toPost(p, counts)) };
    },
    async report(target, reason) {
      await delay();
      const user = requireUser();
      if (!reason.trim()) throw new ApiError('validation');
      db().reports.push({ reporterId: user.id, targetType: target.type, targetId: target.id, reason: reason.slice(0, 500), createdAt: Date.now() });
      save();
    },
  },

  answers: {
    async list(postId) {
      await delay();
      return answersOf(postId)
        .sort((a, b) => Number(b.isAccepted) - Number(a.isAccepted) || b.helpfulCount - a.helpfulCount || a.createdAt - b.createdAt)
        .map(toAnswer);
    },
    async create(postId, input) {
      await delay();
      const user = requireUser();
      const state = db();
      const post = state.posts[postId];
      if (!post) throw new ApiError('not_found');
      const body = input.bodyMd.trim();
      if (body.length < 2 || body.length > 10_000) throw new ApiError('validation');
      const answer: DbAnswer = {
        id: uid(),
        postId,
        authorId: user.id,
        bodyMd: body,
        repro: input.repro ?? null,
        isAi: Boolean(input.isAi),
        isAccepted: false,
        helpfulCount: 0,
        createdAt: Date.now(),
      };
      state.answers[answer.id] = answer;
      notify(post.authorId, 'answer', user.id, postId);
      localApi.feed.recordEvent(postId, 'answer');
      save();
      return toAnswer(answer);
    },
    async accept(answerId) {
      await delay(100);
      const user = requireUser();
      const state = db();
      const answer = state.answers[answerId];
      const post = answer ? state.posts[answer.postId] : undefined;
      if (!answer || !post) throw new ApiError('not_found');
      if (post.authorId !== user.id) throw new ApiError('forbidden');
      const wasAccepted = answer.isAccepted;
      for (const other of answersOf(post.id)) other.isAccepted = false;
      if (wasAccepted) {
        post.status = 'open';
        post.acceptedAnswerId = null;
        post.acceptedAt = null;
      } else {
        answer.isAccepted = true;
        post.status = 'solved';
        post.acceptedAnswerId = answer.id;
        post.acceptedAt = Date.now();
        const author = state.users[answer.authorId];
        if (author && author.id !== user.id) author.reputation += 15;
        notify(answer.authorId, 'accepted', user.id, post.id);
        localApi.feed.recordEvent(post.id, 'accept');
      }
      save();
    },
    async setHelpful(id, on) {
      const user = requireUser();
      const state = db();
      const answer = state.answers[id];
      if (!answer) throw new ApiError('not_found');
      const key = `${user.id}|answer|${id}`;
      const had = key in state.votes;
      if (on && !had) {
        state.votes[key] = Date.now();
        answer.helpfulCount += 1;
        const author = state.users[answer.authorId];
        if (author && author.id !== user.id) author.reputation += 2;
      } else if (!on && had) {
        delete state.votes[key];
        answer.helpfulCount = Math.max(0, answer.helpfulCount - 1);
      }
      save();
    },
    async remove(id) {
      await delay();
      const user = requireUser();
      const state = db();
      const answer = state.answers[id];
      if (!answer) throw new ApiError('not_found');
      if (answer.authorId !== user.id) throw new ApiError('forbidden');
      const post = state.posts[answer.postId];
      if (post && post.acceptedAnswerId === id) {
        post.acceptedAnswerId = null;
        post.acceptedAt = null;
        post.status = 'open';
      }
      delete state.answers[id];
      save();
    },
  },

  search: {
    async posts(query, opts) {
      await delay();
      const state = db();
      if (!query.trim()) return [];
      const all = Object.values(state.posts).filter((p) => !opts?.status || p.status === opts.status);
      const counts = answerCounts();
      return searchIndex(all)
        .query(query, { limit: 40 })
        .map((hit) => ({ post: state.posts[hit.id], score: hit.similarity * (state.posts[hit.id].status === 'solved' ? 1.25 : 1) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts?.limit ?? 20)
        .map(({ post, score }) => ({ ...toPost(post, counts), similarity: Math.min(1, score) }));
    },
    async similar(text, opts) {
      await delay();
      const state = db();
      if (text.trim().length < 6) return [];
      const counts = answerCounts();
      return searchIndex(Object.values(state.posts))
        .query(text, { limit: 20, prefix: false, minSimilarity: 0.12 })
        .map((hit) => ({ post: state.posts[hit.id], similarity: hit.similarity }))
        .sort((a, b) => Number(b.post.status === 'solved') - Number(a.post.status === 'solved') || b.similarity - a.similarity)
        .slice(0, opts?.limit ?? 5)
        .map(({ post, similarity }) => ({ ...toPost(post, counts), similarity }));
    },
    async people(query, limit = 8) {
      await delay();
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return Object.values(db().users)
        .filter((u) => !u.isGuest && (u.handle.includes(q) || u.displayName.toLowerCase().includes(q)))
        .slice(0, limit)
        .map(toAuthor);
    },
  },

  circles: {
    async list() {
      await delay();
      return Object.keys(db().circles)
        .map(toCircle)
        .sort((a, b) => Number(b.viewer.isMember) - Number(a.viewer.isMember) || b.memberCount - a.memberCount);
    },
    async get(slug) {
      await delay();
      const circle = Object.values(db().circles).find((c) => c.slug === slug);
      if (!circle) throw new ApiError('not_found');
      return toCircle(circle.id);
    },
    async setMember(circleId, member) {
      await delay(80);
      const user = requireUser();
      const circle = db().circles[circleId];
      if (!circle) throw new ApiError('not_found');
      circle.memberIds = circle.memberIds.filter((id) => id !== user.id);
      if (member) circle.memberIds.push(user.id);
      save();
    },
    async posts(slug, cursor) {
      await delay();
      const state = db();
      const circle = Object.values(state.circles).find((c) => c.slug === slug);
      if (!circle) throw new ApiError('not_found');
      const counts = answerCounts();
      const all = Object.values(state.posts)
        .filter((p) => p.circleId === circle.id)
        .sort(byNewest);
      const result = page(all, cursor);
      return { ...result, items: result.items.map((p) => toPost(p, counts)) };
    },
  },

  chat: {
    async history(circleId, limit = 60) {
      await delay();
      return db()
        .messages.filter((m) => m.circleId === circleId)
        .slice(-limit)
        .map(toMessage);
    },
    async send(circleId, body) {
      await delay(80);
      const user = requireUser();
      const state = db();
      const circle = state.circles[circleId];
      if (!circle) throw new ApiError('not_found');
      const text = body.trim();
      if (text.length < 1 || text.length > 1000) throw new ApiError('validation');
      const minuteAgo = Date.now() - 60_000;
      if (state.messages.filter((m) => m.authorId === user.id && m.createdAt > minuteAgo).length >= 20) throw new ApiError('rate_limited');
      const row = { id: uid(), circleId, authorId: user.id, body: text, createdAt: Date.now() };
      state.messages.push(row);
      save();
      // Local mode only: one scripted reply from a seeded member keeps the room alive.
      const members = circle.memberIds.filter((id) => SEED_USER_IDS.has(id));
      if (members.length) {
        setTimeout(
          () => {
            const reply = {
              id: uid(),
              circleId,
              authorId: members[Math.floor(Math.random() * members.length)],
              body: CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)],
              createdAt: Date.now(),
            };
            db().messages.push(reply);
            save();
            chatListeners.get(circleId)?.forEach((l) => l.onMessage(toMessage(reply)));
          },
          2000 + Math.random() * 2000,
        );
      }
      return toMessage(row);
    },
    subscribe(circleId, handlers) {
      const set = chatListeners.get(circleId) ?? new Set();
      chatListeners.set(circleId, set);
      set.add(handlers);
      const online = 3 + (circleId.charCodeAt(0) % 5);
      const timer = setTimeout(() => handlers.onPresence?.(online), 300);
      return () => {
        clearTimeout(timer);
        set.delete(handlers);
      };
    },
  },

  ai: {
    async triage(input) {
      await delay(500);
      requireUser();
      return heuristicTriage(input);
    },
    async draftAnswer(postId, locale) {
      await delay(600);
      requireUser();
      const post = db().posts[postId];
      if (!post) throw new ApiError('not_found');
      return heuristicDraft(
        {
          title: post.title,
          bodyMd: post.bodyMd,
          code: post.code,
          language: post.language,
          tags: post.tags,
          tagLabels: tagsOf(post.tags).map((t) => (locale === 'en' ? t.labelEn : t.labelFr)),
          aiHints: post.aiHints,
        },
        locale,
      );
    },
  },

  notifications: {
    async list() {
      await delay(80);
      const user = me();
      if (!user) return [];
      return db()
        .notifications.filter((n) => n.userId === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30)
        .map(toNotification);
    },
    async markAllRead() {
      const user = requireUser();
      for (const n of db().notifications) if (n.userId === user.id) n.read = true;
      save();
    },
    subscribe(cb) {
      notificationListeners.add(cb);
      return () => notificationListeners.delete(cb);
    },
  },

  stats: {
    async platform() {
      await delay(80);
      const state = db();
      const problems = Object.values(state.posts).filter((p) => p.kind === 'problem');
      const weekAgo = Date.now() - 7 * DAY;
      return {
        members: Object.values(state.users).filter((u) => !u.isGuest).length + 2468,
        problems: problems.length,
        solved: problems.filter((p) => p.status === 'solved').length,
        unblockedThisWeek: problems.filter((p) => p.status === 'solved' && (p.acceptedAt ?? 0) >= weekAgo).length,
      };
    },
    async profile(userId) {
      await delay(80);
      return profileStats(userId);
    },
  },

  status: {
    async health() {
      return {
        mode: 'local',
        database: 'ok',
        realtime: 'ok',
        semanticSearch: 'degraded',
        ai: [{ provider: 'heuristic', state: 'ok' }],
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
      };
    },
  },
};

export type { Level };
