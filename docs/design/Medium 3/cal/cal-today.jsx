// Today screens — default (exception-first), loading, empty quiet-day.

const AttnCard = () => (
  <div style={{ ...cardStyle, padding: "16px 18px", marginBottom: 26 }}>
    <div style={{ display: "flex", gap: 13 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: ORANGE_TINT, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="clock" size={19} color={ORANGE} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 600, color: MT.ink, letterSpacing: "-0.01em", lineHeight: 1.35 }}>Vera Lleshi nuk iu përgjigj kujtesës</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, marginTop: 4 }}>E premte · 15:30 · Takim vijues</div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
      <Btn kind="primary" icon="message" full style={{ height: 44, flex: 1 }}>Shkruaji</Btn>
      <Btn kind="secondary" style={{ height: 44 }}>Anulo</Btn>
    </div>
  </div>
);

const NextAppt = ({ a }) => (
  <div style={{ ...cardStyle, padding: "16px 18px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer" }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 48 }}>
      <div style={{ fontFamily: MT.display, fontWeight: 600, fontSize: 26, color: MT.ink, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{a.time}</div>
      <div style={{ fontSize: 11.5, color: MT.ink3, fontFamily: MT.mono, marginTop: 5 }}>{a.duration}</div>
    </div>
    <div style={{ width: 3, alignSelf: "stretch", borderRadius: 999, background: MT.green }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 16.5, fontWeight: 600, color: MT.ink, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
      <div style={{ fontSize: 13.5, color: MT.ink2, marginTop: 3 }}>{a.service}</div>
    </div>
    <CalPill status={a.status} />
  </div>
);

const HandlingStrip = ({ n }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", ...cardStyle, cursor: "pointer" }}>
    <span style={{ width: 9, height: 9, borderRadius: 999, background: MT.brand, flexShrink: 0 }} />
    <div style={{ flex: 1, fontSize: 14, color: MT.ink2 }}>Medium po menaxhon <span style={{ color: MT.ink, fontWeight: 600 }}>{n} biseda</span></div>
    <Icon name="chevronRight" size={17} color="#c6ccd6" />
  </div>
);

const TodayDefault = () => (
  <Screen>
    <TopBar title="Sot" sub="E mërkurë · 6 maj" right={<BellButton dot />} />
    <Body>
      <SectionLabel style={{ color: ORANGE_INK }}>Kërkon vëmendjen tënde</SectionLabel>
      <AttnCard />
      <SectionLabel>Më pas</SectionLabel>
      <div style={{ marginBottom: 26 }}><NextAppt a={{ time: "10:00", duration: "45 min", name: "Anila Hoxha", service: "Konsultë e parë", status: "confirmed" }} /></div>
      <Group title="Më vonë sot">
        <Row leading={<div style={{ fontFamily: MT.display, fontWeight: 600, fontSize: 15, color: MT.ink, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", width: 46 }}>14:30</div>} title="Endi Kola" subtitle="Takim vijues · 30 min" accessory={<CalPill status="pending" />} />
      </Group>
      <HandlingStrip n={5} />
    </Body>
    <Tabs active="today" />
  </Screen>
);

const TodayLoading = () => (
  <Screen>
    <TopBar title="Sot" sub="E mërkurë · 6 maj" right={<BellButton />} />
    <Body>
      <div style={{ height: 8 }} />
      <Sk w="42%" h={11} style={{ marginBottom: 12 }} />
      <div style={{ ...cardStyle, padding: 16, marginBottom: 26, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 13 }}><Sk w={38} h={38} r={11} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="70%" h={13} /><Sk w="45%" h={11} /></div></div>
        <Sk w="100%" h={44} r={12} />
      </div>
      <Sk w="28%" h={11} style={{ marginBottom: 12 }} />
      <div style={{ ...cardStyle, padding: 16, display: "flex", gap: 13, alignItems: "center" }}><Sk w={42} h={30} r={8} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="55%" h={13} /><Sk w="40%" h={11} /></div></div>
    </Body>
    <Tabs active="today" />
  </Screen>
);

const TodayEmpty = () => (
  <Screen>
    <TopBar title="Sot" sub="E mërkurë · 6 maj" right={<BellButton />} />
    <Body>
      <div style={{ ...cardStyle, padding: "20px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 13, background: MT.greenTint, border: "1px solid #cfe7d9" }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="check" size={20} color={MT.green} strokeWidth={2} /></div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 15.5, fontWeight: 600, color: MT.greenInk }}>Asgjë s'kërkon ty</div><div style={{ fontSize: 13.5, color: MT.greenInk, opacity: 0.8, marginTop: 3 }}>Medium po i mban të gjitha bisedat.</div></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "30px 28px 10px" }}>
        <div style={{ width: 60, height: 60, borderRadius: 999, background: "#eef1f5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Icon name="calendar" size={28} color="#9aa1ad" /></div>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Asnjë takim sot</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 7, maxWidth: 250 }}>Dita është e lirë. Shiko javën që vjen ose pusho — Medium të mbulon.</div>
        <Btn kind="tinted" style={{ marginTop: 16, height: 42 }}>Shiko javën</Btn>
      </div>
      <div style={{ marginTop: 14 }}><HandlingStrip n={2} /></div>
    </Body>
    <Tabs active="today" />
  </Screen>
);

Object.assign(window, { TodayDefault, TodayLoading, TodayEmpty });
