import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { getServices } from '@/lib/services/queries';
import { createServerClient } from '@/lib/supabase/server';
import { ServicesEditor } from './services-editor';

export const metadata = { title: `${t.settings.servicesTitle} · Medium` };

export default async function ServicesPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const services = await getServices(user.id);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Button asChild size="icon-sm" variant="ghost">
          <Link href="/settings" aria-label={t.availability.backToSettings}>
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold">{t.settings.servicesTitle}</h1>
          <p className="text-muted-foreground text-sm">
            {t.settings.servicesIntro}
          </p>
        </div>
      </header>
      <ServicesEditor services={services} />
    </div>
  );
}
