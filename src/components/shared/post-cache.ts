import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage } from '@/app/i18n';
import { api } from '@/lib/api';
import type { Post } from '@/lib/api/contract';

type Snapshot = [QueryKey, unknown][];

const isPost = (value: unknown): value is Post =>
  typeof value === 'object' && value !== null && 'viewer' in value && 'helpfulCount' in value && 'answerCount' in value;

function patchData(data: unknown, id: string, update: (post: Post) => Post): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((entry) => {
      const patched = patchData(entry, id, update);
      if (patched !== entry) changed = true;
      return patched;
    });
    return changed ? next : data;
  }
  if (isPost(data)) return data.id === id ? update(data) : data;
  if (typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    // Page<Post> ({ items }) and InfiniteData ({ pages }).
    for (const key of ['items', 'pages'] as const) {
      if (Array.isArray(record[key])) {
        const patched = patchData(record[key], id, update);
        if (patched !== record[key]) return { ...record, [key]: patched };
      }
    }
  }
  return data;
}

/**
 * Applies `update` to a post wherever it is cached (detail, feed pages, lists, search results…).
 * Returns a snapshot to hand to `restorePostCache` if the server call fails.
 */
export function patchPostInCache(queryClient: QueryClient, postId: string, update: (post: Post) => Post): Snapshot {
  const snapshot: Snapshot = [];
  for (const [key, data] of queryClient.getQueriesData<unknown>({})) {
    const next = patchData(data, postId, update);
    if (next !== data) {
      snapshot.push([key, data]);
      queryClient.setQueryData(key, next);
    }
  }
  return snapshot;
}

export function restorePostCache(queryClient: QueryClient, snapshot: Snapshot): void {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

/**
 * Optimistic "helpful" and "save" toggles for a post. The returned post reflects the pending
 * state even when the post is not in any query cache (e.g. passed as a plain prop).
 */
export function usePostActions(post: Post): {
  post: Post;
  toggleHelpful: () => void;
  toggleSaved: () => void;
  pending: boolean;
} {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [override, setOverride] = React.useState<{ id: string; viewer: Post['viewer']; helpfulCount: number } | null>(null);
  const [pending, setPending] = React.useState(false);
  const base = override && override.id === post.id ? { ...post, viewer: override.viewer, helpfulCount: override.helpfulCount } : post;

  // Once the caches (and therefore the prop) carry the new state, drop the local override.
  React.useEffect(() => {
    if (override && !pending && post.viewer.helpful === override.viewer.helpful && post.viewer.saved === override.viewer.saved) setOverride(null);
  }, [post.viewer.helpful, post.viewer.saved, override, pending]);

  const run = async (next: Post, call: () => Promise<void>, onDone?: () => void) => {
    if (pending) return;
    setPending(true);
    setOverride({ id: next.id, viewer: next.viewer, helpfulCount: next.helpfulCount });
    const snapshot = patchPostInCache(queryClient, next.id, (cached) => ({ ...cached, viewer: next.viewer, helpfulCount: next.helpfulCount }));
    try {
      await call();
      onDone?.();
    } catch (error) {
      restorePostCache(queryClient, snapshot);
      setOverride(null);
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const toggleHelpful = () => {
    const on = !base.viewer.helpful;
    void run(
      { ...base, viewer: { ...base.viewer, helpful: on }, helpfulCount: Math.max(0, base.helpfulCount + (on ? 1 : -1)) },
      () => api.posts.setHelpful(base.id, on),
      () => on && api.feed.recordEvent(base.id, 'helpful'),
    );
  };

  const toggleSaved = () => {
    const on = !base.viewer.saved;
    void run(
      { ...base, viewer: { ...base.viewer, saved: on } },
      () => api.posts.setSaved(base.id, on),
      () => {
        if (on) api.feed.recordEvent(base.id, 'save');
        void queryClient.invalidateQueries({ queryKey: ['posts', 'saved'] });
        toast(on ? t('post.savedToast') : t('post.unsavedToast'));
      },
    );
  };

  return { post: base, toggleHelpful, toggleSaved, pending };
}
