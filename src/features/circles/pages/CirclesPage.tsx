import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage, interestLabel } from '@/app/i18n';
import { useMotionPresets } from '@/app/motion';
import { ErrorState, ListSkeleton, PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { api, qk } from '@/lib/api';
import type { Circle } from '@/lib/api/contract';

export function useMembership() {
  const { t } = useTranslation('circles');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (circle: Circle) => api.circles.setMember(circle.id, !circle.viewer.isMember),
    onSuccess: (_, circle) => {
      if (!circle.viewer.isMember) toast.success(t('list.joined', { name: circle.name }));
      void queryClient.invalidateQueries({ queryKey: qk.circlesAll });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export default function CirclesPage() {
  const { t, i18n } = useTranslation('circles');
  const m = useMotionPresets();
  const circles = useQuery({ queryKey: qk.circles(), queryFn: () => api.circles.list() });
  const membership = useMembership();
  return (
    <>
      <PageHeader title={t('list.title')} description={t('list.description')} />
      {circles.isPending ? (
        <ListSkeleton />
      ) : circles.isError ? (
        <ErrorState error={circles.error} onRetry={() => void circles.refetch()} />
      ) : (
        <motion.ul {...m.list} className="grid gap-4 sm:grid-cols-2">
          {circles.data.map((circle) => (
            <motion.li key={circle.id} variants={m.item} className="relative flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {circle.interest && <p className="kicker mb-1.5">{interestLabel(circle.interest, i18n.language)}</p>}
                  <h2 className="text-lg font-semibold">
                    <Link to={`/c/${circle.slug}`} className="focus-ring rounded after:absolute after:inset-0">{circle.name}</Link>
                  </h2>
                </div>
                <Button
                  className="relative z-10"
                  size="sm"
                  variant={circle.viewer.isMember ? 'ghost' : 'outline'}
                  aria-pressed={circle.viewer.isMember}
                  onClick={() => membership.mutate(circle)}
                >
                  {circle.viewer.isMember ? t('list.leave') : t('list.join')}
                </Button>
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{i18n.language === 'en' ? circle.descriptionEn : circle.descriptionFr}</p>
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                {t('list.members', { count: circle.memberCount })} · {t('list.posts', { count: circle.postCount })}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </>
  );
}
