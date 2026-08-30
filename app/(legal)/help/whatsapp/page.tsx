import { PolicySection } from '../policy-section';

export const metadata = {
  title: 'Lidh WhatsApp-in · Ndihmë · Medium',
  description:
    'Si të lidhësh numrin tënd të WhatsApp Business me Medium në pak minuta.',
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
          Medium. Lidhja zgjat vetëm pak minuta.
        </p>
      </header>

      <PolicySection title="Si të lidhesh">
        <p>
          Nga <strong>Cilësimet</strong>, shtyp butonin e gjelbër të
          WhatsApp-it. Hapet një dritare e sigurt e Facebook-ut (Meta), ku
          identifikohesh me llogarinë tënde të biznesit dhe zgjedh numrin që
          do të lidhësh. Ndiq hapat në ekran deri në fund — kur dritarja
          mbyllet, statusi te Cilësimet bëhet <strong>aktiv</strong>.
        </p>
      </PolicySection>

      <PolicySection title="Numri vazhdon të punojë në telefonin tënd">
        <p>
          Pas lidhjes, aplikacioni WhatsApp Business në telefonin tënd vazhdon
          të punojë si më parë — asgjë nuk fshihet dhe nuk bllokohet. Nëse i
          përgjigjesh vetë një pacienti nga telefoni, asistenti tërhiqet nga
          ajo bisedë për rreth dy orë, që të mos flisni njëkohësisht.
        </p>
      </PolicySection>

      <PolicySection title="Pas lidhjes">
        <p>
          Nuk ka asgjë tjetër për të pritur. Pacientët mund të të shkruajnë
          menjëherë dhe asistenti u përgjigjet.
        </p>
      </PolicySection>

      <PolicySection title="Nëse lidhja nuk funksionon">
        <ul>
          <li>
            Nëse numri është i lidhur tashmë me një llogari tjetër, Meta nuk e
            lejon lidhjen e dytë — na shkruaj që ta zgjidhim bashkë.
          </li>
          <li>
            Nëse dritarja mbyllet me gabim, mbylle dhe provo edhe një herë nga
            fillimi — zakonisht hera e dytë funksionon.
          </li>
          <li>
            Statusin e lidhjes e sheh gjithmonë te <strong>Cilësimet</strong>;
            aty shfaqet edhe arsyeja nëse diçka ka shkuar keq.
          </li>
        </ul>
      </PolicySection>
    </article>
  );
}
