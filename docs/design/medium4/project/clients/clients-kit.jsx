// Klientët kit — directory primitives. Grounded in the patients schema:
// name, phone, wa_id (null = manual), notes, reminder_opted_out_at + appointment/conversation relations.
// Reuses MT, Icon, Avatar, CalPill/Dot, ChannelChip, cardStyle. Calm / blue / soft.

// Always-visible search bar (clients is a directory — search earns its place)
const SearchBar = ({ value }) => (
  <div style={{ padding: "4px 20px 12px", flexShrink: 0 }}>
    <div style={{ height: 42, borderRadius: 12, background: "#eceef2", display: "flex", alignItems: "center", gap: 9, padding: "0 13px" }}>
      <Icon name="search" size={18} color="#9aa1ad" />
      <span style={{ flex: 1, fontSize: 15, color: value ? MT.ink : "#9aa1ad", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value || "Kërko klient"}</span>
      {value && <Icon name="x" size={17} color="#9aa1ad" />}
    </div>
  </div>
);

// Directory row — avatar + name + one meta line (next appointment, or last seen)
const ClientRow = ({ initials, name, sub, accent, dot, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 16px", borderTop: _first ? "none" : `1px solid ${MT.sep}`, cursor: "pointer" }}>
    <Avatar initials={initials} size={44} dot={dot} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: MT.ink, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
      <div style={{ fontSize: 13, color: accent || MT.ink3, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
    </div>
    <Icon name="chevronRight" size={17} color="#c6ccd6" />
  </div>
);

// Manually-added patients have wa_id = NULL → no WhatsApp until they message first.
const ManualBadge = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 9px", borderRadius: 999, background: "#eef0f4", fontSize: 12, fontWeight: 500, color: "#5b6472" }}>
    <Icon name="user" size={14} color="#6b7280" />Shtuar me dorë
  </span>
);

// Detail header — large avatar, name, phone, channel state, "client since"
const ClientHeader = ({ initials, name, phone, since, manual }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingBottom: 4 }}>
    <Avatar initials={initials} size={72} />
    <div style={{ fontFamily: MT.display, fontSize: 22, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em", marginTop: 12 }}>{name}</div>
    <div style={{ fontSize: 14, color: MT.ink2, fontFamily: MT.mono, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{phone}</div>
    <div style={{ marginTop: 11 }}>{manual ? <ManualBadge /> : <ChannelChip channel="whatsapp" state="connected" />}</div>
    <div style={{ fontSize: 12.5, color: MT.ink3, marginTop: 10 }}>{since}</div>
  </div>
);

// Quick-action tile row — mirrors the appointment detail sheet (Telefono / WhatsApp / Biseda)
const CAct = ({ icon, label, disabled }) => (
  <button style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 6px", background: "#fff", border: `1px solid ${MT.line}`, borderRadius: 12, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
    <Icon name={icon} size={20} color={disabled ? "#9aa1ad" : MT.brand} />
    <span style={{ fontSize: 12.5, fontWeight: 600, color: disabled ? MT.ink3 : MT.ink }}>{label}</span>
  </button>
);
const QuickActs = ({ manual }) => (
  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
    <CAct icon="phone" label="Telefono" />
    <CAct icon="wa" label="WhatsApp" disabled={manual} />
    <CAct icon="message" label="Biseda" disabled={manual} />
  </div>
);

// Private note block (read + edit-affordance)
const NoteBlock = ({ children, editing }) => (
  <div style={{ marginTop: 20 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: "#303744", marginBottom: 8 }}>Shënim privat</div>
    {editing
      ? <div style={{ minHeight: 60, padding: "11px 14px", border: `1px solid ${MT.brand}`, borderRadius: 10, background: "#fff", fontSize: 14, lineHeight: 1.5, color: MT.ink, boxShadow: "0 0 0 3px rgba(59,91,254,0.16)" }}>{children}<span style={{ display: "inline-block", width: 2, height: 18, background: MT.brand, marginLeft: 2, verticalAlign: "text-bottom" }} /></div>
      : children
        ? <div style={{ border: `1px solid ${MT.line}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: MT.ink, lineHeight: 1.5 }}>{children}</div>
        : <div style={{ border: `1px solid ${MT.line}`, borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "#a4abb7", lineHeight: 1.5 }}>Shto një shënim privat…</div>}
  </div>
);

// One appointment line inside a client's history / upcoming list
const ApptLine = ({ date, time, service, status, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: _first ? "none" : `1px solid ${MT.sep}`, cursor: "pointer" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: MT.ink, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: status === "cancelled" ? "line-through" : "none" }}>{date}{time ? ` · ${time}` : ""}</div>
      <div style={{ fontSize: 12.5, color: MT.ink3, marginTop: 1 }}>{service}</div>
    </div>
    <CalPill status={status} />
  </div>
);

Object.assign(window, { SearchBar, ClientRow, ManualBadge, ClientHeader, CAct, QuickActs, NoteBlock, ApptLine });
