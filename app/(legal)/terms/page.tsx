import type { Metadata } from 'next';
import { LanguageSwitch, LegalSection } from '../legal-section';

export const metadata: Metadata = {
  title: 'Kushtet e shërbimit · Medium',
  description:
    'Kushtet për përdorimin e Medium, asistentit të takimeve në WhatsApp për praktikat.',
  alternates: {
    canonical: '/terms',
    // The Albanian version is canonical, so it is also the x-default.
    languages: {
      sq: '/terms',
      en: '/en/terms',
      'x-default': '/terms',
    },
  },
};

const updatedAt = '30 korrik 2026';

/** Canonical (Albanian) terms of service. `/en/terms` is the English reading
 * copy kept for Meta App Review — same sections, same order, so the two can be
 * diffed; edit both together. */
export default function TermsPage() {
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Përditësuar së fundi: {updatedAt}
        </p>
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Kushtet e shërbimit
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Këto kushte rregullojnë aksesin te Medium, një asistent takimesh që i
          ndihmon praktikat të menaxhojnë bisedat në WhatsApp, takimet, kujtesat
          dhe rrjedhat përkatëse të punës në panel.
        </p>
        <LanguageSwitch href="/en/terms" lang="en" label="English version" />
      </header>

      <LegalSection title="Kush mund ta përdorë Medium">
        <p>
          Medium është për praktikat dhe përdoruesit e biznesit, jo për përdorim
          vetëshërbimi nga konsumatorët apo pacientët. Ju duhet të keni të
          drejtën të veproni në emër të praktikës që regjistroni dhe të lidhni
          llogarinë WhatsApp Business që përdorni me Medium.
        </p>
      </LegalSection>

      <LegalSection title="Përgjegjësitë tuaja">
        <ul>
          <li>
            Të jepni të dhëna të sakta për llogarinë, praktikën, oraret dhe
            lidhjen me WhatsApp.
          </li>
          <li>
            Të mbani të sigurta kredencialet e hyrjes dhe të na njoftoni për
            akses të paautorizuar.
          </li>
          <li>
            Të merrni çdo leje të nevojshme nga pacientët për të komunikuar
            përmes WhatsApp-it.
          </li>
          <li>
            Të shqyrtoni takimet, bisedat, kujtesat dhe kalimet te njeriu për
            praktikën tuaj.
          </li>
          <li>
            Të respektoni ligjet e zbatueshme për privatësinë, kujdesin
            shëndetësor, konsumatorët dhe mesazhet.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="WhatsApp dhe shërbimet e palëve të treta">
        <p>
          Medium varet nga API-të e Meta WhatsApp Business, Supabase, Vercel,
          Inngest, OpenRouter, Anthropic, OpenAI dhe nga ofrues të tjerë
          infrastrukture. Përdorimi juaj i WhatsApp-it i nënshtrohet gjithashtu
          kushteve dhe politikave të Meta WhatsApp Business.
        </p>
        <p>
          Ne nuk jemi përgjegjës për ndërprerjet, vonesat në shqyrtim, kufizimet
          e llogarive, refuzimet e shablloneve, ndryshimet e API-ve apo
          ndryshimet e çmimeve nga ofruesit e palëve të treta.
        </p>
      </LegalSection>

      <LegalSection title="Inteligjenca artificiale dhe kufijtë klinikë">
        <p>
          Inteligjenca artificiale e Medium është ndërtuar vetëm për rrjedhat e
          caktimit të takimeve. Ajo nuk duhet përdorur për diagnozë, për
          këshilla mjekësore, për triazh urgjencash, për këshilla ligjore, për
          mosmarrëveshje faturimi apo për vendime sigurimesh.
        </p>
        <p>
          Ju mbeteni përgjegjës për mbikëqyrjen e asistentit, për të mbajtur të
          hapur një rrugë kalimi te njeriu dhe për të korrigjuar çdo informacion
          të pasaktë ose të paplotë për takimet.
        </p>
      </LegalSection>

      <LegalSection title="Të dhënat e pacientëve">
        <p>
          Për të dhënat e pacientëve, praktika është kontrolluesi dhe Medium
          është përpunuesi. Ju e udhëzoni Medium t&apos;i përpunojë të dhënat e
          pacientëve vetëm aq sa nevojitet për të ofruar asistentin e takimeve,
          panelin, kujtesat, mbështetjen, sigurinë, ruajtjen e të dhënave dhe
          funksionet e regjistrit të auditimit.
        </p>
      </LegalSection>

      <LegalSection title="Ndryshimet dhe disponueshmëria e shërbimit">
        <p>
          Medium është një shërbim në fazë të hershme. Funksionet mund të
          ndryshojnë, të pezullohen ose të hiqen ndërsa produkti përmirësohet
          ose ndërsa ndryshojnë kërkesat e platformave të palëve të treta.
          Synojmë ta mbajmë shërbimin të besueshëm, por nuk garantojmë
          disponueshmëri të pandërprerë.
        </p>
      </LegalSection>

      <LegalSection title="Përdorimi i pranueshëm">
        <ul>
          <li>
            Mos e përdorni Medium për mesazhe të padëshiruara (spam), për
            mesazhe mashtruese, për ngacmim ose për përmbajtje të paligjshme.
          </li>
          <li>
            Mos u përpiqni të anashkaloni izolimin mes praktikave, kufijtë e
            shpeshtësisë, vërtetimin e identitetit ose kontrollet e sigurisë.
          </li>
          <li>
            Mos ngarkoni programe keqdashëse dhe mos ndërhyni në funksionimin e
            shërbimit.
          </li>
          <li>
            Mos e përdorni Medium për vendime urgjence, diagnostikuese, ligjore,
            faturimi apo sigurimesh.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Planet dhe tarifat">
        <p>
          Medium ofron një plan falas dhe një plan me pagesë Solo. Plani Solo
          kushton 2.500 ALL në muaj ose 25.000 ALL në vit (dy muaj falas), me
          TVSH-në të përfshirë. Çmimet aktuale, periudhat e faturimit dhe
          kufijtë e planeve shfaqen në aplikacion dhe mund të ndryshojnë me
          njoftim. Ju jeni përgjegjës për çdo taksë shtesë ose tarifë të palëve
          të treta që zbatohet për përdorimin tuaj, përveç rasteve kur një
          marrëveshje me shkrim përcakton ndryshe.
        </p>
      </LegalSection>

      <LegalSection title="Periudhat e parapaguara dhe rinovimet">
        <p>
          Planet me pagesë parapaguhen për një periudhë fikse prej një muaji ose
          dymbëdhjetë muajsh. Ky version nuk ka abonim automatik të përsëritur
          dhe nuk tarifon vetë një metodë pagese të ruajtur — për të vazhduar
          pasi mbaron një periudhë, paguani sërish për një periudhë të re. Një
          plan i blerë vlen deri në fund të periudhës që keni paguar.
        </p>
      </LegalSection>

      <LegalSection title="Anulimi dhe rimbursimet">
        <p>
          Ju mund ta ndaloni përdorimin e një plani me pagesë në çdo kohë.
          Ndalimi nuk e rimburson periudhën aktuale; plani mbetet aktiv deri në
          fund të periudhës që keni paguar tashmë. Ky version nuk ofron
          rimbursime.
        </p>
      </LegalSection>

      <LegalSection title="Skadimi, toleranca dhe kalimi në planin falas">
        <p>
          Kur një periudhë me pagesë përfundon pa rinovim, një periudhë
          tolerance prej 3 ditësh i mban aktive përfitimet e planit Solo. Pas
          periudhës së tolerancës, llogaria kalon automatikisht në planin falas.
        </p>
        <p>
          Kalimi në planin falas nuk fshin asnjë të dhënë. Nëse llogaria ka më
          shumë shërbime aktive nga sa lejon plani falas, shërbimet përtej atij
          kufiri çaktivizohen; shërbimi aktiv më i vjetër mbetet dhe mund të
          zëvendësohet me një tjetër. Ruajtja e mesazheve kufizohet në
          maksimumin e planit falas pas një periudhe tjetër tolerance prej 30
          ditësh nga kalimi.
        </p>
      </LegalSection>

      <LegalSection title="Kufijtë e planit">
        <p>
          Çdo plan përfshin një kufi mujor për numrin e bisedave dhe për numrin
          e kujtesave. Kur përdorimi arrin 100% të një kufiri, asistenti ndalon
          dërgimin e përgjigjeve automatike, dërgon një mesazh të vetëm kalimi
          që i thotë pacientit se dikush do ta kontaktojë dhe e shënon bisedën
          për shqyrtim. Kutia hyrëse e vetë praktikës dhe përgjigjet manuale nuk
          bllokohen kurrë nga këta kufij.
        </p>
      </LegalSection>

      <LegalSection title="Pagesat">
        <p>
          Pagesat me kartë përpunohen nga POK (pokpay.io). Të dhënat e kartës
          futen te POK dhe nuk kalojnë e nuk ruhen kurrë nga Medium.
        </p>
      </LegalSection>

      <LegalSection title="Pezullimi dhe ndërprerja">
        <p>
          Ju mund ta ndaloni përdorimin e Medium në çdo kohë. Ne mund ta
          pezullojmë ose ta ndërpresim aksesin nëse shkelni këto kushte, nëse
          krijoni rrezik sigurie ose ligjor, nëse shkelni politikat e
          WhatsApp-it ose nëse e përdorni produktin në një mënyrë që mund të
          dëmtojë pacientët, praktikat, Medium ose platformat e palëve të treta.
        </p>
      </LegalSection>

      <LegalSection title="Përjashtimet e garancive dhe përgjegjësia">
        <p>
          Medium ofrohet ashtu siç është i disponueshëm dhe pa garanci, në masën
          më të plotë të lejuar nga ligji. Ne nuk jemi përgjegjës për dëme
          indirekte, aksidentale, të veçanta, pasuese, shembullore ose për
          humbje fitimi. Asgjë në këto kushte nuk e kufizon përgjegjësinë që nuk
          mund të kufizohet ligjërisht.
        </p>
      </LegalSection>

      <LegalSection title="Kontakt">
        <p>
          Pyetjet për këto kushte mund të dërgohen te klaididingu@gmail.com.
        </p>
      </LegalSection>
    </article>
  );
}
