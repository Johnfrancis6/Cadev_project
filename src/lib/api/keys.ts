import type { FeedTab, Locale, PostStatus } from './contract';

/**
 * Shared TanStack Query keys. Always build keys through `qk` so every feature reads and
 * invalidates the same cache entries.
 *
 * Every key that holds `Post` objects starts with 'posts', so
 * `queryClient.invalidateQueries({ queryKey: qk.postsAll })` refreshes all post lists at once.
 * Optimistic edits of a post go through `patchPostInCache` (see `@/components/shared`).
 */
export const qk = {
  auth: () => ['auth'] as const,

  // ── posts ────────────────────────────────────────────────────────────────
  postsAll: ['posts'] as const,
  post: (id: string) => ['posts', 'detail', id] as const,
  feedAll: ['posts', 'feed'] as const,
  feed: (tab: FeedTab, interestSlug?: string | null) => ['posts', 'feed', tab, interestSlug ?? null] as const,
  savedPosts: () => ['posts', 'saved'] as const,
  userPosts: (userId: string) => ['posts', 'user', userId] as const,
  circlePosts: (slug: string) => ['posts', 'circle', slug] as const,
  searchPosts: (query: string, status?: PostStatus | null) => ['posts', 'search', query, status ?? null] as const,
  similarPosts: (text: string) => ['posts', 'similar', text] as const,

  // ── answers ──────────────────────────────────────────────────────────────
  answers: (postId: string) => ['answers', postId] as const,

  // ── profiles ─────────────────────────────────────────────────────────────
  profilesAll: ['profiles'] as const,
  profile: (handle: string) => ['profiles', 'detail', handle] as const,
  profileStats: (userId: string) => ['profiles', 'stats', userId] as const,
  suggestions: (limit?: number) => ['profiles', 'suggestions', limit ?? null] as const,
  searchPeople: (query: string) => ['profiles', 'search', query] as const,

  // ── interests ────────────────────────────────────────────────────────────
  interestsAll: ['interests'] as const,
  interests: () => ['interests', 'list'] as const,
  myInterests: () => ['interests', 'mine'] as const,
  githubImport: (login: string) => ['interests', 'github', login.toLowerCase()] as const,

  // ── circles ──────────────────────────────────────────────────────────────
  circlesAll: ['circles'] as const,
  circles: () => ['circles', 'list'] as const,
  circle: (slug: string) => ['circles', 'detail', slug] as const,
  chat: (circleId: string) => ['circles', 'chat', circleId] as const,

  // ── misc ─────────────────────────────────────────────────────────────────
  notifications: () => ['notifications'] as const,
  platformStats: () => ['stats', 'platform'] as const,
  health: () => ['status', 'health'] as const,
  aiDraft: (postId: string, locale: Locale) => ['ai', 'draft', postId, locale] as const,
} as const;
