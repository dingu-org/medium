// Appointment lifecycle kit — bottom-sheet shell over a dimmed calendar backdrop,
// reminder badges, slot chips, form fields. Reuses kit.jsx + cal-kit.jsx (CalHeader/WeekStrip/ApptCard/CalPill).

// reminder badge (from badges.tsx → Albanian)
const REM = {
  pending: { t: "Kujtesa në pritje", bg: MT.amberTint, fg: MT.amberInk },
  confirmed: { t: "Konfirmuar", bg: MT.greenTint, fg: MT.greenInk },
  cancelledByPatient: { t: "Anuluar nga pacienti", bg: MT.redTint, fg: MT.redInk },
  wantsReschedule: { t: "Kërkon ricaktim", bg: ORANGE_TINT, fg: ORANGE_INK },
  sent: { t: "Kujtesa u dërgua", bg: "#eef0f4", fg: "#4b5563" },
  failed: { t: "Kujtesa dështoi", bg: MT.redTint, fg: MT.redInk },
};
const RemBadge = ({ kind }) => {
  const r = REM[kind]; if (!r) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, background: r.bg, color: r.fg, fontSize: 11, fontWeight: 500, fontFamily: MT.mono, letterSpacing: "-0.01em" }}>{r.t}</span>;
};

// ── calendar backdrop (static, behind every sheet) ──
const CalBackdrop = () => (
  <Screen>
    <CalHeader view="week" strip={<WeekStrip sel={6} />} />
    <Body pad="18px 18px 24px">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px 12px" }}>
        <span style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: MT.ink }}>2 takime</span>
        <span style={{ fontSize: 13.5, color: MT.ink3 }}>· 09:00–17:00 i lirë</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <ApptCard a={{ time: "10:00", duration: "45 min", name: "Anila Hoxha", service: "Konsultë e parë", status: "confirmed" }} />
        <ApptCard a={{ time: "14:30", duration: "30 min", name: "Endi Kola", service: "Takim vijues", status: "pending" }} />
      </div>
    </Body>
    <Tabs active="calendar" />
  </Screen>
);

// ── bottom-sheet shell ──
const SheetShell = ({ title, titleRight, children, toast, maxH = 660 }) => (
  <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", fontFamily: MT.sans }}>
    <div style={{ position: "absolute", inset: 0 }}><CalBackdrop /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,20,32,0.4)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
    {toast && <div style={{ position: "absolute", top: 18, left: 16, right: 16, zIndex: 3 }}>{toast}</div>}
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: maxH, background: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: "0 -10px 40px -8px rgba(15,20,32,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 9, flexShrink: 0 }}><div style={{ width: 38, height: 5, borderRadius: 999, background: "#dfe3ea" }} /></div>
      {title && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 20px 14px", flexShrink: 0 }}>
          <div style={{ fontFamily: MT.display, fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em", color: MT.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{title}</div>
          <div style={{ flexShrink: 0 }}>{titleRight}</div>
        </div>
      )}
      <div style={{ overflowY: "auto", padding: "0 20px 24px" }}>{children}</div>
    </div>
  </div>
);

// ── sheet building blocks ──
const InfoCard = ({ children }) => <div style={{ border: `1px solid ${MT.line}`, borderRadius: 12, padding: 14, background: "#fff" }}>{children}</div>;

const QuickAct = ({ icon, label }) => (
  <button style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 42, background: "#fff", color: MT.ink, border: `1px solid ${MT.line}`, borderRadius: 10, fontFamily: MT.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
    {icon === "wa" ? <WhatsAppMark size={16} /> : <Icon name={icon} size={16} color={MT.brand} />}{label}
  </button>
);

const SLabel = ({ children }) => <label style={{ fontSize: 13, fontWeight: 600, color: "#303744", display: "block", marginBottom: 7 }}>{children}</label>;
const SInput = ({ value, placeholder, mono, focus }) => (
  <div style={{ height: 46, padding: "0 14px", border: `1px solid ${focus ? MT.brand : MT.line}`, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", fontSize: 14.5, color: value ? MT.ink : "#a4abb7", fontFamily: mono ? MT.mono : MT.sans, boxShadow: focus ? "0 0 0 3px rgba(31,93,134,0.16)" : "none" }}>{value || placeholder}</div>
);
const STextArea = ({ value, placeholder }) => (
  <div style={{ minHeight: 64, padding: "11px 14px", border: `1px solid ${MT.line}`, borderRadius: 10, background: "#fff", fontSize: 14, lineHeight: 1.5, color: value ? MT.ink : "#a4abb7" }}>{value || placeholder}</div>
);

const ActBtn = ({ kind = "secondary", icon, children, full = true }) => {
  const looks = {
    primary: { bg: MT.brand, fg: "#fff", bd: "none", ic: "#fff" },
    secondary: { bg: "#fff", fg: MT.ink, bd: `1px solid ${MT.line}`, ic: MT.brand },
    danger: { bg: MT.red, fg: "#fff", bd: "none", ic: "#fff" },
    dangerGhost: { bg: MT.redTint, fg: MT.redInk, bd: "none", ic: MT.red },
  }[kind];
  return (
    <button style={{ width: full ? "100%" : "auto", height: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: looks.bg, color: looks.fg, border: looks.bd, borderRadius: 12, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer" }}>
      {icon && <Icon name={icon} size={17} color={looks.ic} />}{children}
    </button>
  );
};

const SlotChip = ({ t, sel }) => (
  <button style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${sel ? MT.brand : MT.line}`, background: sel ? MT.brandTint : "#fff", color: sel ? MT.brandInk : MT.ink, fontFamily: MT.mono, fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: sel ? "0 0 0 3px rgba(31,93,134,0.12)" : "none" }}>{t}</button>
);

const MenuItem = ({ icon, title, sub }) => (
  <button style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${MT.line}`, borderRadius: 12, cursor: "pointer" }}>
    <div style={{ width: 38, height: 38, borderRadius: 10, background: MT.brandTint, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={icon} size={19} color={MT.brand} /></div>
    <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600, color: MT.ink }}>{title}</div><div style={{ fontSize: 12.5, color: MT.ink3, marginTop: 2 }}>{sub}</div></div>
    <Icon name="chevronRight" size={18} color="#c6ccd6" />
  </button>
);

Object.assign(window, { RemBadge, CalBackdrop, SheetShell, InfoCard, QuickAct, SLabel, SInput, STextArea, ActBtn, SlotChip, MenuItem });
