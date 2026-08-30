import { PolicySection } from '../policy-section';

export const metadata = {
  title: 'Si i rezervon takimet asistenti · Ndihmë · Medium',
  description:
    'Si komunikon asistenti i Medium me pacientët dhe si i rezervon, ricakton ose anulon takimet.',
};

export default function HelpAiBookingsPage() {
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Si i rezervon takimet asistenti
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Asistenti i Medium bisedon me pacientët tuaj në WhatsApp dhe
          menaxhon rezervimet brenda kufijve që ju vendosni.
        </p>
      </header>

      <PolicySection title="Si komunikon">
        <p>
          Asistenti i përgjigjet pacientit në shqip formal (Ju), me ton të
          qetë dhe të drejtpërdrejtë. Nëse pyetet, thotë hapur që është
          automatik.
        </p>
      </PolicySection>

      <PolicySection title="Si rezervon">
        <p>
          Kur pacienti kërkon një takim, asistenti kontrollon disponueshmërinë
          tuaj dhe propozon 3–5 orë të lira në 2–3 ditë. Pasi pacienti
          konfirmon datën, orën dhe shërbimin, asistenti e rezervon takimin.
        </p>
      </PolicySection>

      <PolicySection title="Ricaktim dhe anulim">
        <p>
          Asistenti mund të ricaktojë ose anulojë një takim ekzistues me
          kërkesë të pacientit, brenda po atyre kufijve të disponueshmërisë.
        </p>
      </PolicySection>

      <PolicySection title="Kur ia kalon një njeriu">
        <p>
          Asistenti ia kalon bisedën juve kur pacienti kërkon të flasë me një
          person, kur kërkesa del jashtë planifikimit të takimeve, ose kur
          përmenden simptoma urgjente — në këto raste nuk vazhdon vetë
          planifikimin.
        </p>
      </PolicySection>

      <PolicySection title="Dritarja 24-orëshe">
        <p>
          WhatsApp-i lejon përgjigje të lira vetëm brenda 24 orëve nga mesazhi
          i fundit i pacientit. Brenda kësaj dritareje asistenti përgjigjet
          normalisht. Pasi ajo mbyllet, biseda nuk mund të rihapet nga Medium —
          pacienti duhet të shkruajë sërish, dhe dritarja hapet përsëri për 24
          orë.
        </p>
      </PolicySection>
    </article>
  );
}
