import Link from 'next/link';

export const metadata = {
  title: 'Ndihmë · Medium',
  description:
    'Udhëzime të shkurtra për të lidhur WhatsApp-in, caktuar oraret, kuptuar si rezervon takime asistenti i Medium dhe njohur planet e pagesat.',
};

const guides = [
  {
    href: '/help/whatsapp',
    title: 'Lidh WhatsApp-in',
    description: 'Si të lidhësh numrin tënd të WhatsApp Business me Medium.',
  },
  {
    href: '/help/availability',
    title: 'Cakto oraret e punës',
    description:
      'Si të vendosësh orët javore dhe periudhat e bllokuara për praktikën tënde.',
  },
  {
    href: '/help/ai-bookings',
    title: 'Si i rezervon takimet asistenti',
    description:
      'Si komunikon asistenti me pacientët dhe kur ia kalon bisedën një njeriu.',
  },
  {
    href: '/help/plans',
    title: 'Planet dhe pagesat',
    description:
      'Çfarë përfshijnë Falas dhe Solo, si maten kufijtë dhe si kalon te Solo.',
  },
] as const;

export default function HelpIndexPage() {
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Ndihmë
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Katër udhëzues të shkurtër për t&apos;u nisur me Medium.
        </p>
      </header>

      <ul className="space-y-4">
        {guides.map((guide) => (
          <li key={guide.href}>
            <Link
              href={guide.href}
              className="hover:border-foreground/30 block rounded-md border p-4 transition-colors"
            >
              <p className="font-heading text-base font-medium">
                {guide.title}
              </p>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {guide.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
