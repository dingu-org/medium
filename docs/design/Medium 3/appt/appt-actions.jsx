// Reschedule & cancel sheets — picker / loading / empty / cancel-with-reason + mutation results.

const SheetBack = () => <button style={{ background: "transparent", border: "none", color: MT.ink2, fontSize: 14, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="chevronLeft" size={15} color={MT.ink2} />Mbrapa</button>;

const RESLOTS = [
  { day: "E enjte · 7 maj", slots: ["09:00", "09:45", "11:30", "15:00"] },
  { day: "E premte · 8 maj", slots: ["10:00", "10:45", "14:30"] },
  { day: "E hënë · 11 maj", slots: ["09:00", "11:00", "13:30", "16:00"] },
];

const Reschedule = () => (
  <SheetShell title="Zgjidh një orar të ri" titleRight={<SheetBack />}>
    <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
      {RESLOTS.map((d, i) => (
        <div key={i}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MT.ink, marginBottom: 10 }}>{d.day}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {d.slots.map((t, j) => <SlotChip key={j} t={t} sel={i === 0 && j === 2} />)}
          </div>
        </div>
      ))}
    </div>
  </SheetShell>
);

const RescheduleLoading = () => (
  <SheetShell title="Zgjidh një orar të ri" titleRight={<SheetBack />} maxH={420}>
    <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
      {[0, 1].map((i) => (
        <div key={i}>
          <Sk w="42%" h={12} style={{ marginBottom: 12 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[0, 1, 2, 3].map((j) => <Sk key={j} w={62} h={36} r={10} />)}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "6px 0", color: MT.ink3, fontSize: 13 }}><Spinner size={16} color={MT.brand} />Po ngarkohen oraret…</div>
    </div>
  </SheetShell>
);

const RescheduleEmpty = () => (
  <SheetShell title="Zgjidh një orar të ri" titleRight={<SheetBack />} maxH={420}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "20px 24px 8px" }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: "#eef1f5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon name="calendar" size={26} color="#9aa1ad" /></div>
      <div style={{ fontFamily: MT.display, fontSize: 16, fontWeight: 600, color: MT.ink, letterSpacing: "-0.01em" }}>Asnjë orar i lirë</div>
      <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 7, maxWidth: 250 }}>Nuk ka orare të lira në 14 ditët e ardhshme. Kontrollo disponueshmërinë.</div>
      <div style={{ marginTop: 16, width: "100%" }}><ActBtn kind="secondary" icon="clock">Shiko disponueshmërinë</ActBtn></div>
    </div>
  </SheetShell>
);

const Cancel = () => (
  <SheetShell title="Anulo takimin?" maxH={460}>
    <div style={{ fontSize: 14, color: MT.ink2, lineHeight: 1.5, marginBottom: 16 }}>Anila Hoxha · e mërkurë 10:00. Pacienti do të njoftohet menjëherë. Ky veprim s'kthehet.</div>
    <SLabel>Arsyeja (opsionale)</SLabel>
    <STextArea placeholder="p.sh. Mungesë e paparashikuar" />
    <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
      <div style={{ flex: 1 }}><ActBtn kind="secondary">Mbaje</ActBtn></div>
      <div style={{ flex: 1 }}><ActBtn kind="danger">Anulo takimin</ActBtn></div>
    </div>
  </SheetShell>
);

// mutation results — booked / rescheduled success toast, queued offline, sync failed
const ResultRescheduled = () => (
  <SheetShell title="Anila Hoxha" titleRight={<CalPill status="confirmed" />}
    toast={<Toast tone="success" icon="check" text="Takimi u ricaktua për të enjten 11:30." />}>
    <DetailBody date="E enjte, 7 maj" time="11:30–12:15" service="Konsultë e parë" reminder="pending">
      <STextArea placeholder="Shto një shënim privat…" />
    </DetailBody>
  </SheetShell>
);

const ResultQueued = () => (
  <SheetShell title="Endi Kola" titleRight={<CalPill status="pending" />}
    toast={<div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#1b2230", borderRadius: 12, boxShadow: "0 10px 30px -10px rgba(15,20,32,0.5)", width: "100%" }}><Icon name="clock" size={18} color="#fff" /><span style={{ flex: 1, fontSize: 13.5, color: "#fff", fontWeight: 500 }}>Ndryshimi u vendos në radhë. Do të sinkronizohet kur të lidhesh.</span></div>}>
    <DetailBody date="E mërkurë, 6 maj" time="14:30–15:00" service="Takim vijues" reminder="pending"
      pendingChip={<span style={{ flexShrink: 0, borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, fontFamily: MT.mono, border: "1px solid #f0e0bd", background: MT.amberTint, color: MT.amberInk }}>Zhvendosje në radhë</span>}>
      <STextArea placeholder="Shto një shënim privat…" />
    </DetailBody>
  </SheetShell>
);

const ResultFailed = () => (
  <SheetShell title="Endi Kola" titleRight={<CalPill status="pending" />}
    toast={<Toast tone="danger" icon="x" text="Sinkronizimi dështoi. Provo sërish." />}>
    <DetailBody date="E mërkurë, 6 maj" time="14:30–15:00" service="Takim vijues" reminder="pending"
      pendingChip={<span style={{ flexShrink: 0, borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, fontFamily: MT.mono, border: "1px solid #f0d0cf", background: MT.redTint, color: MT.redInk }}>Sinkronizimi dështoi</span>}>
      <STextArea placeholder="Shto një shënim privat…" />
    </DetailBody>
    <div style={{ marginTop: 16 }}><ActBtn kind="secondary" icon="arrowRight">Provo sërish</ActBtn></div>
  </SheetShell>
);

Object.assign(window, { Reschedule, RescheduleLoading, RescheduleEmpty, Cancel, ResultRescheduled, ResultQueued, ResultFailed });
