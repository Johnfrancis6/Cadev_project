import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage, interestLabel } from '@/app/i18n';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api, qk } from '@/lib/api';
import type { UserInterest } from '@/lib/api/contract';

export function TuneSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation('feed');
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: qk.myInterests(), queryFn: () => api.interests.mine(), enabled: open });
  const all = useQuery({ queryKey: qk.interests(), queryFn: () => api.interests.list(), enabled: open, staleTime: Infinity });
  const [isDesktop, setIsDesktop] = React.useState(() => window.matchMedia('(min-width: 640px)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.myInterests() });
    void queryClient.invalidateQueries({ queryKey: qk.feedAll });
  };
  const change = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const followed = new Set((mine.data ?? []).map((row) => row.interest.id));
  const addable = (all.data ?? []).filter((interest) => !followed.has(interest.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isDesktop ? 'right' : 'bottom'} className="flex max-h-[88dvh] flex-col gap-0 overflow-y-auto sm:max-h-none sm:w-[26rem]">
        <SheetHeader>
          <SheetTitle>{t('tune.title')}</SheetTitle>
          <SheetDescription>{t('tune.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 rounded-lg border border-border-soft bg-surface-soft p-3.5">
          <p className="kicker mb-1.5">{t('tune.howTitle')}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{t('tune.how')}</p>
        </div>

        <h3 className="mt-6 mb-2 text-sm font-semibold">{t('tune.interestsTitle')}</h3>
        {mine.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (mine.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('tune.empty')} {t('tune.emptyHint')}
          </p>
        ) : (
          <ul className="divide-y divide-border-soft">
            {(mine.data ?? []).map((row) => (
              <InterestRow
                key={row.interest.id}
                row={row}
                lang={i18n.language}
                onWeight={(weight) => change.mutate(() => api.interests.setWeight(row.interest.id, weight))}
                onMuted={(muted) => change.mutate(() => api.interests.setMuted(row.interest.id, muted))}
              />
            ))}
          </ul>
        )}

        {addable.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-sm font-semibold">{t('tune.add')}</h3>
            <ul className="flex flex-wrap gap-2">
              {addable.map((interest) => {
                const label = interestLabel(interest, i18n.language);
                return (
                  <li key={interest.id}>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t('tune.addOne', { topic: label })}
                      onClick={() =>
                        change.mutate(async () => {
                          await api.interests.setWeight(interest.id, 0.5);
                          toast.success(t('tune.added', { topic: label }));
                        })
                      }
                    >
                      <Plus aria-hidden="true" />
                      {label}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-8 border-t border-border-soft pt-4">
          <Button
            variant="ghost"
            onClick={() =>
              change.mutate(async () => {
                await api.interests.resetLearning();
                toast.success(t('tune.resetDone'));
              })
            }
          >
            <RotateCcw aria-hidden="true" />
            {t('tune.reset')}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{t('tune.resetHint')}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InterestRow({ row, lang, onWeight, onMuted }: { row: UserInterest; lang: string; onWeight: (w: number) => void; onMuted: (m: boolean) => void }) {
  const { t } = useTranslation('feed');
  const label = interestLabel(row.interest, lang);
  const [value, setValue] = React.useState(Math.round(row.weight * 100));
  React.useEffect(() => setValue(Math.round(row.weight * 100)), [row.weight]);
  const switchId = React.useId();
  return (
    <li className="py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {t(`tune.source.${row.source}`)}
            {row.recentOpens > 0 && ` · ${t('tune.recentOpens', { count: row.recentOpens })}`}
          </p>
        </div>
        <span className="font-mono text-xs tabular text-muted-foreground" aria-hidden="true">
          {row.muted ? t('tune.muted') : t('tune.weightValue', { percent: value })}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-4">
        <Slider
          className="flex-1"
          min={0}
          max={100}
          step={5}
          value={[value]}
          disabled={row.muted}
          thumbLabels={[t('tune.weight', { topic: label })]}
          onValueChange={([next]) => setValue(next)}
          onValueCommit={([next]) => onWeight(next / 100)}
        />
        <label htmlFor={switchId} className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('tune.mute')}
          <Switch id={switchId} checked={row.muted} onCheckedChange={onMuted} aria-label={t('tune.muteLabel', { topic: label })} />
        </label>
      </div>
    </li>
  );
}
