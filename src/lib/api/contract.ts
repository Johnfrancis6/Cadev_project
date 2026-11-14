/**
 * devloop — data-layer contract.
 *
 * Single source of truth shared by the UI, the local (mock) implementation and
 * the Supabase implementation. UI code only ever talks to `Api`; it never
 * imports the Supabase client directly.
 *
 * Conventions: ids are strings (uuid), dates are ISO-8601 strings, field names
 * are camelCase here and snake_case in Postgres.
 */

export type Level = 'beginner' | 'intermediate' | 'senior';
export type PostKind = 'problem' | 'discussion';
export type PostStatus = 'open' | 'solved';
export type Locale = 'fr' | 'en';
export type FeedTab = 'for-you' | 'following' | 'unanswered' | 'latest';

/** Behaviour signals that train the feed. `less` is the explicit "less of this" action. */
export type EventType =
  | 'impression'
  | 'open'
  | 'dwell'
  | 'expand_code'
  | 'copy_code'
  | 'run_repro'
  | 'helpful'
  | 'save'
  | 'answer'
  | 'accept'
  | 'less';

export interface Interest {
  id: number;
  slug: string;
  labelFr: string;
  labelEn: string;
}

export type InterestSource = 'onboarding' | 'github' | 'behavior' | 'manual';

export interface UserInterest {
  interest: Interest;
  /** 0..1 — how strongly the feed favours this topic. */
  weight: number;
  muted: boolean;
  source: InterestSource;
  /** Posts of this topic the viewer opened in the last 14 days (drives the "because you read N posts" chip). */
  recentOpens: number;
}

export interface Author {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  level: Level;
  reputation: number;
}

export interface Profile extends Author {
  bio: string;
  githubLogin: string | null;
  locale: Locale;
  /** Guest (anonymous) session. */
  isGuest: boolean;
  onboarded: boolean;
  createdAt: string;
}

export interface ProfileStats {
  /** Headline metric: problems this person helped solve (accepted answers) in the last 7 days. */
  unblockedThisWeek: number;
  unblockedTotal: number;
  problemsAsked: number;
  problemsSolved: number;
  answersGiven: number;
  helpfulReceived: number;
  /** accepted answers / answers given, 0..1 */
  unblockRate: number;
  followers: number;
  following: number;
}

export interface ProfileDetail {
  profile: Profile;
  stats: ProfileStats;
  interests: Interest[];
  viewer: { isSelf: boolean; isFollowing: boolean };
}

/** Runnable reproduction: three plain files executed in a sandboxed iframe. */
export interface Repro {
  html: string;
  css: string;
  js: string;
}

export type FeedReasonKind =
  | 'interest' // matches one of the viewer's interests
  | 'level' // difficulty matches the viewer's level
  | 'trending' // active in a circle right now
  | 'explore' // exploration slot: a topic the viewer has not tried much
  | 'fresh' // just posted
  | 'following' // author is followed by the viewer
  | 'unanswered'; // nobody has answered yet

export interface FeedReason {
  kind: FeedReasonKind;
  interestSlug?: string;
  circleSlug?: string;
  /** kind = interest: number of posts on that topic recently opened by the viewer. */
  count?: number;
}

export interface CircleRef {
  id: string;
  slug: string;
  name: string;
}

export interface Post {
  id: string;
  kind: PostKind;
  title: string;
  bodyMd: string;
  code: string | null;
  language: string | null;
  repro: Repro | null;
  difficulty: Level;
  aiSummary: string | null;
  aiHints: string[];
  status: PostStatus;
  acceptedAnswerId: string | null;
  author: Author;
  circle: CircleRef | null;
  tags: Interest[];
  helpfulCount: number;
  answerCount: number;
  viewCount: number;
  createdAt: string;
  viewer: { helpful: boolean; saved: boolean };
  /** Present on feed results only. */
  reasons?: FeedReason[];
  score?: number;
  /** Present on semantic-search results only, 0..1. */
  similarity?: number;
}

export interface Answer {
  id: string;
  postId: string;
  author: Author;
  bodyMd: string;
  /** A fixed copy of the post's repro ("fork & fix"). */
  repro: Repro | null;
  isAi: boolean;
  isAccepted: boolean;
  helpfulCount: number;
  createdAt: string;
  viewer: { helpful: boolean };
}

export interface Circle {
  id: string;
  slug: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  interest: Interest | null;
  externalInviteUrl: string | null;
  memberCount: number;
  postCount: number;
  viewer: { isMember: boolean };
}

export interface ChatMessage {
  id: string;
  circleId: string;
  author: Author;
  body: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: 'answer' | 'accepted' | 'helpful' | 'follow';
  actor: Author;
  postId: string | null;
  postTitle: string | null;
  read: boolean;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  /** Pass back to get the next page; null when there is nothing more. */
  nextCursor: string | null;
}

export interface PostInput {
  kind: PostKind;
  title: string;
  bodyMd: string;
  code?: string | null;
  language?: string | null;
  repro?: Repro | null;
  /** Interest slugs, 1..5. */
  tags: string[];
  difficulty: Level;
  circleId?: string | null;
  aiSummary?: string | null;
  aiHints?: string[];
}

export interface AnswerInput {
  bodyMd: string;
  repro?: Repro | null;
  /** True when the text started from the AI draft. */
  isAi?: boolean;
}

export interface TriageInput {
  title: string;
  bodyMd: string;
  code?: string | null;
  language?: string | null;
  locale: Locale;
}

export interface TriageResult {
  /** Interest slugs (subset of the interests table). */
  tags: string[];
  difficulty: Level;
  summary: string;
  hints: string[];
  /** 'groq' | 'mistral' | 'openrouter' | 'cerebras' | 'heuristic' */
  provider: string;
  cached: boolean;
  /** True when no AI provider answered and the local heuristic was used. */
  degraded: boolean;
}

export interface DraftResult {
  answerMd: string;
  provider: string;
  degraded: boolean;
}

export interface GithubImport {
  login: string;
  /** Suggested interests derived from the public repositories' languages and topics. */
  suggestions: { slug: string; weight: number; evidence: string }[];
}

export interface PlatformStats {
  members: number;
  problems: number;
  solved: number;
  unblockedThisWeek: number;
}

export type ServiceState = 'ok' | 'degraded' | 'down' | 'unconfigured';

export interface Health {
  /** 'live' = Supabase backend, 'local' = in-browser demo data. */
  mode: 'live' | 'local';
  database: ServiceState;
  realtime: ServiceState;
  semanticSearch: ServiceState;
  ai: { provider: string; state: ServiceState }[];
  latencyMs: number | null;
  checkedAt: string;
}

/** Error thrown by every Api method. `code` is stable and translatable. */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'rate_limited'
  | 'conflict'
  | 'network'
  | 'unknown';

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
  }
}

export type Unsubscribe = () => void;

export interface Api {
  mode: 'live' | 'local';

  auth: {
    /** Current signed-in profile, or null. Resolves once the stored session has been restored. */
    current(): Promise<Profile | null>;
    onChange(cb: (profile: Profile | null) => void): Unsubscribe;
    signUpEmail(input: { email: string; password: string; displayName: string }): Promise<Profile>;
    signInEmail(input: { email: string; password: string }): Promise<Profile>;
    /** Redirects to GitHub; resolves when the redirect starts. */
    signInGithub(): Promise<void>;
    /** One-click guest session (anonymous). */
    signInGuest(): Promise<Profile>;
    signOut(): Promise<void>;
  };

  profiles: {
    get(handle: string): Promise<ProfileDetail>;
    update(patch: Partial<Pick<Profile, 'displayName' | 'handle' | 'bio' | 'level' | 'locale' | 'avatarUrl'>>): Promise<Profile>;
    completeOnboarding(input: { level: Level; interestSlugs: string[]; displayName?: string }): Promise<Profile>;
    posts(userId: string, cursor?: string | null): Promise<Page<Post>>;
    setFollowing(userId: string, following: boolean): Promise<void>;
    /** People worth following, ranked by shared interests. */
    suggestions(limit?: number): Promise<Author[]>;
  };

  interests: {
    list(): Promise<Interest[]>;
    mine(): Promise<UserInterest[]>;
    setWeight(interestId: number, weight: number): Promise<void>;
    setMuted(interestId: number, muted: boolean): Promise<void>;
    /** Reads the public GitHub API (no token) and maps languages/topics to interests. Does not save anything. */
    importFromGithub(login: string): Promise<GithubImport>;
    /** Saves a set of interests (onboarding / GitHub import confirmation). */
    saveMany(items: { slug: string; weight: number; source: InterestSource }[]): Promise<void>;
    /** Forgets behaviour-learned weights and goes back to the onboarding choices. */
    resetLearning(): Promise<void>;
  };

  feed: {
    list(params: { tab: FeedTab; interestSlug?: string | null; cursor?: string | null; limit?: number }): Promise<Page<Post>>;
    /** Fire-and-forget; never throws. Also updates the viewer's interest weights. */
    recordEvent(postId: string, type: EventType, value?: number): void;
  };

  posts: {
    get(id: string): Promise<Post>;
    create(input: PostInput): Promise<Post>;
    update(id: string, patch: Partial<PostInput>): Promise<Post>;
    remove(id: string): Promise<void>;
    setHelpful(id: string, on: boolean): Promise<void>;
    setSaved(id: string, on: boolean): Promise<void>;
    saved(cursor?: string | null): Promise<Page<Post>>;
    report(target: { type: 'post' | 'answer' | 'message'; id: string }, reason: string): Promise<void>;
  };

  answers: {
    list(postId: string): Promise<Answer[]>;
    create(postId: string, input: AnswerInput): Promise<Answer>;
    /** Only the post's author. Marks the post solved. Passing the already accepted answer un-accepts it. */
    accept(answerId: string): Promise<void>;
    setHelpful(id: string, on: boolean): Promise<void>;
    remove(id: string): Promise<void>;
  };

  search: {
    /** Keyword search (full text). Solved problems rank higher. */
    posts(query: string, opts?: { limit?: number; status?: PostStatus }): Promise<Post[]>;
    /** "Maybe already solved": semantic similarity, falling back to keywords when embeddings are unavailable. */
    similar(text: string, opts?: { limit?: number }): Promise<Post[]>;
    people(query: string, limit?: number): Promise<Author[]>;
  };

  circles: {
    list(): Promise<Circle[]>;
    get(slug: string): Promise<Circle>;
    setMember(circleId: string, member: boolean): Promise<void>;
    posts(slug: string, cursor?: string | null): Promise<Page<Post>>;
  };

  chat: {
    history(circleId: string, limit?: number): Promise<ChatMessage[]>;
    send(circleId: string, body: string): Promise<ChatMessage>;
    /** Live messages + number of people currently in the room. */
    subscribe(
      circleId: string,
      handlers: { onMessage: (m: ChatMessage) => void; onPresence?: (online: number) => void },
    ): Unsubscribe;
  };

  ai: {
    triage(input: TriageInput): Promise<TriageResult>;
    draftAnswer(postId: string, locale: Locale): Promise<DraftResult>;
  };

  notifications: {
    list(): Promise<AppNotification[]>;
    markAllRead(): Promise<void>;
    subscribe(cb: (n: AppNotification) => void): Unsubscribe;
  };

  stats: {
    platform(): Promise<PlatformStats>;
    profile(userId: string): Promise<ProfileStats>;
  };

  status: {
    health(): Promise<Health>;
  };
}
