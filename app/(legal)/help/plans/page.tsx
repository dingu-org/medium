import { PolicySection } from '../policy-section';
import { PLANS } from '@/lib/billing/plans';
import { formatLek } from '@/lib/i18n';
import { remindersEnabled } from '@/lib/reminders/flag';

export const metadata = {
  title: 'Planet dhe pagesat · Ndihmë · Medium',
  description:
    'Çfarë përfshijnë planet Falas dhe Solo, si maten bisedat, dhe si kalon te Solo.',
};

const { free, solo } = PLANS;

export default function HelpPlansPage() {
  // Reminders are parked (lib/reminders/flag.ts). `remindersPerMonth` stays in
  // PLANS as dormant config, but this page is the public explanation of what a
  // plan buys — while the feature is off it must not list an allowance for it,
  // nor describe how an allowance nobody can spend is metered.
  const showReminders = remindersEnabled();
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Planet dhe pagesat
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Medium ka dy plane: Falas për të nisur dhe Solo për praktikat me më
          shumë biseda. Këtu shpjegohet çfarë përfshin secili, si maten kufijtë
          dhe si kalon nga njëri te tjetri.
        </p>
      </header>

      <PolicySection title="Çfarë përfshin Falas">
        <p>Plani Falas është pa pagesë dhe të lejon:</p>
        <ul>
          <li>{free.conversationsPerMonth} biseda në muaj;</li>
          {showReminders && <li>{free.remindersPerMonth} kujtesa në muaj;</li>}
          <li>1 shërbim aktiv;</li>
          <li>ruajtje të bisedave deri në 30 ditë.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Çfarë përfshin Solo">
        <p>Plani Solo i ngre kufijtë dhe shton personalizimin:</p>
        <ul>
          <li>{solo.conversationsPerMonth} biseda në muaj;</li>
          {showReminders && <li>{solo.remindersPerMonth} kujtesa në muaj;</li>}
          <li>shërbime të pakufizuara;</li>
          <li>personalizim i asistentit (emri dhe përshëndetja);</li>
          <li>ruajtje të bisedave deri në 1 vit.</li>
        </ul>
        {solo.price && (
          <p>
            Solo kushton {formatLek(solo.price.monthly)} ALL në muaj ose{' '}
            {formatLek(solo.price.yearly)} ALL në vit (2 muaj falas). Çmimet
            përfshijnë TVSH-në.
          </p>
        )}
      </PolicySection>

      <PolicySection title="Si maten bisedat">
        <p>
          Një “bisedë” është një pacient që të shkruan brenda një dite —
          numërohet vetëm një herë në ditë për të njëjtin pacient, sipas zonës
          kohore të praktikës tënde. Nuk ka rëndësi sa mesazhe shkëmbeni atë
          ditë.
        </p>
        {showReminders ? (
          <p>
            Kujtesat numërohen veç dhe vetëm kur dërgohen te pacienti. Të dyja
            numëratoret nisin nga zero në fillim të çdo muaji.
          </p>
        ) : (
          <p>Numëratori niset nga zero në fillim të çdo muaji.</p>
        )}
      </PolicySection>

      <PolicySection title="Kur arrin kufirin">
        <p>
          Kur mbaron kufiri mujor, asistenti ndalon vetëm përgjigjet automatike.
          Pacientit i dërgohet një mesazh i vetëm që dikush nga praktika do t’i
          përgjigjet, dhe biseda shënohet që ta shohësh.
        </p>
        <p>
          Inbox-i yt dhe përgjigjet që shkruan vetë nuk bllokohen kurrë — kufiri
          prek vetëm automatizimin, jo mundësinë tënde për të komunikuar.
        </p>
      </PolicySection>

      <PolicySection title="Si të kalosh te Solo">
        <p>
          Kalimi te Solo bëhet te{' '}
          <strong>Cilësimet → Plani &amp; pagesat</strong>: zgjidh planin Solo
          dhe periudhën që të përshtatet — mujore ose vjetore.
        </p>
        <p>
          Hapi i pagesës po shtohet ende. Për momentin do të shohësh njoftimin{' '}
          <strong>“Pagesat vijnë së shpejti”</strong>; sapo të aktivizohet, do
          të mund ta përfundosh pagesën direkt aty dhe Solo aktivizohet
          menjëherë.
        </p>
      </PolicySection>

      <PolicySection title="Periudhat e parapaguara">
        <p>
          Solo paguhet paraprakisht për 1 muaj ose për 12 muaj. Në këtë version
          nuk ka rinovim automatik: kur mbaron periudha, paguan sërish nëse do
          të vazhdosh. Plani mbetet aktiv deri në fund të periudhës që ke
          paguar.
        </p>
      </PolicySection>

      <PolicySection title="Nëse plani skadon">
        <p>
          Nëse periudha mbaron pa e rinovuar, ke 3 ditë afat gjatë të cilave
          përfitimet e Solo-s vazhdojnë të vlejnë. Pas kësaj kthehesh vetvetiu
          te plani Falas. Asgjë nuk fshihet gjatë këtij afati.
        </p>
      </PolicySection>

      <PolicySection title="Kur kthehesh te Falas">
        <p>
          Kur kthehesh te Falas, nuk fshihet asnjë e dhënë. Nëse ke më shumë se
          një shërbim aktiv, shërbimet mbi kufirin çaktivizohen — më i vjetri
          mbetet aktiv dhe mund ta ndërrosh me një tjetër kur të duash.
        </p>
        <p>
          Ruajtja e bisedave shkurtohet te kufiri i planit Falas (30 ditë) vetëm
          pas një afati prej 30 ditësh nga kthimi, që të kesh kohë të rikalosh
          te Solo pa humbur asgjë.
        </p>
      </PolicySection>

      <PolicySection title="Rimbursimet">
        <p>
          Në këtë version nuk ka rimbursime. Nëse ndal, plani mbetet aktiv deri
          në fund të periudhës që ke paguar dhe nuk paguan më pas.
        </p>
      </PolicySection>
    </article>
  );
}
