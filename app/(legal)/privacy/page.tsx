import type { Metadata } from 'next';
import { disclosedAiProviderNames } from './ai-providers';
import { LanguageSwitch, LegalSection } from '../legal-section';

export const metadata: Metadata = {
  title: 'Politika e privatësisë · Medium',
  description:
    'Si i trajton Medium të dhënat e llogarisë, të pacientëve, të WhatsApp-it dhe të takimeve.',
  alternates: {
    canonical: '/privacy',
    languages: { sq: '/privacy', en: '/en/privacy' },
  },
};

const updatedAt = '30 korrik 2026';

/** Canonical (Albanian) privacy policy. `/en/privacy` is the English reading
 * copy kept for Meta App Review — same sections, same order, so the two can be
 * diffed; edit both together. */
export default function PrivacyPolicyPage() {
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Përditësuar së fundi: {updatedAt}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Politika e privatësisë
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Medium i ndihmon fizioterapistët të menaxhojnë bisedat me pacientët
          dhe takimet përmes WhatsApp-it. Kjo politikë shpjegon cilat të dhëna
          përpunojmë, pse i përpunojmë dhe si trajtohen kërkesat për privatësi.
        </p>
        <LanguageSwitch href="/en/privacy" lang="en" label="English version" />
      </header>

      <LegalSection title="Rolet">
        <p>
          Çdo fizioterapist ose praktikë që përdor Medium është kontrolluesi i
          të dhënave të pacientëve të vet. Medium vepron si përpunues dhe i
          trajton ato të dhëna sipas udhëzimeve të praktikës.
        </p>
        <p>
          Për të dhënat e llogarisë së pronarit të praktikës, Medium vepron si
          kontrollues, që të mund ta ofrojë, ta sigurojë dhe ta mbështesë
          shërbimin.
        </p>
      </LegalSection>

      <LegalSection title="Të dhënat që përpunojmë">
        <ul>
          <li>
            Të dhëna të llogarisë, si adresa e email-it, emri i praktikës, zona
            kohore dhe cilësimet e produktit.
          </li>
          <li>
            Të dhëna të lidhjes me WhatsApp, si identifikuesit e numrit të
            telefonit, identifikuesit e llogarisë WhatsApp Business, tokenat e
            enkriptuar të aksesit, statusi i cilësisë dhe statusi i shablloneve.
          </li>
          <li>
            Të dhëna të pacientëve dhe të takimeve, si emrat, numrat e
            telefonit, bisedat, mesazhet, orët e takimeve, statusi i takimeve,
            shënimet dhe përgjigjet ndaj kujtesave.
          </li>
          <li>
            Të dhëna të PWA-së dhe të pajisjes, si adresat e abonimit për
            njoftime, gjendja e service worker-it dhe të dhënat e panelit të
            ruajtura lokalisht për akses jashtë linje.
          </li>
          <li>
            Të dhëna të faturimit dhe të abonimit, si plani i zgjedhur, periudha
            e faturimit, datat e skadimit dhe të rinovimit, statusi i pagesës,
            identifikuesit e porosive POK, shumat dhe faturat. Medium nuk ruan
            numra kartash, kode CVV apo të dhëna të tjera të mbajtësit të kartës
            — ato trajtohen drejtpërdrejt nga POK.
          </li>
          <li>
            Të dhëna operacionale, si regjistrat e auditimit, regjistrat e
            sigurisë, të dhënat e idempotencës, statusi i dërgesave dhe metrikat
            e përgjithshme të produktit.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Si i përdorim të dhënat">
        <ul>
          <li>
            Për të vërtetuar përdoruesit dhe për t&apos;i mbajtur të ndara të
            dhënat e çdo praktike.
          </li>
          <li>
            Për të marrë, për të dërguar dhe për të shfaqur bisedat në WhatsApp.
          </li>
          <li>
            Për të rezervuar, për të ricaktuar, për të anuluar, për të kujtuar
            dhe për të konfirmuar takimet.
          </li>
          <li>
            Për t&apos;i mundësuar praktikës të shohë bisedat, të marrë përsipër
            bisedën dhe të menaxhojë oraret.
          </li>
          <li>
            Për të kryer caktimin e takimeve me ndihmën e inteligjencës
            artificiale dhe për t&apos;ia kaluar bisedën një njeriu kur duhet.
          </li>
          <li>
            Për të siguruar shërbimin, për të zbuluar defektet, për të
            parandaluar përpunimin e dyfishtë dhe për të mbajtur regjistrat e
            auditimit.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Përpunimi me inteligjencë artificiale">
        <p>
          Kërkesat e inteligjencës artificiale në prodhim kalojnë përmes
          OpenRouter te {disclosedAiProviderNames()} për përgjigjet që lidhen me
          caktimin e takimeve, dhe secili prej tyre mund t&apos;i shërbejë një
          kërkese të dhënë. Aplikacioni dërgon vetëm bisedën dhe kontekstin e
          takimeve që nevojiten për t&apos;i përgjigjur pacientit. Inteligjenca
          artificiale është e udhëzuar të mos diagnostikojë, të mos japë
          këshilla mjekësore, të mos trajtojë urgjencat dhe të mos diskutojë
          çështje ligjore, faturimi apo sigurimesh.
        </p>
        <p>
          Kërkesat në prodhim përdorin kontrolle privatësie që kërkojnë
          mosruajtje të të dhënave dhe ndalojnë mbledhjen e të dhënave nga
          ofruesit atje ku kjo mbështetet. OpenRouter mund të ruajë metadata të
          kërkesave, dhe përpunimi me inteligjencë artificiale mund të përfshijë
          infrastrukturë jashtë Zonës Ekonomike Evropiane.
        </p>
      </LegalSection>

      <LegalSection title="Pagesat">
        <p>
          POK (pokpay.io) përpunon pagesat me kartë për planet me pagesë. Të
          dhënat e kartës futen te POK dhe nuk merren e nuk ruhen kurrë nga
          Medium. Medium ruan vetëm referencën e porosisë, shumën, monedhën,
          statusin dhe periudhën e kthyer nga POK — informacionin e nevojshëm
          për të aktivizuar ose për të rinovuar planin dhe për të shfaqur
          faturat.
        </p>
      </LegalSection>

      <LegalSection title="Nënpërpunuesit">
        <p>
          Medium mbështetet te një grup i vogël ofruesish shërbimi për ta
          mbajtur produktin në punë:
        </p>
        <ul>
          <li>
            Supabase për Postgres, për vërtetimin e identitetit dhe për të
            dhënat në kohë reale.
          </li>
          <li>
            Vercel për strehimin e aplikacionit Next.js dhe të funksioneve në
            server.
          </li>
          <li>
            Inngest për punët në sfond, për ripërpjekjet dhe për kujtesat e
            planifikuara.
          </li>
          <li>
            Meta dhe WhatsApp për dërgimin e mesazheve dhe për integrimin me
            llogarinë WhatsApp Business.
          </li>
          <li>
            OpenRouter, me {disclosedAiProviderNames()} si ofruesit e modeleve
            në rrjedhën e sipërme, për inferencën e inteligjencës artificiale në
            prodhim.
          </li>
          <li>
            POK (pokpay.io), i operuar nga Nebula, si përpunuesi i pagesave me
            kartë.
          </li>
        </ul>
        <p>Ne nuk i shesim të dhënat personale.</p>
      </LegalSection>

      <LegalSection title="Ruajtja e të dhënave">
        <p>
          Ruajtja e mesazheve kontrollohet nga secila praktikë. Periudha e
          parazgjedhur e ruajtjes është 90 ditë, dhe mesazhet më të vjetra
          fshihen nga një punë e planifikuar. Të dhënat e takimeve, të
          pacientëve, të llogarisë dhe të auditimit ruhen për aq kohë sa
          nevojiten për të ofruar shërbimin, për të përmbushur detyrimet
          ligjore, për të zgjidhur mosmarrëveshjet dhe për të ruajtur sigurinë.
          Metrikat e përgjithshme dhe të anonimizuara mund të ruhen pa afat.
        </p>
      </LegalSection>

      <LegalSection title="Siguria">
        <p>
          Medium përdor rregulla të bazës së të dhënave të kufizuara për çdo
          praktikë, TLS gjatë transmetimit, tokena të enkriptuar aksesi për
          WhatsApp, regjistrim auditimi për aksesin te të dhënat e pacientëve
          dhe rrugë aplikacioni me privilegjet më të vogla të nevojshme. Të
          dhënat kryesore të aplikacionit strehohen në infrastrukturë në rajonin
          e BE-së atje ku kjo është e mundur.
        </p>
      </LegalSection>

      <LegalSection title="Zgjedhjet dhe të drejtat tuaja">
        <p>
          Praktikat mund t&apos;i përditësojnë cilësimet e llogarisë dhe të
          ruajtjes në panel. Pacientët duhet të kontaktojnë fillimisht praktikën
          e tyre për kërkesa aksesi, korrigjimi, fshirjeje ose kundërshtimi,
          sepse praktika e kontrollon marrëdhënien me pacientin.
        </p>
        <p>
          Kërkesat për privatësi mund të dërgohen edhe te klaididingu@gmail.com.
          Gjatë aksesit të hershëm, kërkesat për eksport dhe fshirje mund të
          trajtohen manualisht derisa të përfundojnë rrjedhat përkatëse në
          produkt.
        </p>
      </LegalSection>

      <LegalSection title="Cookies dhe ruajtja lokale">
        <p>
          Medium përdor cookie vërtetimi, ruajtje nga service worker-i,
          IndexedDB dhe ruajtje në shfletues, të nevojshme për t&apos;i mbajtur
          përdoruesit të identifikuar, për të mbështetur aksesin jashtë linje te
          paneli, për të vendosur në radhë ndryshimet jashtë linje dhe për të
          kujtuar gjendjen e PWA-së. MVP-ja aktuale nuk përdor cookie analitike
          apo marketingu të palëve të treta në faqet publike përpara pëlqimit.
        </p>
      </LegalSection>
    </article>
  );
}
