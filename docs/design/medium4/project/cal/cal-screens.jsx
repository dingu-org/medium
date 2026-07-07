// Calendar views — day, week, month, empty, loading — plus appointment status-variant agenda.

const DAY_APPTS = [
  { time: "10:00", duration: "45 min", name: "Anila Hoxha", service: "Konsultë e parë", status: "confirmed" },
  { time: "14:30", duration: "30 min", name: "Endi Kola", service: "Takim vijues", status: "pending" },
];

const CalDay = () => (
  <Screen>
    <CalHeader view="week" strip={<WeekStrip sel={6} />} />
    <Body pad="18px 16px 24px">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px 12px", whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: MT.ink }}>2 takime</span>
        <span style={{ fontSize: 13.5, color: MT.ink3 }}>· 09:00–17:00 i lirë</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {DAY_APPTS.map((a, i) => <ApptCard key={i} a={a} />)}
      </div>
      <div style={{ textAlign: "center", fontSize: 12.5, color: MT.ink3, padding: "22px 24px 0", lineHeight: 1.5 }}>Pjesa tjetër e ditës është e lirë.<br />Medium do t'u përgjigjet kërkesave të reja.</div>
    </Body>
    <Fab />
    <Tabs active="calendar" />
  </Screen>
);

const DAY = (label, today, appts) => ({ label, today, appts });
const WEEK_DATA = [
  DAY("E hënë · 4 maj", false, [{ time: "11:00", name: "Genti Marku", service: "Terapi manuale", status: "completed" }]),
  DAY("E martë · 5 maj", false, []),
  DAY("E mërkurë · 6 maj", true, [
    { time: "10:00", name: "Anila Hoxha", service: "Konsultë e parë", status: "confirmed" },
    { time: "14:30", name: "Endi Kola", service: "Takim vijues", status: "pending" },
  ]),
  DAY("E enjte · 7 maj", false, [{ time: "09:30", name: "Liridon Krasniqi", service: "Vlerësim i parë", status: "confirmed" }]),
  DAY("E premte · 8 maj", false, [{ time: "15:30", name: "Vera Lleshi", service: "Takim vijues", status: "noresp" }]),
];

const CalWeek = () => (
  <Screen>
    <CalHeader view="week" title="4–10 maj" sub="java aktuale" strip={<WeekStrip sel={6} />} />
    <Body pad="14px 16px 24px">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {WEEK_DATA.map((d, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: d.today ? MT.brand : MT.ink3, marginBottom: 8, fontFamily: MT.mono }}>{d.label}{d.today && " · sot"}</div>
            {d.appts.length === 0
              ? <div style={{ fontSize: 13, color: MT.ink3, padding: "2px 2px 0" }}>— i lirë</div>
              : <div style={{ ...cardStyle }}>{d.appts.map((a, j) => <ApptRow key={j} a={a} _first={j === 0} />)}</div>}
          </div>
        ))}
      </div>
    </Body>
    <Fab />
    <Tabs active="calendar" />
  </Screen>
);

const CalMonth = () => (
  <Screen>
    <CalHeader view="month" title="Maj 2026" sub={null} strip={null} />
    <Body pad="16px 16px 24px">
      <MonthGrid selected={6} />
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: MT.ink, marginBottom: 10, fontFamily: MT.display, letterSpacing: "-0.01em" }}>E mërkurë · 6 maj</div>
        <div style={{ ...cardStyle }}>
          <ApptRow _first a={{ time: "10:00", name: "Anila Hoxha", service: "Konsultë e parë", status: "confirmed" }} />
          <ApptRow a={{ time: "14:30", name: "Endi Kola", service: "Takim vijues", status: "pending" }} />
        </div>
      </div>
    </Body>
    <Fab />
    <Tabs active="calendar" />
  </Screen>
);

const CalDayEmpty = () => (
  <Screen>
    <CalHeader view="week" title="E martë" sub="5 maj 2026" strip={<WeekStrip sel={5} />} />
    <Body pad="18px 16px 24px">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "0 28px" }}>
        <div style={{ width: 60, height: 60, borderRadius: 999, background: "#ecece7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Icon name="calendar" size={28} color="#9CA2AE" /></div>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Asnjë takim këtë ditë</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 7, maxWidth: 250 }}>E gjithë dita është e lirë. Shto një takim ose lëre Medium-in të rezervojë.</div>
        <Btn kind="tinted" icon="plus" style={{ marginTop: 16, height: 44 }}>Takim i ri</Btn>
      </div>
    </Body>
    <Fab />
    <Tabs active="calendar" />
  </Screen>
);

const CalLoading = () => (
  <Screen>
    <CalHeader view="week" strip={<WeekStrip sel={6} />} />
    <Body pad="18px 16px 24px">
      <Sk w="40%" h={16} style={{ marginBottom: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ ...cardStyle, padding: "15px 16px", display: "flex", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 50 }}><Sk w={42} h={16} /><Sk w={34} h={10} /></div>
            <Sk w={3} h={44} r={999} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="60%" h={14} /><Sk w="45%" h={11} /></div>
          </div>
        ))}
      </div>
    </Body>
    <Tabs active="calendar" />
  </Screen>
);

// every appointment lifecycle status + offline pending-sync chips
const STATUS_AGENDA = [
  { time: "09:00", duration: "30 min", name: "Liridon Krasniqi", service: "Vlerësim i parë", status: "completed" },
  { time: "10:00", duration: "45 min", name: "Anila Hoxha", service: "Konsultë e parë", status: "confirmed" },
  { time: "11:30", duration: "30 min", name: "Mira Beqiri", service: "Takim vijues", status: "pending" },
  { time: "13:00", duration: "60 min", name: "Genti Marku", service: "Terapi manuale", status: "noresp" },
  { time: "14:30", duration: "30 min", name: "Endi Kola", service: "Takim vijues", status: "confirmed", sync: "move" },
  { time: "15:30", duration: "45 min", name: "Vera Lleshi", service: "Takim vijues", status: "cancelled" },
  { time: "16:30", duration: "30 min", name: "Fatjona Bega", service: "Konsultë e parë", status: "noshow" },
];

const StatusVariants = () => (
  <Screen>
    <CalHeader view="week" strip={<WeekStrip sel={6} />} />
    <Body pad="16px 16px 24px">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MT.ink3, marginBottom: 12, fontFamily: MT.mono }}>Të gjitha statuset</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {STATUS_AGENDA.map((a, i) => <ApptCard key={i} a={a} faded={a.status === "cancelled" || a.status === "completed"} />)}
      </div>
    </Body>
    <Fab />
    <Tabs active="calendar" />
  </Screen>
);

Object.assign(window, { CalDay, CalWeek, CalMonth, CalDayEmpty, CalLoading, StatusVariants });
