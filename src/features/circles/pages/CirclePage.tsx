import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { useProfile } from '@/app/auth';
import { errorMessage } from '@/app/i18n';
import { usePageTitle } from '@/app/layout';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, PostCard, PostListSkeleton, RelativeTime, safeUrl, UserAvatar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, qk } from '@/lib/api';
import type { ChatMessage, Circle } from '@/lib/api/contract';
import { cn } from '@/lib/utils';
import { useMembership } from './CirclesPage';

export default function CirclePage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation('circles');
  const circle = useQuery({ queryKey: qk.circle(slug), queryFn: () => api.circles.get(slug), retry: false });
  const membership = useMembership();
  const [tab, setTab] = React.useState<'problems' | 'chat'>('problems');
  usePageTitle(circle.data?.name);

  if (circle.isPending) return <PageSkeleton />;
  if (circle.isError)
    return <EmptyState title={t('circle.notFound')} description="" action={<Button asChild><Link to="/circles">{t('circle.back')}</Link></Button>} />;
  const data = circle.data;
  const invite = data.externalInviteUrl ? safeUrl(data.externalInviteUrl) : null;

  return (
    <>
      <PageHeader
        kicker={t('list.members', { count: data.memberCount })}
        title={data.name}
        description={i18n.language === 'en' ? data.descriptionEn : data.descriptionFr}
        actions={
          <>
            {invite && <Button asChild variant="ghost"><a href={invite} target="_blank" rel="nofollow noopener noreferrer">{t('circle.invite')}</a></Button>}
            <Button variant={data.viewer.isMember ? 'outline' : 'default'} aria-pressed={data.viewer.isMember} onClick={() => membership.mutate(data)}>
              {data.viewer.isMember ? t('list.leave') : t('list.join')}
            </Button>
          </>
        }
      />
      <div role="tablist" aria-label={t('circle.tabs')} className="mb-5 flex gap-1 border-b border-border">
        {(['problems', 'chat'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn('focus-ring -mb-px h-11 rounded-t-md border-b-2 px-3 text-sm font-medium', tab === value ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t(`circle.${value}`)}
          </button>
        ))}
      </div>
      {tab === 'problems' ? <CirclePosts slug={slug} /> : <Chat circle={data} onJoin={() => membership.mutate(data)} />}
    </>
  );
}

function CirclePosts({ slug }: { slug: string }) {
  const { t } = useTranslation('circles');
  const posts = useInfiniteQuery({
    queryKey: qk.circlePosts(slug),
    queryFn: ({ pageParam }) => api.circles.posts(slug, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  if (posts.isPending) return <PostListSkeleton />;
  if (posts.isError) return <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />;
  const ask = (
    <Button asChild>
      <Link to={`/p/new?circle=${slug}`}><Plus aria-hidden="true" />{t('circle.ask')}</Link>
    </Button>
  );
  if (items.length === 0) return <EmptyState title={t('circle.empty')} description="" action={ask} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{ask}</div>
      {items.map((post) => <PostCard key={post.id} post={post} />)}
      {posts.hasNextPage && (
        <Button variant="secondary" className="self-center" onClick={() => void posts.fetchNextPage()} loading={posts.isFetchingNextPage}>{t('circle.loadMore')}</Button>
      )}
    </div>
  );
}

function Chat({ circle, onJoin }: { circle: Circle; onJoin: () => void }) {
  const { t } = useTranslation('circles');
  const profile = useProfile();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [online, setOnline] = React.useState<number | null>(null);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const log = React.useRef<HTMLDivElement>(null);
  const history = useQuery({ queryKey: qk.chat(circle.id), queryFn: () => api.chat.history(circle.id), gcTime: 0 });

  const add = React.useCallback((message: ChatMessage) => {
    setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
  }, []);
  React.useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);
  React.useEffect(() => api.chat.subscribe(circle.id, { onMessage: add, onPresence: setOnline }), [circle.id, add]);
  React.useEffect(() => {
    const node = log.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      add(await api.chat.send(circle.id, body));
      setText('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex h-[min(34rem,calc(100dvh-22rem))] min-h-80 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <p className="flex items-center gap-2 border-b border-border-soft px-4 py-2.5 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        {online !== null ? t('circle.online', { count: online }) : '…'}
      </p>
      <div ref={log} role="log" aria-live="polite" aria-label={t('circle.chat')} tabIndex={0} className="focus-ring flex-1 overflow-y-auto px-4 py-3">
        {history.isPending ? null : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('circle.chatEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((message) => {
              const mine = message.author.id === profile.id;
              return (
                <li key={message.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
                  <UserAvatar user={message.author} size="sm" />
                  <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-brand-soft border border-brand-border' : 'bg-surface-hover')}>
                    <p className="mb-0.5 text-xs text-muted-foreground">
                      {message.author.displayName} · <RelativeTime date={message.createdAt} />
                    </p>
                    <p className="break-words whitespace-pre-wrap">{message.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {circle.viewer.isMember ? (
        <form onSubmit={send} className="flex gap-2 border-t border-border-soft p-3">
          <Input aria-label={t('circle.messageLabel')} placeholder={t('circle.placeholder')} value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} />
          <Button type="submit" disabled={!text.trim()} loading={sending} aria-label={t('circle.send')}><Send aria-hidden="true" /></Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-border-soft p-3 text-sm text-muted-foreground">
          {t('circle.joinToWrite')}
          <Button size="sm" onClick={onJoin}>{t('list.join')}</Button>
        </div>
      )}
    </section>
  );
}
