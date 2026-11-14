/**
 * Local mode — in-browser database.
 *
 * Loads `seed/seed.json`, resolves its relative timestamps once per browser profile and keeps
 * everything the visitor changes in `localStorage` under one versioned key. When storage is
 * unavailable (private mode, quota, Node) the state simply lives in memory.
 */
import seedJson from '../../../../seed/seed.json';
import type { EventType, Interest, Level, Locale, PostKind, PostStatus, Repro } from '../contract';
import type { InterestMap } from '../../feed/scoring';

export const STORAGE_KEY = 'devloop.local.v1';
const STATE_VERSION = 1;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Seed timestamps are shifted forward when the profile has not been used for this long, so the demo stays alive. */
const REANCHOR_AFTER = DAY;
const MAX_EVENTS = 3000;

// ── Seed file shape (docs/SPEC.md §11) ───────────────────────────────────────

interface SeedAnswer {
  id: string;
  authorId: string;
  bodyMd: string;
  repro: Repro | null;
  isAi: boolean;
  isAccepted: boolean;
  hoursAgo: number;
  helpfulCount: number;
}

interface SeedFile {
  interests: Interest[];
  users: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    level: Level;
    bio: string;
    githubLogin: string | null;
    reputation: number;
    interests: { slug: string; weight: number }[];
  }[];
  follows: { followerId: string; followeeId: string }[];
  circles: {
    id: string;
    slug: string;
    name: string;
    descriptionFr: string;
    descriptionEn: string;
    interestSlug: string;
    externalInviteUrl: string | null;
    memberIds: string[];
  }[];
  posts: {
    id: string;
    authorId: string;
    circleId: string | null;
    kind: PostKind;
    title: string;
    bodyMd: string;
    code: string | null;
    language: string | null;
    repro: Repro | null;
    tags: string[];
    difficulty: Level;
    aiSummary: string | null;
    aiHints: string[];
    status: PostStatus;
    hoursAgo: number;
    helpfulCount: number;
    viewCount: number;
    answers: SeedAnswer[];
  }[];
  messages: { id: string; circleId: string; authorId: string; body: string; minutesAgo: number }[];
}

const seed = seedJson as unknown as SeedFile;

/** The 18 interests never change at run time. */
export const INTERESTS: readonly Interest[] = seed.interests;
export const INTEREST_BY_SLUG: ReadonlyMap<string, Interest> = new Map(seed.interests.map((i) => [i.slug, i]));
export const INTEREST_BY_ID: ReadonlyMap<number, Interest> = new Map(seed.interests.map((i) => [i.id, i]));

// ── Stored rows ──────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  level: Level;
  bio: string;
  githubLogin: string | null;
  locale: Locale;
  isGuest: boolean;
  onboarded: boolean;
  reputation: number;
  createdAt: number;
}

export interface DbPost {
  id: string;
  authorId: string;
  circleId: string | null;
  kind: PostKind;
  title: string;
  bodyMd: string;
  code: string | null;
  language: string | null;
  repro: Repro | null;
  tags: string[];
  difficulty: Level;
  aiSummary: string | null;
  aiHints: string[];
  status: PostStatus;
  acceptedAnswerId: string | null;
  acceptedAt: number | null;
  helpfulCount: number;
  viewCount: number;
  createdAt: number;
}

export interface DbAnswer {
  id: string;
  postId: string;
  authorId: string;
  bodyMd: string;
  repro: Repro | null;
  isAi: boolean;
  isAccepted: boolean;
  helpfulCount: number;
  createdAt: number;
}

export interface DbCircle {
  id: string;
  slug: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  interestSlug: string | null;
  externalInviteUrl: string | null;
  memberIds: string[];
}

export interface DbMessage {
  id: string;
  circleId: string;
  authorId: string;
  body: string;
  createdAt: number;
}

export interface DbNotification {
  id: string;
  userId: string;
  type: 'answer' | 'accepted' | 'helpful' | 'follow';
  actorId: string;
  postId: string | null;
  read: boolean;
  createdAt: number;
}

export interface DbEvent {
  userId: string;
  postId: string;
  type: EventType;
  value: number | null;
  at: number;
}

export interface DbAccount {
  userId: string;
  salt: string;
  /** Salted SHA-256 of the password — never the password itself. */
  hash: string;
}

export interface DbState {
  version: number;
  seedHash: string;
  /** "Now" used to resolve the seed's relative timestamps. */
  anchor: number;
  sessionUserId: string | null;
  users: Record<string, DbUser>;
  /** Keyed by lower-cased e-mail. */
  accounts: Record<string, DbAccount>;
  /** userId → interest slug → row. */
  interests: Record<string, InterestMap>;
  follows: { followerId: string; followeeId: string; createdAt: number }[];
  circles: Record<string, DbCircle>;
  posts: Record<string, DbPost>;
  answers: Record<string, DbAnswer>;
  /** `${userId}|post|${id}` or `${userId}|answer|${id}` → timestamp. */
  votes: Record<string, number>;
  /** `${userId}|${postId}` → timestamp. */
  saves: Record<string, number>;
  events: DbEvent[];
  /** userId → posts hidden by "less of this". */
  hidden: Record<string, string[]>;
  messages: DbMessage[];
  notifications: DbNotification[];
  reports: { reporterId: string; targetType: string; targetId: string; reason: string; createdAt: number }[];
  /** `${userId}|${yyyy-mm-dd}` → AI calls. */
  aiUsage: Record<string, number>;
}

// ── Seed → state ─────────────────────────────────────────────────────────────

function hashString(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const SEED_HASH = `${seed.posts.length}.${seed.users.length}.${hashString(JSON.stringify(seed))}`;

function buildFromSeed(now: number): DbState {
  const state: DbState = {
    version: STATE_VERSION,
    seedHash: SEED_HASH,
    anchor: now,
    sessionUserId: null,
    users: {},
    accounts: {},
    interests: {},
    follows: [],
    circles: {},
    posts: {},
    answers: {},
    votes: {},
    saves: {},
    events: [],
    hidden: {},
    messages: [],
    notifications: [],
    reports: [],
    aiUsage: {},
  };

  seed.users.forEach((user, index) => {
    state.users[user.id] = {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      level: user.level,
      bio: user.bio,
      githubLogin: user.githubLogin,
      locale: 'fr',
      isGuest: false,
      onboarded: true,
      reputation: user.reputation,
      createdAt: now - (40 + index * 23) * DAY,
    };
    const map: InterestMap = {};
    for (const item of user.interests) {
      map[item.slug] = { weight: item.weight, muted: false, source: 'onboarding', baseWeight: item.weight, updatedAt: now };
    }
    state.interests[user.id] = map;
  });

  seed.follows.forEach((follow, index) => {
    const createdAt = now - (2 + ((index * 37) % 200)) * HOUR;
    state.follows.push({ ...follow, createdAt });
    state.notifications.push({
      id: `seed-follow-${index}`,
      userId: follow.followeeId,
      type: 'follow',
      actorId: follow.followerId,
      postId: null,
      read: now - createdAt > DAY,
      createdAt,
    });
  });

  for (const circle of seed.circles) {
    state.circles[circle.id] = {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      descriptionFr: circle.descriptionFr,
      descriptionEn: circle.descriptionEn,
      interestSlug: circle.interestSlug,
      externalInviteUrl: circle.externalInviteUrl,
      memberIds: [...circle.memberIds],
    };
  }

  for (const post of seed.posts) {
    const accepted = post.answers.find((answer) => answer.isAccepted) ?? null;
    state.posts[post.id] = {
      id: post.id,
      authorId: post.authorId,
      circleId: post.circleId,
      kind: post.kind,
      title: post.title,
      bodyMd: post.bodyMd,
      code: post.code,
      language: post.language,
      repro: post.repro,
      tags: [...post.tags],
      difficulty: post.difficulty,
      aiSummary: post.aiSummary,
      aiHints: [...post.aiHints],
      status: post.status,
      acceptedAnswerId: accepted?.id ?? null,
      acceptedAt: accepted ? now - accepted.hoursAgo * HOUR : null,
      helpfulCount: post.helpfulCount,
      viewCount: post.viewCount,
      createdAt: now - post.hoursAgo * HOUR,
    };
    for (const answer of post.answers) {
      const createdAt = now - answer.hoursAgo * HOUR;
      state.answers[answer.id] = {
        id: answer.id,
        postId: post.id,
        authorId: answer.authorId,
        bodyMd: answer.bodyMd,
        repro: answer.repro,
        isAi: answer.isAi,
        isAccepted: answer.isAccepted,
        helpfulCount: answer.helpfulCount,
        createdAt,
      };
      const read = now - createdAt > DAY;
      if (answer.authorId !== post.authorId) {
        state.notifications.push({
          id: `seed-answer-${answer.id}`,
          userId: post.authorId,
          type: 'answer',
          actorId: answer.authorId,
          postId: post.id,
          read,
          createdAt,
        });
        if (answer.isAccepted) {
          state.notifications.push({
            id: `seed-accepted-${answer.id}`,
            userId: answer.authorId,
            type: 'accepted',
            actorId: post.authorId,
            postId: post.id,
            read,
            createdAt: createdAt + 20 * 60_000,
          });
        }
      }
    }
  }

  for (const message of seed.messages) {
    state.messages.push({
      id: message.id,
      circleId: message.circleId,
      authorId: message.authorId,
      body: message.body,
      createdAt: now - message.minutesAgo * 60_000,
    });
  }
  state.messages.sort((a, b) => a.createdAt - b.createdAt);

  return state;
}

/** Moves every seed-origin timestamp forward by `delta` so old profiles still show a lively demo. */
function reanchor(state: DbState, now: number): void {
  const delta = now - state.anchor;
  if (delta <= 0) return;
  const seedPostIds = new Set(seed.posts.map((p) => p.id));
  const seedAnswerIds = new Set(seed.posts.flatMap((p) => p.answers.map((a) => a.id)));
  const seedMessageIds = new Set(seed.messages.map((m) => m.id));
  const seedUserIds = new Set(seed.users.map((u) => u.id));

  for (const post of Object.values(state.posts)) {
    if (!seedPostIds.has(post.id)) continue;
    post.createdAt += delta;
    if (post.acceptedAt !== null && post.acceptedAnswerId && seedAnswerIds.has(post.acceptedAnswerId)) post.acceptedAt += delta;
  }
  for (const answer of Object.values(state.answers)) if (seedAnswerIds.has(answer.id)) answer.createdAt += delta;
  for (const message of state.messages) if (seedMessageIds.has(message.id)) message.createdAt += delta;
  for (const notification of state.notifications) if (notification.id.startsWith('seed-')) notification.createdAt += delta;
  for (const userId of seedUserIds) {
    for (const row of Object.values(state.interests[userId] ?? {})) row.updatedAt += delta;
  }
  state.messages.sort((a, b) => a.createdAt - b.createdAt);
  state.anchor = now;
}

// ── Persistence ──────────────────────────────────────────────────────────────

function getStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_KEY}.probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

let storage: Storage | null = null;
let state: DbState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** False when the last write failed or no storage exists: the session then lives in memory only. */
let persistent = false;

function writeNow(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!storage || !state) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    persistent = true;
  } catch {
    // Quota exceeded or storage revoked: keep going in memory.
    persistent = false;
  }
}

function load(): DbState {
  const now = Date.now();
  storage = getStorage();
  let loaded: DbState | null = null;
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DbState;
        if (parsed && parsed.version === STATE_VERSION && parsed.seedHash === SEED_HASH && parsed.users && parsed.posts) loaded = parsed;
      }
    } catch {
      loaded = null;
    }
  }
  const next = loaded ?? buildFromSeed(now);
  if (loaded && now - loaded.anchor > REANCHOR_AFTER) reanchor(next, now);
  state = next;
  persistent = storage !== null;
  writeNow();

  const target = globalThis as { addEventListener?: (type: string, cb: () => void) => void };
  if (typeof target.addEventListener === 'function') {
    target.addEventListener('pagehide', writeNow);
  }
  return next;
}

/** The live state. Mutate it in place, then call `save()`. */
export function db(): DbState {
  return state ?? load();
}

/** Schedules a write to localStorage (coalesced). */
export function save(): void {
  const current = db();
  if (current.events.length > MAX_EVENTS) current.events.splice(0, current.events.length - MAX_EVENTS);
  if (!storage) return;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(writeNow, 150);
}

/** Writes immediately (tests, page unload). */
export function flush(): void {
  writeNow();
}

export function isPersistent(): boolean {
  db();
  return persistent;
}

/** Drops every local change and starts again from the seed. */
export function resetLocalData(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  storage = getStorage();
  state = buildFromSeed(Date.now());
  persistent = storage !== null;
  writeNow();
}

/** Ids of the seeded (scripted) members, used by the chat simulation. */
export const SEED_USER_IDS: ReadonlySet<string> = new Set(seed.users.map((user) => user.id));
