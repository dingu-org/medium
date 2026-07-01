// Chat kit — thread scaffold, bubbles (incl. pending/failed), status row, notices, composer states.
// v2 language (MT). Reuses kit.jsx (SheetBtn, Spinner, Sk, WhatsAppMark). POV: patient + Medium on left, your takeover on right.

// ── message bubble ──
const CBubble = ({ side, who, text, meta, state }) => {
  const mine = side === "right";
  const ai = who === "ai";
  const failed = state === "failed";
  const pending = state === "pending";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "84%" }}>
        {ai && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: MT.mono, color: MT.brand, marginBottom: 3, letterSpacing: "0.04em" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: MT.sage }} />MEDIUM</div>}
        <div style={{ padding: "10px 13px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.45, letterSpacing: "-0.005em",
          ...(mine
            ? { background: failed ? "#fff" : MT.brand, color: failed ? MT.ink : "#fff", border: failed ? `1px solid ${MT.red}` : "none", borderBottomRightRadius: 5, opacity: pending ? 0.7 : 1 }
            : ai ? { background: MT.brandTint, color: MT.brandInk, borderBottomLeftRadius: 5 }
            : { background: "#fff", color: MT.ink, border: `1px solid ${MT.line}`, borderBottomLeftRadius: 5 }) }}>{text}</div>
        <div style={{ fontSize: 10.5, padding: "4px 6px 0", textAlign: mine ? "right" : "left", fontFamily: MT.mono, display: "flex", gap: 5, justifyContent: mine ? "flex-end" : "flex-start", alignItems: "center",
          color: failed ? MT.red : MT.ink3 }}>
          {pending && <Spinner size={9} color={MT.ink3} width={1.5} />}
          {failed && <Icon name="x" size={11} color={MT.red} />}
          {meta}
          {failed && <span style={{ color: MT.brand, fontWeight: 600 }}>· Provo sërish</span>}
        </div>
      </div>
    </div>
  );
};

const CSys = ({ children }) => (
  <div style={{ textAlign: "center", fontSize: 11, color: MT.ink3, fontFamily: MT.mono, padding: "4px 0", lineHeight: 1.4 }}>{children}</div>
);

// rapid-fire client messages grouped into one debounced turn
const CGroup = ({ msgs, meta }) => (
  <div style={{ display: "flex", justifyContent: "flex-start" }}>
    <div style={{ maxWidth: "84%", display: "flex", flexDirection: "column", gap: 3 }}>
      {msgs.map((t, i) => (
        <div key={i} style={{ padding: "9px 13px", borderRadius: 16, background: "#fff", color: MT.ink, border: `1px solid ${MT.line}`, fontSize: 14.5, lineHeight: 1.4,
          borderTopLeftRadius: i === 0 ? 16 : 6, borderBottomLeftRadius: i === msgs.length - 1 ? 5 : 6 }}>{t}</div>
      ))}
      <div style={{ fontSize: 10.5, color: MT.ink3, padding: "3px 6px 0", fontFamily: MT.mono }}>{meta}</div>
    </div>
  </div>
);

// ── status sub-header (who is handling + AI toggle) ──
const CStatusRow = ({ mode = "ai" }) => {
  const map = {
    ai: { dot: MT.brand, label: "Medium po përgjigjet", tint: "#fff" },
    you: { dot: MT.green, label: "Ti po bisedon", tint: MT.greenTint },
    paused: { dot: MT.amber, label: "Medium në pauzë", tint: MT.amberTint },
    escalated: { dot: MT.red, label: "Të duhet ty", tint: MT.redTint },
  };
  const m = map[mode];
  const aiOn = mode === "ai";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 18px", background: m.tint, borderBottom: `1px solid ${MT.line}`, flexShrink: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: m.dot }} />
      <div style={{ flex: 1, fontSize: 12.5, color: MT.ink, fontWeight: 500 }}>{m.label}</div>
      <span style={{ fontSize: 12, color: MT.ink3 }}>Lër Medium-in</span>
      <Toggle on={aiOn} />
    </div>
  );
};

// ── thin in-thread notice (escalation reason / paused / window) ──
const CNotice = ({ tone = "warning", icon, text, action }) => {
  const map = { warning: { bg: MT.amberTint, fg: MT.amberInk, ic: MT.amber, bd: "#f0e0bd" }, danger: { bg: MT.redTint, fg: MT.redInk, ic: MT.red, bd: "#f0d0cf" }, info: { bg: MT.brandTint, fg: MT.brandInk, ic: MT.brand, bd: "#cfe0ee" }, success: { bg: MT.greenTint, fg: MT.greenInk, ic: MT.green, bd: "#cfe7d9" } };
  const m = map[tone];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 18px", background: m.bg, borderBottom: `1px solid ${m.bd}`, flexShrink: 0 }}>
      <Icon name={icon} size={16} color={m.ic} />
      <div style={{ flex: 1, fontSize: 12.5, color: m.fg, lineHeight: 1.45 }}>{text}</div>
      {action && <span style={{ fontSize: 12.5, color: m.ic, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>{action}</span>}
    </div>
  );
};

// ── composer states ──
const CComposer = ({ state = "default", draft }) => {
  if (state === "windowClosed") {
    return (
      <div style={{ background: "#fff", borderTop: `1px solid ${MT.line}`, padding: "12px 16px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 12px", background: "#f4f6f9", border: `1px solid ${MT.line}`, borderRadius: 12, marginBottom: 10 }}>
          <Icon name="clock" size={16} color={MT.ink3} />
          <div style={{ flex: 1, fontSize: 12.5, color: MT.ink2, lineHeight: 1.45 }}>Dritarja 24-orëshe u mbyll. Pacienti duhet të shkruajë sërish para një përgjigjeje të lirë.</div>
        </div>
        <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 44, background: MT.brandTint, color: MT.brandInk, border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}><Icon name="bell" size={16} color={MT.brandInk} />Dërgo kujtesë me shabllon</button>
      </div>
    );
  }
  if (state === "revoked") {
    return (
      <div style={{ background: "#fff", borderTop: `1px solid ${MT.line}`, padding: "12px 16px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 12px", background: MT.redTint, border: `1px solid #f0d0cf`, borderRadius: 12, marginBottom: 10 }}>
          <Icon name="phone" size={16} color={MT.red} />
          <div style={{ flex: 1, fontSize: 12.5, color: MT.redInk, lineHeight: 1.45 }}>WhatsApp u shkëput. Rilidh për të dërguar mesazhe.</div>
        </div>
        <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 44, background: "#25D366", color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}><WhatsAppMark size={17} />Rilidh WhatsApp</button>
      </div>
    );
  }
  const typed = state === "typed" || state === "pending";
  const pending = state === "pending";
  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 16px 14px", background: "#fff", borderTop: `1px solid ${MT.line}`, flexShrink: 0, alignItems: "center" }}>
      <div style={{ flex: 1, minHeight: 42, padding: "0 16px", border: `1px solid ${typed ? "#d3dae3" : MT.line}`, borderRadius: 999, fontSize: 14.5, color: typed ? MT.ink : MT.ink3, display: "flex", alignItems: "center" }}>{draft || "Shkruaj një mesazh…"}</div>
      <button style={{ width: 42, height: 42, background: typed ? MT.brand : "#eef0f4", border: "none", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
        {pending ? <Spinner size={16} color="#fff" /> : <Icon name="send" size={17} color={typed ? "#fff" : "#9aa1ad"} />}
      </button>
    </div>
  );
};

// ── thread scaffold ──
const CThread = ({ patient, statusRow, notice, messages, composer }) => (
  <Screen>
    <NavBar onBack={() => {}} title={patient} right={<RoundBtn icon="phone" />} />
    {statusRow}
    {notice}
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 11, background: MT.bodyBg }}>{messages}</div>
    {composer}
  </Screen>
);

Object.assign(window, { CBubble, CSys, CGroup, CStatusRow, CNotice, CComposer, CThread });
