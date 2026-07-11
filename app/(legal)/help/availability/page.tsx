import { PolicySection } from '../policy-section';

export const metadata = {
  title: 'Cakto oraret e punës · Ndihmë · Medium',
  description:
    'Si të vendosësh orët javore dhe periudhat e bllokuara që asistenti t’i respektojë.',
};

export default function HelpAvailabilityPage() {
  return (
    <article lang="sq" className="space-y-10">
      <header className="space-y-3">
        <h1 className="font-heading text-3xl font-medium tracking-normal">
          Cakto oraret e punës
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Orari yt i disponueshmërisë tregon Medium-it kur mund të rezervojë
          takime.
        </p>
      </header>

      <PolicySection title="Orët javore">
        <p>
          Te <strong>Cilësimet → Oraret</strong> cakto orët e punës për çdo
          ditë të javës (p.sh. e hënë–e premte, 09:00–17:00). Asistenti nuk
          rezervon kurrë jashtë këtyre orëve.
        </p>
      </PolicySection>

      <PolicySection title="Periudha të bllokuara">
        <p>
          Shto periudha të bllokuara për pushime, festa ose çdo interval tjetër
          kur nuk pranon takime — asistenti do t&apos;i shmangë automatikisht
          këto periudha kur propozon orë të lira.
        </p>
      </PolicySection>

      <PolicySection title="Zona kohore">
        <p>
          Orët interpretohen sipas zonës kohore të praktikës tënde, të vendosur
          te profili. Sigurohu që zona kohore është e saktë përpara se të
          fillosh të pranosh rezervime.
        </p>
      </PolicySection>

      <PolicySection title="Shërbimet">
        <p>
          Kohëzgjatja e çdo shërbimi (te <strong>Cilësimet → Shërbimet</strong>
          ) përcakton sa gjatë zgjat një takim në kalendar — cakto shërbimet
          përpara se t&apos;i lësh asistentit rezervimet.
        </p>
      </PolicySection>
    </article>
  );
}
