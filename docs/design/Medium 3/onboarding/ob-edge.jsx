// Onboarding edge & input states — validation, empty, finalizing (loading).

// Profile with validation error (name required) — primary disabled
const ProfileError = () => (
  <OShell step={0}>
    <OHeader eyebrow="Hapi 1 nga 4" title="Pak detaje për ty" sub="Pacientët do t'i shohin këto në çdo bisedë me Medium." />
    <OField label="Emri i plotë" error="Emri është i detyrueshëm."><OInput value="" placeholder="p.sh. Dr. Valbona Hoxha" state="error" large /></OField>
    <OField label="Profesioni">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ORadio icon="user" title="Fizioterapist" sub="Vlerësime, seanca rehabilitimi" />
        <ORadio icon="users" title="Tjetër" sub="Estetikë, dentist, kozmetolog" />
      </div>
    </OField>
    <OField label="Klinika ose praktika" help="Përdoret në mesazhet e konfirmimit."><OInput value="" placeholder="Klinika Hoxha · Tiranë" /></OField>
    <OPrimary nextLabel="Vazhdo" disabled />
  </OShell>
);

// Services — nothing selected yet (empty / primary disabled)
const ServicesEmpty = () => (
  <OShell step={3}>
    <OHeader eyebrow="Hapi 4 nga 4" title="Çfarë shërbimesh ofron?" sub="Medium do t'i përdorë si opsione kur pacientët kërkojnë takim." />
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <OServiceRow title="Vlerësim i parë" dur="45 min" />
      <OServiceRow title="Seancë vijuese" dur="30 min" />
      <OServiceRow title="Terapi manuale" dur="60 min" />
      <button style={{ padding: "13px 16px", border: `1px dashed ${MT.line}`, background: "transparent", borderRadius: 12, color: MT.brand, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: MT.sans }}><Icon name="plus" size={15} color={MT.brand} />Shto shërbim tjetër</button>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "11px 14px", background: MT.brandTint, borderRadius: 12 }}>
      <Icon name="sparkle" size={16} color={MT.brand} /><span style={{ fontSize: 12.5, color: MT.brandInk, lineHeight: 1.4 }}>Zgjidh të paktën një shërbim që Medium të mund të rezervojë.</span>
    </div>
    <OPrimary back nextLabel="Përfundo" disabled />
  </OShell>
);

// Finalizing — last step processing (loading)
const Finalizing = () => (
  <OShell step={3}>
    <WAStatus tone="info" spin
      title="Po përfundon konfigurimin…"
      body="Po ruajmë orarin, shërbimet dhe po përgatisim asistentin tënd."
      detail={<div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {[["Profili", true], ["WhatsApp", true], ["Disponueshmëria", true], ["Shërbimet", false]].map(([t, done], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {done ? <Icon name="check" size={16} color={MT.green} strokeWidth={2.4} /> : <Spinner size={15} color={MT.brand} width={2} />}
            <span style={{ fontSize: 13.5, color: done ? MT.ink2 : MT.ink, fontWeight: done ? 400 : 500 }}>{t}</span>
          </div>
        ))}
      </div>} />
  </OShell>
);

Object.assign(window, { ProfileError, ServicesEmpty, Finalizing });
