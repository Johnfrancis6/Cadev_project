/**
 * THROWAWAY stub used only until `src/lib/api/local/index.ts` exists. Delete afterwards.
 */
import { ApiError, type Api, type AppNotification, type Author, type Circle, type Profile } from './contract';

const KEY = 'devloop.stub.session';
const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

const me: Profile = {
  id: 'u-alex', handle: 'alex', displayName: 'Alex Morgan', avatarUrl: '/avatars/alex.jpg', level: 'intermediate',
  reputation: 128, bio: 'Full-stack, curieux de tout.', githubLogin: null, locale: 'fr', isGuest: false, onboarded: true,
  createdAt: iso(60 * 24 * 30),
};
const sarah: Author = { id: 'u-sarah', handle: 'sarah', displayName: 'Sarah Chen', avatarUrl: '/avatars/sarah.jpg', level: 'senior', reputation: 842 };
const amine: Author = { id: 'u-amine', handle: 'amine', displayName: 'Amine Benali', avatarUrl: '/avatars/amine.jpg', level: 'senior', reputation: 510 };

const circle = (slug: string, name: string, member: boolean, n: number): Circle => ({
  id: `c-${slug}`, slug, name, descriptionFr: `Le cercle ${name}.`, descriptionEn: `The ${name} circle.`, interest: null,
  externalInviteUrl: null, memberCount: n, postCount: Math.round(n / 3), viewer: { isMember: member },
});
const circles = [circle('javascript', 'JavaScript', true, 214), circle('react', 'React', true, 187), circle('python', 'Python', true, 96), circle('devops', 'DevOps', false, 61)];

let notifications: AppNotification[] = [
  { id: 'n1', type: 'answer', actor: sarah, postId: 'p1', postTitle: 'useEffect se déclenche deux fois en développement', read: false, createdAt: iso(12) },
  { id: 'n2', type: 'helpful', actor: amine, postId: 'p1', postTitle: 'useEffect se déclenche deux fois en développement', read: false, createdAt: iso(95) },
  { id: 'n3', type: 'follow', actor: amine, postId: null, postTitle: null, read: true, createdAt: iso(60 * 26) },
];

let session: Profile | null = null;
try {
  session = localStorage.getItem(KEY) ? me : null;
} catch { /* ignore */ }
const listeners = new Set<(p: Profile | null) => void>();
const setSession = (p: Profile | null) => {
  session = p;
  try {
    if (p) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
  listeners.forEach((l) => l(p));
};
const nope = (): never => {
  throw new ApiError('unknown', 'stub');
};
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

export const localApi: Api = {
  mode: 'local',
  auth: {
    current: () => wait(session),
    onChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    signUpEmail: async () => (setSession(me), me),
    signInEmail: async () => (setSession(me), me),
    signInGithub: async () => setSession(me),
    signInGuest: async () => (setSession(me), me),
    signOut: async () => setSession(null),
  },
  profiles: {
    get: async () => nope(),
    update: async (patch) => {
      Object.assign(me, patch);
      setSession({ ...me });
      return me;
    },
    completeOnboarding: async () => me,
    posts: async () => ({ items: [], nextCursor: null }),
    setFollowing: async () => undefined,
    suggestions: async () => [sarah, amine],
  },
  interests: {
    list: async () => [],
    mine: async () => [],
    setWeight: async () => undefined,
    setMuted: async () => undefined,
    importFromGithub: async (login) => ({ login, suggestions: [] }),
    saveMany: async () => undefined,
    resetLearning: async () => undefined,
  },
  feed: { list: async () => ({ items: [], nextCursor: null }), recordEvent: () => undefined },
  posts: {
    get: async () => nope(),
    create: async () => nope(),
    update: async () => nope(),
    remove: async () => undefined,
    setHelpful: async () => wait(undefined),
    setSaved: async () => wait(undefined),
    saved: async () => ({ items: [], nextCursor: null }),
    report: async () => undefined,
  },
  answers: { list: async () => [], create: async () => nope(), accept: async () => undefined, setHelpful: async () => undefined, remove: async () => undefined },
  search: { posts: async () => [], similar: async () => [], people: async () => [] },
  circles: {
    list: () => wait(circles),
    get: async (slug) => circles.find((c) => c.slug === slug) ?? nope(),
    setMember: async () => undefined,
    posts: async () => ({ items: [], nextCursor: null }),
  },
  chat: { history: async () => [], send: async () => nope(), subscribe: () => () => undefined },
  ai: { triage: async () => nope(), draftAnswer: async () => nope() },
  notifications: {
    list: () => wait(notifications),
    markAllRead: async () => {
      notifications = notifications.map((n) => ({ ...n, read: true }));
    },
    subscribe: () => () => undefined,
  },
  stats: {
    platform: async () => ({ members: 2480, problems: 1312, solved: 1004, unblockedThisWeek: 128 }),
    profile: async () => nope(),
  },
  status: {
    health: async () => ({ mode: 'local', database: 'ok', realtime: 'ok', semanticSearch: 'degraded', ai: [{ provider: 'heuristic', state: 'ok' }], latencyMs: 1, checkedAt: new Date().toISOString() }),
  },
};
