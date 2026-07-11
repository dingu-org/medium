import { PolicySection } from '../policy-section';

export const metadata = {
  title: 'Lidh WhatsApp-in · Ndihmë · Medium',
  description:
    'Si të lidhësh numrin tënd të WhatsApp Business me Medium përmes Embedded Signup.',
};

export default function HelpWhatsAppPage() {
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Lidh WhatsApp-in
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Numri yt i WhatsApp Business është mënyra si pacientët bisedojnë me
          Medium.
        </p>
      </header>

      <PolicySection title="Si të lidhesh">
        <p>
          Nga <strong>Cilësimet</strong>, shtyp butonin e gjelbër të
          WhatsApp-it. Hapet dritarja e{' '}
          <strong>Embedded Signup</strong> e Facebook-ut, ku zgjedh ose lidh
          numrin tënd të WhatsApp Business.
        </p>
      </PolicySection>

      <PolicySection title="Kërkohet HTTPS">
        <p>
          Lidhja funksionon vetëm mbi HTTPS — nuk hapet nga{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
            http://localhost
          </code>
          . Nëse po testosh lokalisht, përdor një adresë Vercel preview ose
          një tunel HTTPS (
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
            pnpm tunnel
          </code>
          ).
        </p>
      </PolicySection>

      <PolicySection title="Modaliteti coexistence">
        <p>
          Medium lidhet në modalitetin <strong>coexistence</strong>: numri yt
          vazhdon të punojë njëkohësisht edhe në aplikacionin WhatsApp
          Business që përdor tashmë.
        </p>
      </PolicySection>

      <PolicySection title="Pas lidhjes">
        <p>
          Kur signup-i mbaron, lidhja kalon në gjendjen <strong>aktive</strong>{' '}
          dhe pacientët mund të fillojnë të shkruajnë menjëherë. Modeli i
          kujtesës{' '}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">
            appointment_reminder_24h
          </code>{' '}
          dërgohet për miratim te Meta — miratimi mund të zgjasë 24–48 orë.
        </p>
      </PolicySection>

      <PolicySection title="Gabime të mundshme">
        <ul>
          <li>Numër i dyfishtë — numri është lidhur tashmë me një llogari tjetër.</li>
          <li>Refuzim nga Meta, me arsyet e listuara në panel.</li>
          <li>Dështim i shkëmbimit të tokenit — provo lidhjen përsëri.</li>
        </ul>
      </PolicySection>
    </article>
  );
}
