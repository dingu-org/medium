// Klientët screens — directory list (default / loading / empty / search) and
// client detail (WhatsApp-linked / manual / reminder opt-out) + add-new.

// ── List · default ──────────────────────────────────────────────
const ClientsDefault = () => (
  <Screen>
    <TopBar title="Klientët" right={<RoundBtn icon="plus" />} />
    <SearchBar />
    <Body pad="0 20px 24px">
      <SectionLabel>24 klientë</SectionLabel>
      <div style={{ ...cardStyle }}>
        <ClientRow _first initials="AH" name="Anila Hoxha" sub="Më pas: e mërkurë 6 maj · 10:00" accent={MT.green} dot={MT.green} />
        <ClientRow initials="EK" name="Endi Kola" sub="Më pas: e mërkurë 6 maj · 14:30" accent={MT.amberInk} />
        <ClientRow initials="VL" name="Vera Lleshi" sub="Më pas: e premte 8 maj · 15:30" accent={ORANGE_INK} />
        <ClientRow initials="LK" name="Liridon Krasniqi" sub="Më pas: e shtunë 9 maj · 09:00 · me dorë" />
        <ClientRow initials="GM" name="Genti Marku" sub="I fundit: sot · Terapi manuale" />
        <ClientRow initials="MB" name="Mira Beqiri" sub="I fundit: 2 maj · anuloi" />
        <ClientRow initials="RM" name="Ramadan Maliqi" sub="I fundit: 1 maj · Konsultë e parë" />
        <ClientRow initials="FB" name="Fatjona Bega" sub="I fundit: 28 prill · Takim vijues" />
      </div>
    </Body>
    <Tabs active="clients" />
  </Screen>
);

// ── List · loading ──────────────────────────────────────────────
const ClientsLoading = () => (
  <Screen>
    <TopBar title="Klientët" right={<RoundBtn icon="plus" />} />
    <SearchBar />
    <Body pad="0 20px 24px">
      <div style={{ height: 12 }} />
      <div style={{ ...cardStyle }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ borderTop: i ? `1px solid ${MT.sep}` : "none" }}><SkeletonRow /></div>)}
      </div>
    </Body>
    <Tabs active="clients" />
  </Screen>
);

// ── List · empty ────────────────────────────────────────────────
const ClientsEmpty = () => (
  <Screen>
    <TopBar title="Klientët" right={<RoundBtn icon="plus" />} />
    <SearchBar />
    <Body pad="0 20px 24px">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "0 28px" }}>
        <div style={{ width: 60, height: 60, borderRadius: 999, background: "#eef1f5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Icon name="users" size={28} color="#9aa1ad" /></div>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Ende asnjë klient</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 7, maxWidth: 264 }}>Sapo një pacient të shkruajë në WhatsApp, shtohet këtu vetë. Ose shto një me dorë.</div>
        <Btn kind="tinted" icon="plus" style={{ marginTop: 16, height: 42 }}>Shto klient</Btn>
      </div>
    </Body>
    <Tabs active="clients" />
  </Screen>
);

// ── List · search active ────────────────────────────────────────
const ClientsSearch = () => (
  <Screen>
    <TopBar title="Klientët" right={<RoundBtn icon="plus" />} />
    <SearchBar value="an" />
    <Body pad="0 20px 24px">
      <SectionLabel>3 rezultate</SectionLabel>
      <div style={{ ...cardStyle }}>
        <ClientRow _first initials="AH" name="Anila Hoxha" sub="Më pas: e mërkurë 6 maj · 10:00" accent={MT.green} dot={MT.green} />
        <ClientRow initials="BA" name="Besa Ndreu" sub="I fundit: 20 prill · Konsultë e parë" />
        <ClientRow initials="AM" name="Arben Maraj" sub="I fundit: 3 prill · Terapi manuale" />
      </div>
    </Body>
    <Tabs active="clients" />
  </Screen>
);

// ── Detail · WhatsApp-linked ────────────────────────────────────
const ClientDetail = () => (
  <Screen>
    <NavBar title="Anila Hoxha" onBack={() => {}} />
    <Body pad="16px 20px 28px">
      <ClientHeader initials="AH" name="Anila Hoxha" phone="+355 69 234 1180" since="Kliente që nga 6 maj 2026" />
      <QuickActs />
      <NoteBlock>Preferon paradite. Dhimbje në shpatull e djathtë.</NoteBlock>
      <div style={{ marginTop: 24 }}>
        <SectionLabel>Takimet e ardhshme</SectionLabel>
        <div style={{ ...cardStyle }}>
          <ApptLine _first date="E mërkurë, 6 maj" time="10:00" service="Konsultë e parë" status="confirmed" />
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <SectionLabel>Historiku · 3 takime</SectionLabel>
        <div style={{ ...cardStyle }}>
          <ApptLine _first date="28 prill" service="Takim vijues" status="completed" />
          <ApptLine date="21 prill" service="Takim vijues" status="completed" />
          <ApptLine date="14 prill" service="Konsultë e parë" status="completed" />
        </div>
      </div>
    </Body>
  </Screen>
);

// ── Detail · manual patient (no WhatsApp) + reminder opt-out ─────
const ClientManual = () => (
  <Screen>
    <NavBar title="Liridon Krasniqi" onBack={() => {}} />
    <Body pad="16px 20px 28px">
      <ClientHeader initials="LK" name="Liridon Krasniqi" phone="+355 68 770 5521" since="Shtuar me dorë · 2 maj 2026" manual />
      <QuickActs manual />
      <div style={{ marginTop: 16 }}>
        <Banner tone="warning" icon="bell" title="Ç'regjistruar nga kujtesat" text="Ky klient nuk merr kujtesa automatike në WhatsApp." />
      </div>
      <NoteBlock />
      <div style={{ marginTop: 24 }}>
        <SectionLabel>Takimet e ardhshme</SectionLabel>
        <div style={{ ...cardStyle }}>
          <ApptLine _first date="E shtunë, 9 maj" time="09:00" service="Terapi manuale" status="pending" />
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <SectionLabel>Historiku · 1 takim</SectionLabel>
        <div style={{ ...cardStyle }}>
          <ApptLine _first date="25 prill" service="Terapi manuale" status="noshow" />
        </div>
      </div>
    </Body>
  </Screen>
);

// ── Add new client (manual) ─────────────────────────────────────
const ClientNew = () => (
  <Screen>
    <NavBar title="Klient i ri" onBack={() => {}} />
    <Body pad="18px 20px 24px">
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ width: "100%" }}><div style={{ fontSize: 13, fontWeight: 600, color: "#303744", marginBottom: 7 }}>Emri</div>
          <div style={{ height: 50, padding: "0 16px", border: `1px solid ${MT.brand}`, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", boxShadow: "0 0 0 3px rgba(31,93,134,0.16)", fontSize: 15.5, color: MT.ink }}>Blerta Doci<span style={{ width: 2, height: 20, background: MT.brand, borderRadius: 2, marginLeft: 2 }} /></div>
        </div>
        <div style={{ width: "100%" }}><div style={{ fontSize: 13, fontWeight: 600, color: "#303744", marginBottom: 7 }}>Telefoni</div>
          <div style={{ height: 50, padding: "0 16px", border: `1px solid ${MT.line}`, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", fontSize: 15.5, color: MT.ink, fontFamily: MT.mono }}>+355 69 412 8830</div>
        </div>
        <div style={{ width: "100%" }}><div style={{ fontSize: 13, fontWeight: 600, color: "#303744", marginBottom: 7 }}>Shënim privat <span style={{ color: MT.ink3, fontWeight: 400 }}>· me dëshirë</span></div>
          <div style={{ minHeight: 80, padding: "12px 16px", border: `1px solid ${MT.line}`, borderRadius: 12, background: "#fff", fontSize: 14.5, lineHeight: 1.5, color: "#a4abb7" }}>Shto një shënim…</div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <Banner tone="info" icon="message" title="WhatsApp lidhet kur të shkruajnë" text="Klientët e shtuar me dorë s'kanë WhatsApp derisa të nisin vetë një bisedë në numrin tënd." />
      </div>
    </Body>
    <div style={{ padding: "12px 20px 26px", borderTop: `1px solid ${MT.sep}`, background: "#fff", flexShrink: 0 }}>
      <Btn kind="primary" icon="check" full style={{ height: 50 }}>Shto klientin</Btn>
    </div>
  </Screen>
);

Object.assign(window, { ClientsDefault, ClientsLoading, ClientsEmpty, ClientsSearch, ClientDetail, ClientManual, ClientNew });
