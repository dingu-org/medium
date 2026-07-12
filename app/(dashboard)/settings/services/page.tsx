import { redirect } from 'next/navigation';
import { NavBar } from '@/components/dashboard/nav-bar';
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
    <>
      <NavBar title={t.settings.servicesTitle} backHref="/settings" />
      <ServicesEditor services={services} />
    </>
  );
}
