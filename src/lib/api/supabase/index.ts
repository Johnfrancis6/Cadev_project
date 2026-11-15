/**
 * Live mode — the `Api` on Supabase. Every read and write goes through an RPC that returns
 * JSON shaped like the contract; row-level security does the access control server side.
 * Until the AI gateway is deployed, triage and drafts use the same local heuristics as the
 * demo mode (always flagged `degraded`), and "similar" uses the keyword search RPC.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  ApiError,
  type Answer,
  type Api,
  type ApiErrorCode,
  type AppNotification,
  type Author,
  type ChatMessage,
  type DraftResult,
  type TriageResult,
  type Circle,
  type Interest,
  type Page,
  type PlatformStats,
  type Post,
  type Profile,
  type ProfileDetail,
  type ProfileStats,
  type UserInterest,
} from '../contract';
import { fetchGithubImport } from '../../heuristics/github';
import { heuristicDraft, heuristicTriage } from '../../heuristics/triage';

const CODES: ApiErrorCode[] = ['unauthenticated', 'forbidden', 'not_found', 'validation', 'rate_limited', 'conflict'];
const PAGE_SIZE = 10;

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const e = (error ?? {}) as { message?: string; code?: string; status?: number };
  const message = e.message ?? '';
  const prefix = CODES.find((code) => message.startsWith(code));
  if (prefix) return new ApiError(prefix, message);
  if (e.code === '23505') return new ApiError('conflict', message);
  if (e.code === '23514' || e.code === '22001' || e.code === '23502') return new ApiError('validation', message);
  if (e.code === '42501' || e.status === 403) return new ApiError('forbidden', message);
  if (e.code === 'PGRST301' || e.status === 401) return new ApiError('unauthenticated', message);
  if (e.status === 429) return new ApiError('rate_limited', message);
  if (/fetch|network|Failed to/i.test(message)) return new ApiError('network', message);
  return new ApiError('unknown', message);
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const supabase: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });

  async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw toApiError(error);
    return data as T;
  }
  /** Calls the AI gateway; resolves to null on any failure so callers can fall back. */
  async function gateway<T>(body: Record<string, unknown>): Promise<T | null> {
    try {
      const { data, error } = await supabase.functions.invoke('ai', { body });
      return error ? null : (data as T);
    } catch {
      return null;
    }
  }
  const offsetOf = (cursor?: string | null) => Math.max(0, Number(cursor ?? 0) || 0);

  async function currentProfile(): Promise<Profile | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    try {
      return (await rpc<Profile | null>('my_profile')) ?? null;
    } catch {
      return null;
    }
  }
  async function requireProfile(): Promise<Profile> {
    // The profile row is created by a database trigger; give it a moment on first sign-in.
    for (let attempt = 0; attempt < 5; attempt++) {
      const profile = await currentProfile();
      if (profile) return profile;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new ApiError('unauthenticated');
  }
  function authError(error: { message?: string; status?: number; code?: string }): ApiError {
    const code = error.code ?? '';
    if (code === 'user_already_exists' || /already registered/i.test(error.message ?? '')) return new ApiError('conflict');
    if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) return new ApiError('rate_limited');
    if (code === 'weak_password' || code === 'validation_failed' || error.status === 422) return new ApiError('validation');
    if (error.status === 400 || error.status === 401) return new ApiError('unauthenticated');
    return toApiError(error);
  }

  const channels = new Set<RealtimeChannel>();
  let healthCalls = 0;

  return {
    mode: 'live',

    auth: {
      current: currentProfile,
      onChange(cb) {
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
          // Never call Supabase from inside this callback: defer.
          setTimeout(() => void currentProfile().then(cb), 0);
        });
        return () => data.subscription.unsubscribe();
      },
      async signUpEmail({ email, password, displayName }) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (error) throw authError(error);
        if (!data.session) throw new ApiError('conflict');
        return requireProfile();
      },
      async signInEmail({ email, password }) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw authError(error);
        return requireProfile();
      },
      async signInGithub() {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: `${window.location.origin}/feed` } });
        if (error) throw authError(error);
      },
      async signInGuest() {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw authError(error);
        return requireProfile();
      },
      async signOut() {
        channels.forEach((channel) => void supabase.removeChannel(channel));
        channels.clear();
        await supabase.auth.signOut();
      },
    },

    profiles: {
      get: (handle) => rpc<ProfileDetail>('get_profile', { p_handle: handle }),
      update: (patch) => rpc<Profile>('update_profile', { p_patch: patch }),
      completeOnboarding: ({ level, interestSlugs, displayName }) =>
        rpc<Profile>('complete_onboarding', { p_level: level, p_slugs: interestSlugs, p_display_name: displayName ?? null }),
      posts: (userId, cursor) => rpc<Page<Post>>('user_posts', { p_user_id: userId, p_limit: PAGE_SIZE, p_offset: offsetOf(cursor) }),
      setFollowing: (userId, following) => rpc<void>('set_following', { p_user_id: userId, p_on: following }),
      suggestions: (limit = 3) => rpc<Author[]>('people_suggestions', { p_limit: limit }),
    },

    interests: {
      list: () => rpc<Interest[]>('list_interests'),
      mine: () => rpc<UserInterest[]>('my_interests'),
      setWeight: (interestId, weight) => rpc<void>('set_interest_weight', { p_interest_id: interestId, p_weight: weight }),
      setMuted: (interestId, muted) => rpc<void>('set_interest_muted', { p_interest_id: interestId, p_muted: muted }),
      importFromGithub: fetchGithubImport,
      saveMany: (items) => rpc<void>('save_interests', { p_items: items }),
      resetLearning: () => rpc<void>('reset_learning'),
    },

    feed: {
      list: ({ tab, interestSlug, cursor, limit }) =>
        rpc<Page<Post>>('feed_for_user', { p_tab: tab, p_limit: limit ?? PAGE_SIZE, p_offset: offsetOf(cursor), p_interest: interestSlug ?? null }),
      recordEvent(postId, type, value) {
        void supabase.rpc('record_event', { p_post_id: postId, p_type: type, p_value: value ?? null }).then(
          () => undefined,
          () => undefined,
        );
      },
    },

    posts: {
      get: (id) => rpc<Post>('get_post', { p_id: id }),
      async create(input) {
        const post = await rpc<Post>('create_post', { p_input: input });
        void gateway({ task: 'embed_post', postId: post.id }); // makes it findable by meaning
        return post;
      },
      update: (id, patch) => rpc<Post>('update_post', { p_id: id, p_patch: patch }),
      remove: (id) => rpc<void>('delete_post', { p_id: id }),
      async setHelpful(id, on) {
        await rpc('set_helpful', { p_target_type: 'post', p_target_id: id, p_on: on });
      },
      setSaved: (id, on) => rpc<void>('set_saved', { p_post_id: id, p_on: on }),
      saved: (cursor) => rpc<Page<Post>>('saved_posts', { p_limit: PAGE_SIZE, p_offset: offsetOf(cursor) }),
      report: (target, reason) => rpc<void>('report_content', { p_target_type: target.type, p_target_id: target.id, p_reason: reason }),
    },

    answers: {
      list: (postId) => rpc<Answer[]>('list_answers', { p_post_id: postId }),
      create: (postId, input) => rpc<Answer>('create_answer', { p_post_id: postId, p_input: input }),
      async accept(answerId) {
        await rpc('accept_answer', { p_answer_id: answerId });
      },
      async setHelpful(id, on) {
        await rpc('set_helpful', { p_target_type: 'answer', p_target_id: id, p_on: on });
      },
      remove: (id) => rpc<void>('delete_answer', { p_id: id }),
    },

    search: {
      async posts(query, opts) {
        if (!query.trim()) return [];
        return rpc<Post[]>('search_posts', { p_query: query, p_limit: opts?.limit ?? 20, p_status: opts?.status ?? null });
      },
      async similar(text, opts) {
        if (text.trim().length < 6) return [];
        const semantic = await gateway<{ posts: Post[] }>({ task: 'similar', text: text.slice(0, 2000), limit: opts?.limit ?? 5 });
        if (semantic?.posts) return semantic.posts;
        return rpc<Post[]>('search_posts', { p_query: text.slice(0, 300), p_limit: opts?.limit ?? 5, p_status: null });
      },
      async people(query, limit = 8) {
        if (!query.trim()) return [];
        return rpc<Author[]>('search_people', { p_query: query, p_limit: limit });
      },
    },

    circles: {
      list: () => rpc<Circle[]>('list_circles'),
      get: (slug) => rpc<Circle>('get_circle', { p_slug: slug }),
      setMember: (circleId, member) => rpc<void>('set_circle_member', { p_circle_id: circleId, p_on: member }),
      posts: (slug, cursor) => rpc<Page<Post>>('circle_posts', { p_slug: slug, p_limit: PAGE_SIZE, p_offset: offsetOf(cursor) }),
    },

    chat: {
      history: (circleId, limit = 60) => rpc<ChatMessage[]>('chat_history', { p_circle_id: circleId, p_limit: limit }),
      send: (circleId, body) => rpc<ChatMessage>('send_message', { p_circle_id: circleId, p_body: body }),
      subscribe(circleId, handlers) {
        const channel = supabase.channel(`circle:${circleId}`, { config: { presence: { key: crypto.randomUUID() } } });
        channel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `circle_id=eq.${circleId}` }, (payload) => {
            const id = (payload.new as { id?: string }).id;
            if (!id) return;
            void rpc<ChatMessage | null>('get_message', { p_id: id }).then(
              (message) => message && handlers.onMessage(message),
              () => undefined,
            );
          })
          .on('presence', { event: 'sync' }, () => handlers.onPresence?.(Object.keys(channel.presenceState()).length))
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() });
          });
        channels.add(channel);
        return () => {
          channels.delete(channel);
          void supabase.removeChannel(channel);
        };
      },
    },

    ai: {
      async triage(input) {
        const result = await gateway<TriageResult>({ task: 'triage', ...input });
        if (result && !result.degraded && Array.isArray(result.tags)) return result;
        return heuristicTriage(input);
      },
      async draftAnswer(postId, locale) {
        const result = await gateway<DraftResult>({ task: 'draft', postId, locale });
        if (result && !result.degraded && result.answerMd) return result;
        const post = await rpc<Post>('get_post', { p_id: postId });
        return heuristicDraft(
          {
            title: post.title,
            bodyMd: post.bodyMd,
            code: post.code,
            language: post.language,
            tags: post.tags.map((tag) => tag.slug),
            tagLabels: post.tags.map((tag) => (locale === 'en' ? tag.labelEn : tag.labelFr)),
            aiHints: post.aiHints,
          },
          locale,
        );
      },
    },

    notifications: {
      async list() {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return [];
        return rpc<AppNotification[]>('list_notifications', { p_limit: 30 });
      },
      markAllRead: () => rpc<void>('mark_notifications_read'),
      subscribe(cb) {
        let channel: RealtimeChannel | null = null;
        let cancelled = false;
        void supabase.auth.getSession().then(({ data }) => {
          const userId = data.session?.user.id;
          if (!userId || cancelled) return;
          channel = supabase
            .channel(`notifications:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
              const id = (payload.new as { id?: string }).id;
              if (!id) return;
              void rpc<AppNotification | null>('get_notification', { p_id: id }).then(
                (notification) => notification && cb(notification),
                () => undefined,
              );
            })
            .subscribe();
          channels.add(channel);
        });
        return () => {
          cancelled = true;
          if (channel) {
            channels.delete(channel);
            void supabase.removeChannel(channel);
          }
        };
      },
    },

    stats: {
      platform: () => rpc<PlatformStats>('platform_stats'),
      profile: (userId) => rpc<ProfileStats>('profile_stats', { p_user_id: userId }),
    },

    status: {
      async health() {
        const started = performance.now();
        let database: 'ok' | 'down' = 'ok';
        try {
          const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(3500) });
          if (!response.ok) database = 'down';
        } catch {
          database = 'down';
        }
        // The first call is the start-up probe: keep it to one fast request so the first
        // screen is not held back by the AI gateway (which warms up an embedding model).
        const gatewayHealth = healthCalls++ === 0 ? null : await gateway<{ embeddings?: string; providers?: string[] }>({ task: 'health' });
        return {
          mode: 'live',
          database,
          realtime: database,
          semanticSearch: !gatewayHealth ? 'unconfigured' : gatewayHealth.embeddings === 'ok' ? 'ok' : 'degraded',
          ai: gatewayHealth?.providers?.length
            ? gatewayHealth.providers.map((provider) => ({ provider, state: 'ok' as const }))
            : [{ provider: 'heuristic', state: 'ok' as const }],
          latencyMs: Math.round(performance.now() - started),
          checkedAt: new Date().toISOString(),
        };
      },
    },
  };
}
