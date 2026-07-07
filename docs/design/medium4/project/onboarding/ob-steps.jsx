// Onboarding wizard — happy path steps in v2 language. Each renders inside OShell.

const StepWelcome = () => (
  <OShell showProgress={false}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 26, marginTop: 8 }}>
      <svg width="60" height="60" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="11" fill="#1F5D86" /><path d="M11 27V13h2.4l4.1 7.6 4.1-7.6h2.4v14h-2.2v-9.5l-3.6 6.6h-1.4l-3.6-6.6V27H11Z" fill="#fff" /><circle cx="29.5" cy="13.5" r="1.8" fill="#7CC4A8" /></svg>
    </div>
    <OHeader title="Mirë se erdhe te Medium" sub="Asistenti yt që pret pacientët në WhatsApp dhe u rezervon takimet pa pasur nevojë t'i përgjigjesh çdo mesazhi. Të mbeten katër hapa." />
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
      {[
        { i: "user", t: "Profili yt", s: "Si do të të njohë pacienti", m: "~1 min" },
        { i: "phone", t: "Lidh WhatsApp", s: "Numri me të cilin pacientët bisedojnë", m: "~2 min" },
        { i: "calendar", t: "Disponueshmëria", s: "Orët kur Medium ofron takime", m: "~2 min" },
        { i: "sparkle", t: "Mëso Medium-in", s: "Çfarë shërbimesh dhe si t'u përgjigjet", m: "~2 min" },
      ].map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 2px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#eef0f4", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={s.i} size={15} color="#4b5563" /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 500, color: MT.ink }}>{s.t}</div><div style={{ fontSize: 12.5, color: MT.ink3 }}>{s.s}</div></div>
          <div style={{ fontSize: 12, color: MT.ink3, fontFamily: MT.mono }}>{s.m}</div>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 28 }}>
      <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 50, background: MT.brand, color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 15.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 2px rgba(15,20,32,0.1)" }}>Fillo<Icon name="arrowRight" size={16} color="#fff" /></button>
    </div>
  </OShell>
);

const StepProfile = () => (
  <OShell step={0}>
    <OHeader eyebrow="Hapi 1 nga 4" title="Pak detaje për ty" sub="Pacientët do t'i shohin këto në çdo bisedë me Medium." />
    <OField label="Emri i plotë"><OInput value="Dr. Valbona Hoxha" large /></OField>
    <OField label="Profesioni">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ORadio icon="user" title="Fizioterapist" sub="Vlerësime, seanca rehabilitimi" selected />
        <ORadio icon="users" title="Tjetër" sub="Estetikë, dentist, kozmetolog" />
      </div>
    </OField>
    <OField label="Klinika ose praktika" help="Përdoret në mesazhet e konfirmimit."><OInput value="Klinika Hoxha · Tiranë" /></OField>
    <OPrimary nextLabel="Vazhdo" />
  </OShell>
);

const StepHours = () => (
  <OShell step={2}>
    <OHeader eyebrow="Hapi 3 nga 4" title="Kur ofron takime?" sub="Medium do të rezervojë vetëm brenda këtij orari." />
    <OField label="Ditët dhe orët">
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <ODayRow name="E hënë" on />
        <ODayRow name="E martë" on />
        <ODayRow name="E mërkurë" on />
        <ODayRow name="E enjte" on />
        <ODayRow name="E premte" on from="09:00" to="14:00" />
        <ODayRow name="E shtunë" />
        <ODayRow name="E diel" />
      </div>
    </OField>
    <OField label="Kohëzgjatja e takimeve">
      <div style={{ display: "flex", gap: 8 }}>
        <ODurChip m={30} /><ODurChip m={45} sel /><ODurChip m={60} /><ODurChip m={90} />
      </div>
    </OField>
    <OPrimary back nextLabel="Vazhdo" />
  </OShell>
);

const StepServices = () => (
  <OShell step={3}>
    <OHeader eyebrow="Hapi 4 nga 4" title="Çfarë shërbimesh ofron?" sub="Medium do t'i përdorë si opsione kur pacientët kërkojnë takim." />
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <OServiceRow title="Vlerësim i parë" dur="45 min" selected />
      <OServiceRow title="Seancë vijuese" dur="30 min" selected />
      <OServiceRow title="Terapi manuale" dur="60 min" />
      <button style={{ padding: "13px 16px", border: `1px dashed ${MT.line}`, background: "transparent", borderRadius: 12, color: MT.brand, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: MT.sans }}><Icon name="plus" size={15} color={MT.brand} />Shto shërbim tjetër</button>
    </div>
    <OPrimary back nextLabel="Përfundo" />
  </OShell>
);

const StepDone = () => (
  <OShell step={3}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 24, marginTop: 8 }}>
      <div style={{ width: 68, height: 68, borderRadius: 999, background: MT.greenTint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={30} color={MT.greenInk} strokeWidth={2} /></div>
    </div>
    <OHeader title="U regjistrove." sub="Medium tashmë mund të pranojë rezervime në WhatsApp. Pacienti i parë që shkruan do të marrë përgjigje brenda sekondash." />
    <div style={{ ...oCard, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.ink3, marginBottom: 12, fontFamily: MT.mono }}>Pamje paraprake</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Avatar initials="M" size={30} dot={MT.sage} />
        <div style={{ background: MT.brandTint, color: MT.brandInk, padding: "10px 13px", borderRadius: 14, borderTopLeftRadius: 5, fontSize: 13.5, lineHeight: 1.5, maxWidth: "85%" }}>Mirëdita, jam Medium — asistenti i Dr. Hoxhës në Klinika Hoxha. Mund të rezervoj një vlerësim ose seancë vijuese. Si mund t'ju ndihmoj?</div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
      <button style={{ flex: 1, height: 48, background: "#fff", color: MT.ink, border: `1px solid ${MT.line}`, borderRadius: 12, fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: MT.sans }}>Konfiguro përsëri</button>
      <button style={{ flex: 1.4, height: 48, background: MT.brand, color: "#fff", border: "none", borderRadius: 12, fontSize: 14.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: MT.sans, boxShadow: "0 1px 2px rgba(15,20,32,0.1)" }}>Shko te paneli<Icon name="arrowRight" size={15} color="#fff" /></button>
    </div>
  </OShell>
);

Object.assign(window, { StepWelcome, StepProfile, StepHours, StepServices, StepDone });
