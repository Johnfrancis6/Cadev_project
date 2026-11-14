import { Hammer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, PageHeader } from '@/components/shared';

/** Stub — replaced by the search feature. Rendered inside the app shell's <main>. */
export default function SearchPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('titles.search')} />
      <EmptyState icon={Hammer} title={t('app.comingSoon')} description={t('app.comingSoonHint')} />
    </>
  );
}
