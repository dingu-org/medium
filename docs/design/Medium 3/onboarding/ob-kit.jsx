// Onboarding kit — shell, fields, WhatsApp connection-state component.
// v2 visual language (MT tokens), calm/blue/soft. Reuses kit.jsx (SheetBtn, Spinner, WhatsAppMark, Banner).

const oCard = { background: "#fff", border: `1px solid ${MT.line}`, borderRadius: 14 };

// ── Shell: brand + dotted progress + Dil, scrolling body ──
const OShell = ({ step = 0, total = 4, showProgress = true, children }) => (
  <div style={{ width: "100%", height: "100%", background: "#f5f7fa", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: MT.sans }}>
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px 13px", borderBottom: `1px solid ${MT.sep}`, background: "#fff", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 70 }}>
        <svg width="22" height="22" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#1F5D86" /><path d="M11 27V13h2.4l4.1 7.6 4.1-7.6h2.4v14h-2.2v-9.5l-3.6 6.6h-1.4l-3.6-6.6V27H11Z" fill="#fff" /><circle cx="29.5" cy="13.5" r="1.6" fill="#7CC4A8" /></svg>
        <span style={{ fontFamily: MT.display, fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em", color: MT.ink }}>Medium</span>
      </div>
      <div style={{ display: "flex", gap: 5, alignItems: "center", opacity: showProgress ? 1 : 0 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ height: 5, borderRadius: 999, background: i <= step ? MT.brand : "#dde2ea", width: i === step ? 18 : 6 }} />
        ))}
      </div>
      <button style={{ background: "transparent", border: "none", color: MT.ink3, fontSize: 13, fontWeight: 500, cursor: "pointer", minWidth: 40, textAlign: "right" }}>Dil</button>
    </header>
    <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "26px 22px 28px" }}>{children}</main>
  </div>
);

const OHeader = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 22 }}>
    {eyebrow && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.brand, marginBottom: 9, fontFamily: MT.mono }}>{eyebrow}</div>}
    <h1 style={{ fontFamily: MT.display, fontSize: 27, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, margin: 0, lineHeight: 1.14 }}>{title}</h1>
    {sub && <p style={{ fontSize: 14.5, color: MT.ink2, marginTop: 9, lineHeight: 1.5 }}>{sub}</p>}
  </div>
);

const OField = ({ label, help, error, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18 }}>
    {label && <label style={{ fontSize: 13, fontWeight: 600, color: "#303744", letterSpacing: "-0.005em" }}>{label}</label>}
    {children}
    {help && !error && <div style={{ fontSize: 12, color: MT.ink3, lineHeight: 1.45 }}>{help}</div>}
    {error && <div style={{ fontSize: 12, color: MT.red, lineHeight: 1.45, display: "flex", alignItems: "center", gap: 5 }}><Icon name="x" size={13} color={MT.red} />{error}</div>}
  </div>
);

const OInput = ({ value, placeholder, prefix, state = "default", large }) => {
  const focused = state === "focus";
  const error = state === "error";
  const bc = error ? MT.red : focused ? MT.brand : MT.line;
  return (
    <div style={{ display: "flex", alignItems: "center", height: large ? 52 : 48, padding: "0 16px", border: `1px solid ${bc}`, borderRadius: 12, background: "#fff", boxShadow: focused ? "0 0 0 3px rgba(31,93,134,0.16)" : error ? "0 0 0 3px rgba(179,50,43,0.12)" : "none" }}>
      {prefix && <span style={{ fontSize: 15, color: MT.ink3, marginRight: 9, fontFamily: MT.mono }}>{prefix}</span>}
      <span style={{ flex: 1, fontSize: 15.5, color: value ? MT.ink : "#a4abb7" }}>{value || placeholder}</span>
      {focused && <span style={{ width: 2, height: 20, background: MT.brand, borderRadius: 2 }} />}
      {error && <Icon name="x" size={17} color={MT.red} />}
    </div>
  );
};

const ORadio = ({ icon, title, sub, selected }) => (
  <button style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "15px 16px", width: "100%", textAlign: "left", cursor: "pointer",
    background: selected ? MT.brandTint : "#fff", border: `1px solid ${selected ? MT.brand : MT.line}`, borderRadius: 12, fontFamily: MT.sans,
    boxShadow: selected ? "0 0 0 3px rgba(31,93,134,0.12)" : "none" }}>
    <div style={{ width: 34, height: 34, borderRadius: 9, background: selected ? MT.brand : "#eef0f4", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon name={icon} size={18} color={selected ? "#fff" : "#4b5563"} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: MT.ink }}>{title}</div>
      <div style={{ fontSize: 12.5, color: MT.ink2, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
    </div>
    <div style={{ width: 19, height: 19, borderRadius: 999, border: `1.5px solid ${selected ? MT.brand : "#cdd4de"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
      {selected && <div style={{ width: 9, height: 9, borderRadius: 999, background: MT.brand }} />}
    </div>
  </button>
);

const ODayRow = ({ name, on, from = "09:00", to = "17:00" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 2px" }}>
    <Toggle on={on} />
    <div style={{ flex: 1, fontSize: 14, color: on ? MT.ink : MT.ink3, fontWeight: 500 }}>{name}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 7, opacity: on ? 1 : 0.4 }}>
      <span style={{ padding: "6px 10px", border: `1px solid ${MT.line}`, borderRadius: 8, fontSize: 12.5, fontFamily: MT.mono, color: MT.ink, background: "#fff" }}>{from}</span>
      <span style={{ color: "#b6bdc9", fontSize: 12 }}>→</span>
      <span style={{ padding: "6px 10px", border: `1px solid ${MT.line}`, borderRadius: 8, fontSize: 12.5, fontFamily: MT.mono, color: MT.ink, background: "#fff" }}>{to}</span>
    </div>
  </div>
);

const ODurChip = ({ m, sel }) => (
  <button style={{ padding: "10px 16px", borderRadius: 10, background: sel ? MT.brand : "#fff", color: sel ? "#fff" : "#4b5563", border: `1px solid ${sel ? MT.brand : MT.line}`, fontFamily: MT.sans, fontSize: 13.5, fontWeight: sel ? 600 : 500, cursor: "pointer" }}>{m} min</button>
);

const OServiceRow = ({ title, dur, selected }) => (
  <button style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: selected ? MT.brandTint : "#fff", border: `1px solid ${selected ? MT.brand : MT.line}`, borderRadius: 12, cursor: "pointer", textAlign: "left", boxShadow: selected ? "0 0 0 3px rgba(31,93,134,0.12)" : "none", width: "100%" }}>
    <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${selected ? MT.brand : "#cdd4de"}`, background: selected ? MT.brand : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {selected && <Icon name="check" size={13} color="#fff" strokeWidth={2.6} />}
    </div>
    <div style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: MT.ink }}>{title}</div>
    <div style={{ fontSize: 13, color: MT.ink3, fontFamily: MT.mono }}>{dur}</div>
  </button>
);

// Bottom action row — back (optional) + primary with arrow / spinner
const OPrimary = ({ back, nextLabel = "Vazhdo", disabled, loading }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 30, paddingTop: 20, borderTop: `1px solid ${MT.sep}` }}>
    <button style={{ background: "transparent", border: "none", color: MT.ink2, fontSize: 14, fontWeight: 500, cursor: "pointer", display: back ? "inline-flex" : "none", alignItems: "center", gap: 4 }}>
      <Icon name="chevronLeft" size={15} color={MT.ink2} />Mbrapa
    </button>
    <div style={{ flex: 1 }} />
    <button disabled={disabled} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 46, padding: "0 20px", background: MT.brand, color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, boxShadow: "0 1px 2px rgba(15,20,32,0.1)" }}>
      {loading && <Spinner size={16} color="#fff" />}
      <span>{nextLabel}</span>
      {!loading && <Icon name="arrowRight" size={16} color="#fff" />}
    </button>
  </div>
);

// ── WhatsApp Embedded Signup launchpad ──
const WAExplain = ({ reconnect }) => (
  <div>
    <OHeader eyebrow="Hapi 2 nga 4" title={reconnect ? "Rilidh WhatsApp" : "Lidh WhatsApp"} sub="Medium do t'u përgjigjet pacientëve që shkruajnë në numrin tënd të WhatsApp Business." />
    <div style={{ ...oCard, padding: 18, display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
      {[
        { ic: "phone", t: "Numri yt i WhatsApp Business", s: "Jo një numër personal — duhet llogari Business." },
        { ic: "check", t: "Verifikim përmes Meta-s", s: "Hapet dritarja e Meta-s; ti zgjedh numrin dhe jep leje." },
        { ic: "sparkle", t: "Pas lidhjes, Medium fillon vetë", s: "Shabllonet e kujtesave krijohen automatikisht." },
      ].map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: MT.brandTint, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={b.ic} size={16} color={MT.brand} /></div>
          <div><div style={{ fontSize: 14, fontWeight: 600, color: MT.ink }}>{b.t}</div><div style={{ fontSize: 12.5, color: MT.ink2, marginTop: 3, lineHeight: 1.45 }}>{b.s}</div></div>
        </div>
      ))}
    </div>
    <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", height: 52, background: "#25D366", color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 15.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 2px rgba(15,20,32,0.12)" }}>
      <WhatsAppMark size={20} />{reconnect ? "Rilidh WhatsApp Business" : "Lidh WhatsApp Business"}
    </button>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, fontSize: 12, color: MT.ink3 }}>
      <Icon name="clock" size={13} color={MT.ink3} />Hapet te Meta · zgjat ~2 minuta
    </div>
    <OPrimary back nextLabel="Vazhdo" disabled />
  </div>
);

// ── Generic WhatsApp connection status (connecting / success / error states) ──
const WAStatus = ({ tone = "info", icon, spin, title, body, detail, primary, secondary, ghost, eyebrow }) => {
  const map = {
    info: { disc: MT.brandTint, ic: MT.brand },
    success: { disc: MT.greenTint, ic: MT.green },
    warning: { disc: MT.amberTint, ic: MT.amber },
    danger: { disc: MT.redTint, ic: MT.red },
  };
  const m = map[tone];
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {eyebrow && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.brand, marginBottom: 18, fontFamily: MT.mono }}>{eyebrow}</div>}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 14, marginBottom: 22 }}>
        <div style={{ width: 72, height: 72, borderRadius: 999, background: m.disc, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {spin ? <Spinner size={30} color={m.ic} width={3} /> : <Icon name={icon} size={32} color={m.ic} strokeWidth={2} />}
        </div>
      </div>
      <h1 style={{ fontFamily: MT.display, fontSize: 24, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, margin: 0, textAlign: "center", lineHeight: 1.18 }}>{title}</h1>
      <p style={{ fontSize: 14.5, color: MT.ink2, margin: "10px 24px 0", lineHeight: 1.5, textAlign: "center" }}>{body}</p>
      {detail && (
        <div style={{ ...oCard, padding: 16, marginTop: 22, background: "#fff" }}>{detail}</div>
      )}
      <div style={{ flex: 1, minHeight: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
        {primary}
        {secondary}
        {ghost && <button style={{ height: 40, background: "transparent", border: "none", color: MT.ink2, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>{ghost}</button>}
      </div>
    </div>
  );
};

const WAPrimary = ({ children, whatsapp }) => (
  <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", height: 50, background: whatsapp ? "#25D366" : MT.brand, color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 2px rgba(15,20,32,0.12)" }}>
    {whatsapp && <WhatsAppMark size={19} />}{children}
  </button>
);
const WASecondary = ({ children }) => (
  <button style={{ width: "100%", height: 50, background: "#fff", color: MT.ink, border: `1px solid ${MT.line}`, borderRadius: 12, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{children}</button>
);

Object.assign(window, { oCard, OShell, OHeader, OField, OInput, ORadio, ODayRow, ODurChip, OServiceRow, OPrimary, WAExplain, WAStatus, WAPrimary, WASecondary });
