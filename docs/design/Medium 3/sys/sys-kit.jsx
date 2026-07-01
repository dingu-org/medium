// System-states kit — top-bar sync dot, banners, Today backdrop, lock-screen push, feed rows, danger card.
// v2 language (MT). Reuses kit.jsx (SheetBtn, Spinner, Sk, Banner, Toast, WhatsAppMark, Count, EmptyState).

// thin app banner (sits under the app bar)
const TopBanner = ({ tone = "muted", children }) => {
  const map = { muted: { bg: "#eef0f4", fg: "#6b7280", bd: MT.line }, error: { bg: MT.redTint, fg: MT.redInk, bd: "#f0d0cf" }, plain: { bg: "#fff", fg: MT.ink2, bd: MT.line } };
  const m = map[tone];
  return <div style={{ background: m.bg, borderBottom: `1px solid ${m.bd}`, padding: "9px 16px", fontSize: 12.5, color: m.fg, textAlign: "center", flexShrink: 0, lineHeight: 1.4 }}>{children}</div>;
};

// failed-mutation row (retry / remove)
const FailedRow = ({ title, error, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: _first ? "none" : "1px solid #f0d6d5" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: MT.redInk }}>{title}</div>
      {error && <div style={{ fontSize: 12, color: MT.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{error}</div>}
    </div>
    <button style={{ height: 30, padding: "0 12px", borderRadius: 8, border: `1px solid ${MT.line}`, background: "#fff", fontSize: 12.5, fontWeight: 600, color: MT.ink, cursor: "pointer" }}>Provo</button>
    <button style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "none", background: "transparent", fontSize: 12.5, fontWeight: 600, color: MT.ink3, cursor: "pointer" }}>Hiq</button>
  </div>
);

// top-bar with online/offline dot
const SysTopBar = ({ title = "Sot", sub, dot = "online" }) => (
  <header style={{ background: "#fff", padding: "12px 20px 14px", flexShrink: 0, borderBottom: `1px solid ${MT.sep}`, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 40 }}>
      <h1 style={{ fontFamily: MT.display, fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, margin: 0, lineHeight: 1.1 }}>{title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MT.ink3, fontWeight: 500 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: dot === "online" ? MT.green : MT.amber }} />{dot === "online" ? "Online" : "Offline"}
        </span>
        <BellButton dot />
      </div>
    </div>
    {sub && <div style={{ fontSize: 13, color: MT.ink3, marginTop: 1 }}>{sub}</div>}
  </header>
);

// compact Today backdrop to host banners in context
const TodayMini = ({ topBar, banner }) => (
  <Screen>
    {topBar}
    {banner}
    <Body>
      <SectionLabel>Më pas</SectionLabel>
      <div style={{ ...cardStyle, padding: "16px 18px", display: "flex", alignItems: "center", gap: 13, marginBottom: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 48 }}>
          <div style={{ fontFamily: MT.display, fontWeight: 600, fontSize: 26, color: MT.ink, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>10:00</div>
          <div style={{ fontSize: 11.5, color: MT.ink3, fontFamily: MT.mono, marginTop: 5 }}>45 min</div>
        </div>
        <div style={{ width: 3, alignSelf: "stretch", borderRadius: 999, background: MT.green }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16.5, fontWeight: 600, color: MT.ink, letterSpacing: "-0.01em" }}>Anila Hoxha</div>
          <div style={{ fontSize: 13.5, color: MT.ink2, marginTop: 3 }}>Konsultë e parë</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px", ...cardStyle }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: MT.brand, flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 14, color: MT.ink2 }}>Medium po menaxhon <span style={{ color: MT.ink, fontWeight: 600 }}>5 biseda</span></div>
        <Icon name="chevronRight" size={17} color="#c6ccd6" />
      </div>
    </Body>
    <Tabs active="today" />
  </Screen>
);

// app mark (M + sage dot)
const MMark = ({ size = 22, radius = 6 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx={radius * (40 / size)} fill="#1F5D86" /><path d="M11 27V13h2.4l4.1 7.6 4.1-7.6h2.4v14h-2.2v-9.5l-3.6 6.6h-1.4l-3.6-6.6V27H11Z" fill="#fff" /><circle cx="29.5" cy="13.5" r="1.6" fill="#7CC4A8" /></svg>
);

// iOS-style lock-screen push card
const PushCard = ({ title, body, time }) => (
  <div style={{ display: "flex", gap: 11, padding: "12px 14px", background: "rgba(255,255,255,0.86)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 18 }}>
    <div style={{ width: 38, height: 38, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}><MMark size={38} radius={9} /></div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0b0e14" }}>Medium</span>
        <span style={{ fontSize: 11.5, color: "rgba(11,14,20,0.5)" }}>{time}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0b0e14", marginTop: 2, letterSpacing: "-0.005em" }}>{title}</div>
      <div style={{ fontSize: 13, color: "rgba(11,14,20,0.72)", marginTop: 1, lineHeight: 1.4 }}>{body}</div>
    </div>
  </div>
);

// in-app notification feed row
const FEED_ICON = { booking: { i: "calendar", c: MT.brand, bg: MT.brandTint }, confirm: { i: "check", c: MT.green, bg: MT.greenTint }, cancel: { i: "x", c: MT.red, bg: MT.redTint }, reschedule: { i: "handoff", c: ORANGE, bg: ORANGE_TINT }, escalation: { i: "bell", c: MT.amber, bg: MT.amberTint }, disconnect: { i: "phone", c: MT.red, bg: MT.redTint } };
const FeedRow = ({ kind, title, time, unread, _first }) => {
  const m = FEED_ICON[kind];
  return (
    <div style={{ display: "flex", gap: 12, padding: "13px 16px", borderTop: _first ? "none" : `1px solid ${MT.sep}`, alignItems: "center", background: unread ? "#fbfcfe" : "transparent" }}>
      <div style={{ width: 34, height: 34, borderRadius: 999, background: m.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={m.i} size={17} color={m.c} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: MT.ink, fontWeight: unread ? 600 : 500, lineHeight: 1.4 }}>{title}</div>
        <div style={{ fontSize: 12, color: MT.ink3, marginTop: 2, fontFamily: MT.mono }}>{time}</div>
      </div>
      {unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: MT.brand, flexShrink: 0 }} />}
    </div>
  );
};

Object.assign(window, { TopBanner, FailedRow, SysTopBar, TodayMini, MMark, PushCard, FeedRow });
