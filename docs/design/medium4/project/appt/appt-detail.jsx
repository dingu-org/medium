// Appointment detail sheet states — confirmed, pending, ended (complete/no-show), notes editing.

const DetailBody = ({ date, time, service, reminder, pendingChip, children }) => (
  <React.Fragment>
    <InfoCard>
      <div style={{ fontSize: 17, fontWeight: 600, color: MT.ink, fontFamily: MT.display, letterSpacing: "-0.015em" }}>{date}</div>
      <div style={{ fontSize: 14, color: MT.ink2, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{time}</div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 11 }}>
        <span style={{ fontSize: 13, color: MT.ink2 }}>{service}</span>
        {reminder && <RemBadge kind={reminder} />}
        {pendingChip}
      </div>
    </InfoCard>
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <QuickAct icon="phone" label="Telefono" />
      <QuickAct icon="wa" label="WhatsApp" />
      <QuickAct icon="message" label="Biseda" />
    </div>
    <div style={{ marginTop: 18 }}>
      <SLabel>Shënim privat</SLabel>
      {children}
    </div>
  </React.Fragment>
);

// confirmed, future appointment
const DetailConfirmed = () => (
  <SheetShell title="Anila Hoxha" titleRight={<CalPill status="confirmed" />}>
    <DetailBody date="E mërkurë, 6 maj" time="10:00–10:45" service="Konsultë e parë" reminder="confirmed">
      <STextArea placeholder="Shto një shënim privat…" />
    </DetailBody>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, paddingTop: 18, borderTop: `1px solid ${MT.sep}` }}>
      <ActBtn kind="secondary" icon="calendar">Ricakto</ActBtn>
      <ActBtn kind="dangerGhost" icon="x">Anulo takimin</ActBtn>
    </div>
  </SheetShell>
);

// pending — reminder still out
const DetailPending = () => (
  <SheetShell title="Endi Kola" titleRight={<CalPill status="pending" />}>
    <DetailBody date="E mërkurë, 6 maj" time="14:30–15:00" service="Takim vijues" reminder="pending">
      <STextArea placeholder="Shto një shënim privat…" />
    </DetailBody>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, paddingTop: 18, borderTop: `1px solid ${MT.sep}` }}>
      <ActBtn kind="secondary" icon="calendar">Ricakto</ActBtn>
      <ActBtn kind="dangerGhost" icon="x">Anulo takimin</ActBtn>
    </div>
  </SheetShell>
);

// ended — mark complete / no-show
const DetailEnded = () => (
  <SheetShell title="Genti Marku" titleRight={<CalPill status="confirmed" />}>
    <DetailBody date="Sot · ka mbaruar" time="11:30–12:30" service="Terapi manuale" reminder="sent">
      <div style={{ border: `1px solid ${MT.line}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: MT.ink, lineHeight: 1.5 }}>Pacienti preferon paradite. Dhimbje në shpatull.</div>
    </DetailBody>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, paddingTop: 18, borderTop: `1px solid ${MT.sep}` }}>
      <ActBtn kind="primary" icon="check">Shëno si të kryer</ActBtn>
      <ActBtn kind="secondary">Nuk erdhi</ActBtn>
      <ActBtn kind="dangerGhost" icon="x">Anulo takimin</ActBtn>
    </div>
  </SheetShell>
);

// notes being edited — save button appears
const DetailNotes = () => (
  <SheetShell title="Anila Hoxha" titleRight={<CalPill status="confirmed" />}>
    <DetailBody date="E mërkurë, 6 maj" time="10:00–10:45" service="Konsultë e parë" reminder="confirmed">
      <div style={{ minHeight: 64, padding: "11px 14px", border: `1px solid ${MT.brand}`, borderRadius: 10, background: "#fff", fontSize: 14, lineHeight: 1.5, color: MT.ink, boxShadow: "0 0 0 3px rgba(59,91,254,0.16)" }}>Sjell rezultatet e fundit të MRI-së.<span style={{ display: "inline-block", width: 2, height: 18, background: MT.brand, marginLeft: 2, verticalAlign: "text-bottom" }} /></div>
      <div style={{ marginTop: 10 }}><ActBtn kind="secondary" full={false}>Ruaj shënimin</ActBtn></div>
    </DetailBody>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, paddingTop: 18, borderTop: `1px solid ${MT.sep}` }}>
      <ActBtn kind="secondary" icon="calendar">Ricakto</ActBtn>
      <ActBtn kind="dangerGhost" icon="x">Anulo takimin</ActBtn>
    </div>
  </SheetShell>
);

Object.assign(window, { DetailConfirmed, DetailPending, DetailEnded, DetailNotes });
