// New appointment / block time sheets — menu, existing patient, new patient, block time.

const AddMenu = () => (
  <SheetShell title="Shto" maxH={340}>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
      <MenuItem icon="calendar" title="Shto takim" sub="Rezervo manualisht për një pacient" />
      <MenuItem icon="clock" title="Blloko kohë" sub="Pushime ose kohë personale" />
    </div>
  </SheetShell>
);

const PatientTabs = ({ tab }) => (
  <div style={{ marginBottom: 14 }}><Seg value={tab} w="100%" options={[{ k: "existing", l: "Pacient ekzistues" }, { k: "new", l: "Pacient i ri" }]} /></div>
);

const DateTimeService = () => (
  <React.Fragment>
    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
      <div style={{ flex: 1.4 }}><SLabel>Data</SLabel><SInput value="6 maj 2026" mono /></div>
      <div style={{ flex: 1 }}><SLabel>Ora</SLabel><SInput value="09:00" mono /></div>
    </div>
    <div style={{ marginTop: 14 }}><SLabel>Shërbimi (opsional)</SLabel><SInput value="" placeholder="p.sh. Seancë vijuese" /></div>
    <div style={{ marginTop: 18 }}><ActBtn kind="primary">Rezervo takimin</ActBtn></div>
  </React.Fragment>
);

// existing patient — search with a result selected
const NewApptExisting = () => (
  <SheetShell title="Takim i ri" maxH={680}>
    <PatientTabs tab="existing" />
    <SInput value="Anila" focus />
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      {[["Anila Hoxha", "+355 69 222 1180", true], ["Anila Berisha", "+355 68 410 9921", false]].map(([n, p, sel], i) => (
        <button key={i} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 10, border: `1px solid ${sel ? MT.brand : MT.line}`, background: sel ? MT.brandTint : "#fff", cursor: "pointer", boxShadow: sel ? "0 0 0 3px rgba(31,93,134,0.12)" : "none" }}>
          <Avatar initials={n.split(" ").map((w) => w[0]).join("")} size={34} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: MT.ink }}>{n}</div><div style={{ fontSize: 12, color: MT.ink3, fontFamily: MT.mono }}>{p}</div></div>
          {sel && <Icon name="check" size={17} color={MT.brand} strokeWidth={2.4} />}
        </button>
      ))}
    </div>
    <DateTimeService />
  </SheetShell>
);

// new patient — name + phone
const NewApptNew = () => (
  <SheetShell title="Takim i ri" maxH={640}>
    <PatientTabs tab="new" />
    <div style={{ marginBottom: 14 }}><SLabel>Emri</SLabel><SInput value="" placeholder="Emri i pacientit" /></div>
    <div><SLabel>Telefoni</SLabel><SInput value="" placeholder="+355…" mono /></div>
    <DateTimeService />
  </SheetShell>
);

// block time
const BlockTime = () => (
  <SheetShell title="Blloko kohë" maxH={520}>
    <div style={{ marginTop: 2 }}><SLabel>Data</SLabel><SInput value="9 maj 2026" mono /></div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
      <div style={{ flex: 1 }}><SLabel>Nga</SLabel><SInput value="13:00" mono /></div>
      <span style={{ color: MT.ink3, marginTop: 24 }}>–</span>
      <div style={{ flex: 1 }}><SLabel>Deri</SLabel><SInput value="14:00" mono /></div>
    </div>
    <div style={{ marginTop: 14 }}><SLabel>Etiketë (opsionale)</SLabel><SInput value="" placeholder="p.sh. Drekë" /></div>
    <div style={{ marginTop: 18 }}><ActBtn kind="primary">Blloko kohën</ActBtn></div>
  </SheetShell>
);

// booked success
const ResultBooked = () => (
  <SheetShell maxH={520}
    toast={<Toast tone="success" icon="check" text="Takimi u rezervua." />}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "8px 24px 8px" }}>
      <div style={{ width: 64, height: 64, borderRadius: 999, background: MT.greenTint, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}><Icon name="check" size={28} color={MT.greenInk} strokeWidth={2} /></div>
      <div style={{ fontFamily: MT.display, fontSize: 20, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Takimi u rezervua</div>
      <div style={{ fontSize: 14, color: MT.ink2, lineHeight: 1.5, marginTop: 8 }}>Anila Hoxha · e mërkurë 6 maj, 09:00. Do t'i dërgohet një kujtesë një ditë para.</div>
      <div style={{ marginTop: 20, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <ActBtn kind="primary">Shiko takimin</ActBtn>
        <ActBtn kind="secondary">Mbyll</ActBtn>
      </div>
    </div>
  </SheetShell>
);

Object.assign(window, { AddMenu, NewApptExisting, NewApptNew, BlockTime, ResultBooked });
