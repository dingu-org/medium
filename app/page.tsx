import { redirect } from 'next/navigation';
import { LandingPage } from '@/app/_landing/landing-page';
import { createServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Medium — asistenti që rezervon takime në WhatsApp',
  description:
    'Medium bisedon me pacientët tuaj në WhatsApp, cakton takime dhe i mban orët tuaja të mbushura — ndërsa ju qëndroni në kontroll.',
};

export default async function Home() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/today');

  return <LandingPage />;
}
