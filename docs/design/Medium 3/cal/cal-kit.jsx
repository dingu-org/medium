// Calendar kit — status dot/pill (full lifecycle), appt card + row, week-strip header, month grid.
// v2 language (MT), calm/blue/soft. Reuses kit.jsx (StatusPill, Sk, SkeletonRow).

const ORANGE = "#d97706", ORANGE_TINT = "#fdf1e3", ORANGE_INK = "#a85a08";

// full appointment lifecycle → dot color + pill (extends kit StatusPill with completed / no_show / noresp-orange)
const CAL = {
  confirmed: { label: "Konfirmuar", bg: MT.greenTint, fg: MT.greenInk, dot: MT.green },
  pending: { label: "Në pritje", bg: MT.amberTint, fg: MT.amberInk, dot: MT.amber },
  noresp: { label: "Pa përgjigje", bg: ORANGE_TINT, fg: ORANGE_INK, dot: ORANGE },
  cancelled: { label: "Anuluar", bg: MT.redTint, fg: MT.redInk, dot: MT.red },
  noshow: { label: "Nuk erdhi", bg: MT.redTint, fg: MT.redInk, dot: MT.red },
  completed: { label: "Përfunduar", bg: "#eef0f4", fg: "#4b5563", dot: "#8d95a3" },
};
const CalPill = ({ status }) => {
  const s = CAL[status] || CAL.pending;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px 3px 7px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 500, lineHeight: 1.4, flexShrink: 0 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: s.dot }} />{s.label}</span>;
};
const Dot = ({ status }) => <span style={{ width: 10, height: 10, borderRadius: 999, background: (CAL[status] || CAL.pending).dot, flexShrink: 0 }} />;

// pending-sync chip (offline PWA mutation queue)
const SyncChip = ({ kind }) => {
  const map = { move: { t: "Zhvendosje në radhë", failed: false }, cancel: { t: "Anulim në radhë", failed: false }, failed: { t: "Sinkronizimi dështoi", failed: true } };
  const m = map[kind];
  return <span style={{ flexShrink: 0, borderRadius: 999, padding: "2px 8px", fontSize: 10.5, fontWeight: 600, fontFamily: MT.mono, border: `1px solid ${m.failed ? "#f0d0cf" : "#f0e0bd"}`, background: m.failed ? MT.redTint : MT.amberTint, color: m.failed ? MT.redInk : MT.amberInk }}>{m.t}</span>;
};

// day-view card (rich)
const ApptCard = ({ a, faded }) => (
  <div style={{ ...cardStyle, padding: "15px 16px", display: "flex", gap: 14, cursor: "pointer", opacity: faded ? 0.6 : 1 }}>
    <div style={{ minWidth: 50 }}>
      <div style={{ fontFamily: MT.display, fontWeight: 600, fontSize: 17, color: MT.ink, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", textDecoration: a.status === "cancelled" ? "line-through" : "none" }}>{a.time}</div>
      <div style={{ fontSize: 11, color: MT.ink3, fontFamily: MT.mono, marginTop: 3 }}>{a.duration}</div>
    </div>
    <div style={{ width: 3, borderRadius: 999, background: (CAL[a.status] || CAL.pending).dot, flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 600, color: MT.ink, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
        <CalPill status={a.status} />
      </div>
      <div style={{ fontSize: 13.5, color: MT.ink2, marginTop: 3 }}>{a.service}</div>
      {a.sync && <div style={{ marginTop: 9 }}><SyncChip kind={a.sync} /></div>}
    </div>
  </div>
);

// compact agenda row (week / month day lists)
const ApptRow = ({ a, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: _first ? "none" : `1px solid ${MT.sep}`, cursor: "pointer" }}>
    <Dot status={a.status} />
    <span style={{ width: 46, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: MT.ink, flexShrink: 0, fontFamily: MT.display, letterSpacing: "-0.01em" }}>{a.time}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 500, color: MT.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
      {a.service && <div style={{ fontSize: 12, color: MT.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.service}</div>}
    </div>
    {a.sync ? <SyncChip kind={a.sync} /> : <CalPill status={a.status} />}
  </div>
);

// week-strip header (calm)
const CalHeader = ({ title = "E mërkurë", sub = "6 maj 2026", strip, view, onViewLabel }) => (
  <header style={{ background: "#fff", padding: "10px 18px 14px", flexShrink: 0, borderBottom: `1px solid ${MT.sep}` }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 38 }}>
      <div style={{ display: "flex", background: "#e8eaef", borderRadius: 9, padding: 3, gap: 2 }}>
        {[{ k: "week", l: "Javë" }, { k: "month", l: "Muaj" }].map((o) => {
          const on = o.k === view;
          return <div key={o.k} style={{ padding: "5px 14px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, color: on ? MT.ink : MT.ink2, background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 2px rgba(15,20,32,0.1)" : "none" }}>{o.l}</div>;
        })}
      </div>
      <div style={{ textAlign: "center", flex: 1 }}>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, letterSpacing: "-0.025em", color: MT.ink, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: MT.ink3, marginTop: 1 }}>{sub}</div>
      </div>
      <button style={{ height: 32, padding: "0 12px", borderRadius: 999, border: `1px solid ${MT.line}`, background: "#fff", fontSize: 12.5, fontWeight: 600, color: MT.brand, cursor: "pointer" }}>Sot</button>
    </div>
    {strip}
  </header>
);

const WeekStrip = ({ sel = 6 }) => {
  const days = [["Hën", 4], ["Mar", 5], ["Mër", 6], ["Enj", 7], ["Pre", 8], ["Sht", 9], ["Die", 10]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 14 }}>
      <Icon name="chevronLeft" size={18} color="#c6ccd6" />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {days.map(([dow, date], i) => {
          const on = date === sel;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: on ? MT.brand : MT.ink3 }}>{dow}</div>
              <div style={{ width: 34, height: 34, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MT.display, fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", background: on ? MT.brand : "transparent", color: on ? "#fff" : (i >= 5 ? "#c6ccd6" : MT.ink) }}>{date}</div>
            </div>
          );
        })}
      </div>
      <Icon name="chevronRight" size={18} color="#c6ccd6" />
    </div>
  );
};

// month grid — 5 weeks, selected day, appt dots
const MonthGrid = ({ selected = 6, appts = [6, 8, 12, 15, 19, 22, 26] }) => {
  const head = ["H", "M", "M", "E", "P", "Sh", "D"];
  const cells = [];
  for (let i = -2; i <= 32; i++) cells.push(i >= 1 && i <= 31 ? i : null);
  return (
    <div style={{ ...cardStyle, padding: "14px 12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
        {head.map((h, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: MT.ink3 }}>{h}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 2 }}>
        {cells.map((d, i) => {
          const on = d === selected;
          const hasAppt = d && appts.includes(d);
          const weekend = i % 7 >= 5;
          return (
            <div key={i} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", cursor: d ? "pointer" : "default" }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: on ? 700 : 500, fontVariantNumeric: "tabular-nums", fontFamily: MT.display, background: on ? MT.brand : "transparent", color: on ? "#fff" : d ? (weekend ? "#aab1bd" : MT.ink) : "transparent" }}>{d || ""}</div>
              {hasAppt && !on && <span style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 999, background: MT.brand }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Fab = () => (
  <button style={{ position: "absolute", right: 18, bottom: 92, width: 54, height: 54, borderRadius: 999, background: MT.brand, border: "none", boxShadow: "0 8px 24px rgba(31,93,134,0.30), 0 2px 6px rgba(15,20,32,0.16)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 5 }}>
    <Icon name="plus" size={25} color="#fff" strokeWidth={2} />
  </button>
);

Object.assign(window, { CAL, CalPill, Dot, SyncChip, ApptCard, ApptRow, CalHeader, WeekStrip, MonthGrid, Fab, ORANGE, ORANGE_TINT, ORANGE_INK });
