import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useProfile } from '@/app/auth';
import { errorMessage } from '@/app/i18n';
import { LanguageSwitch, PageHeader, Section, ThemeToggle } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { Level } from '@/lib/api/contract';

export default function SettingsPage() {
  const { t } = useTranslation('profile');
  const { t: tc } = useTranslation();
  const profile = useProfile();
  const { refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ displayName: profile.displayName, handle: profile.handle, bio: profile.bio, level: profile.level });
  const save = useMutation({
    mutationFn: () => api.profiles.update(form),
    onSuccess: async () => {
      await refresh();
      toast.success(t('settings.saved'));
    },
    onError: (error) => toast.error((error as { code?: string }).code === 'conflict' ? t('settings.handleTaken') : errorMessage(error)),
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <PageHeader title={t('settings.title')} className="mb-0" />
      <Section title={t('settings.profile')}>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div>
            <Label htmlFor="s-name">{t('settings.displayName')}</Label>
            <Input id="s-name" className="mt-1.5" value={form.displayName} maxLength={60} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
          </div>
          <div>
            <Label htmlFor="s-handle">{t('settings.handle')}</Label>
            <Input id="s-handle" className="mt-1.5 font-mono" value={form.handle} maxLength={24} pattern="[a-z0-9_]{3,24}" aria-describedby="s-handle-hint" onChange={(event) => setForm({ ...form, handle: event.target.value.toLowerCase() })} />
            <p id="s-handle-hint" className="mt-1.5 text-xs text-muted-foreground">{t('settings.handleHint')}</p>
          </div>
          <div>
            <Label htmlFor="s-bio">{t('settings.bio')}</Label>
            <Textarea id="s-bio" className="mt-1.5" value={form.bio} maxLength={280} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
            <p className="mt-1 text-right font-mono text-xs text-muted-foreground">{form.bio.length}/280</p>
          </div>
          <div>
            <Label htmlFor="s-level">{t('settings.level')}</Label>
            <select id="s-level" className="focus-ring mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm touch:h-11" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as Level })}>
              {(['beginner', 'intermediate', 'senior'] as const).map((level) => <option key={level} value={level}>{tc(`levels.${level}`)}</option>)}
            </select>
          </div>
          <Button type="submit" className="self-start" loading={save.isPending}>{t('settings.save')}</Button>
        </form>
      </Section>
      <Section title={t('settings.appearance')}>
        <div className="flex flex-wrap items-center gap-6">
          <span className="flex items-center gap-2 text-sm">{t('settings.theme')} <ThemeToggle /></span>
          <span className="flex items-center gap-2 text-sm">{t('settings.language')} <LanguageSwitch /></span>
        </div>
      </Section>
      <Section title={t('settings.feed')}>
        <Button asChild variant="outline" className="self-start"><Link to="/feed?tune=1">{t('settings.tune')}</Link></Button>
      </Section>
      <Section title={t('settings.account')}>
        {profile.isGuest && <p className="text-sm text-muted-foreground">{t('settings.guest')}</p>}
        <Button variant="outline" className="self-start" onClick={() => void signOut().then(() => navigate('/'))}>{t('settings.signOut')}</Button>
      </Section>
    </div>
  );
}
