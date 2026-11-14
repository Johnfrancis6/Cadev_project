import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import * as React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { EmptyState } from '@/components/shared/states';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/api/contract';
import { qk } from '@/lib/api/keys';
import { cn } from '@/lib/utils';

export function Notifications() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data = [] } = useQuery({ queryKey: qk.notifications(), queryFn: () => api.notifications.list() });
  const unread = data.filter((n) => !n.read).length;

  React.useEffect(
    () =>
      api.notifications.subscribe((incoming) => {
        queryClient.setQueryData<AppNotification[]>(qk.notifications(), (current = []) =>
          current.some((n) => n.id === incoming.id) ? current : [incoming, ...current],
        );
      }),
    [queryClient],
  );

  const markAllRead = React.useCallback(() => {
    queryClient.setQueryData<AppNotification[]>(qk.notifications(), (current = []) => current.map((n) => ({ ...n, read: true })));
    api.notifications.markAllRead().catch(() => void queryClient.invalidateQueries({ queryKey: qk.notifications() }));
  }, [queryClient]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reading the list is what marks it read: do it when the panel closes.
        if (!next && unread > 0) markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `${t('notifications.open')} (${t('notifications.unread', { count: unread })})` : t('notifications.open')}
        >
          <Bell className="!size-[1.125rem]" aria-hidden="true" />
          {unread > 0 && <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-brand ring-2 ring-background" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{t('notifications.title')}</h2>
          {unread > 0 && (
            <Button variant="link" size="sm" onClick={markAllRead} className="text-xs">
              {t('notifications.markAllRead')}
            </Button>
          )}
        </div>
        {data.length === 0 ? (
          <EmptyState variant="plain" icon={Bell} title={t('notifications.empty')} description={t('notifications.emptyHint')} className="py-10" />
        ) : (
          <ul className="max-h-[min(26rem,60dvh)] overflow-y-auto p-1.5">
            {data.slice(0, 20).map((n) => {
              const to = n.postId ? `/p/${n.postId}` : `/u/${n.actor.handle}`;
              return (
                <li key={n.id}>
                  <Link
                    to={to}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-hover focus-ring"
                  >
                    <UserAvatar user={n.actor} size="sm" className="mt-0.5" />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
                        <Trans i18nKey={`notifications.${n.type}`} values={{ name: n.actor.displayName }} components={{ b: <b /> }} />
                      </span>
                      {n.postTitle && <span className="mt-0.5 line-clamp-1 block text-foreground">{n.postTitle}</span>}
                      <RelativeTime date={n.createdAt} className="mt-0.5 block text-xs text-faint" />
                    </span>
                    <span
                      className={cn('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
