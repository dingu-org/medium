// Medium v2 — shared HIG-flavored primitives. Pure Medium DS tokens.
// Grouped inset lists, large titles, calm semantic color. Attaches to window.
const MT = {
  bg: "#f2f3f6", card: "#ffffff",
  ink: "#0F1420", ink2: "#6b7280", ink3: "#9aa1ad",
  line: "#e6e9ee", sep: "#eef0f4",
  brand: "#1F5D86", brandTint: "#ecf3f9", brandInk: "#114063",
  green: "#2f8b5a", greenTint: "#ecf6f0", greenInk: "#246e47",
  amber: "#b97a08", amberTint: "#fcf4e6", amberInk: "#8c5c06",
  red: "#b3322b", redTint: "#fbecec", redInk: "#8a2622",
  sage: "#7CC4A8",
  // theme-driven (set by applyTheme; defaults = Calm + Blue + Soft)
  headerBg: "#ffffff", headerInk: "#0F1420", headerSub: "#9aa1ad",
  headerBtnBg: "transparent", headerBtnInk: "#4b5563",
  headerBorder: "1px solid #e6e9ee", headerShadow: "none",
  bodyBg: "#f2f3f6", grad: "linear-gradient(152deg, #2b73a4 0%, #1f5d86 50%, #184a6b 100%)",
  radius: 14, btnRadius: 12,
  display: '"Inter Tight", sans-serif', sans: "Inter, sans-serif", mono: '"JetBrains Mono", monospace',
};

// Accent palettes + atmospheres. applyTheme() mutates MT + cardStyle in place so
// the whole (re-rendering) tree re-themes live from tweak values.
const MT_ACCENTS = {
  blue:       { brand: "#1F5D86", brandTint: "#ecf3f9", brandInk: "#114063", grad: "linear-gradient(152deg,#2b73a4,#1f5d86,#184a6b)" },
  teal:       { brand: "#0f7d72", brandTint: "#e4f3f0", brandInk: "#0a564f", grad: "linear-gradient(152deg,#1aa093,#0f7d72,#0a5950)" },
  indigo:     { brand: "#4f46b8", brandTint: "#eeedfa", brandInk: "#352d7d", grad: "linear-gradient(152deg,#6a60d6,#4f46b8,#372f8c)" },
  terracotta: { brand: "#b0573a", brandTint: "#fbeee7", brandInk: "#823c26", grad: "linear-gradient(152deg,#cd7152,#b0573a,#8c422b)" },
};
function applyTheme(t) {
  const a = MT_ACCENTS[t.accent] || MT_ACCENTS.blue;
  MT.brand = a.brand; MT.brandTint = a.brandTint; MT.brandInk = a.brandInk; MT.grad = a.grad;

  if (t.atmosphere === "immersive") {
    Object.assign(MT, { headerBg: a.grad, headerInk: "#fff", headerSub: "rgba(255,255,255,0.74)",
      headerBtnBg: "rgba(255,255,255,0.16)", headerBtnInk: "#fff", headerBorder: "none",
      headerShadow: "0 14px 34px -22px rgba(15,30,45,0.85)", bodyBg: "linear-gradient(180deg,#e7eef7,#f0f5fb 34%,#f3f7fb)" });
  } else if (t.atmosphere === "solid") {
    Object.assign(MT, { headerBg: a.brand, headerInk: "#fff", headerSub: "rgba(255,255,255,0.78)",
      headerBtnBg: "rgba(255,255,255,0.18)", headerBtnInk: "#fff", headerBorder: "none",
      headerShadow: "0 8px 20px -16px rgba(15,30,45,0.7)", bodyBg: "#ffffff" });
  } else { // calm
    Object.assign(MT, { headerBg: "#ffffff", headerInk: "#0F1420", headerSub: "#9aa1ad",
      headerBtnBg: "transparent", headerBtnInk: "#4b5563", headerBorder: "1px solid #e6e9ee",
      headerShadow: "none", bodyBg: "#f2f3f6" });
  }

  const shape = { soft: [14, 12], crisp: [8, 8], round: [22, 999] }[t.shape] || [14, 12];
  MT.radius = shape[0]; MT.btnRadius = shape[1];
}
// borderRadius is a live getter so spreads/direct use read MT.radius fresh —
// React dev-mode freezes inline style objects, so we must never mutate this.
const cardStyle = { background: MT.card, get borderRadius() { return MT.radius; }, border: `1px solid ${MT.line}`, boxShadow: "0 1px 2px rgba(15,20,32,0.04)", overflow: "hidden" };

const SectionLabel = ({ children, style }) => (
  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: MT.ink3, padding: "0 6px 9px", ...style }}>{children}</div>
);

const Group = ({ title, footer, children, style }) => (
  <div style={{ marginBottom: 24, ...style }}>
    {title && <SectionLabel>{title}</SectionLabel>}
    <div style={{ ...cardStyle }}>
      {React.Children.map(children, (ch, i) => {
        if (!ch || !React.isValidElement(ch)) return ch;
        if (typeof ch.type === "string") return ch; // raw DOM child — don't inject component props
        return React.cloneElement(ch, { _first: i === 0 });
      })}
    </div>
    {footer && <div style={{ fontSize: 12.5, color: MT.ink3, padding: "9px 6px 0", lineHeight: 1.45 }}>{footer}</div>}
  </div>
);

const Row = ({ icon, iconColor, leading, title, titleWeight, subtitle, value, valueMono, accessory, chevron, danger, onPress, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", minHeight: 46, borderTop: _first ? "none" : `1px solid ${MT.sep}`, cursor: onPress ? "pointer" : "default" }}>
    {leading}
    {icon && <Icon name={icon} size={19} color={danger ? MT.red : (iconColor || "#5b6472")} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: titleWeight || 500, color: danger ? MT.red : MT.ink, letterSpacing: "-0.005em" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: MT.ink3, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
    </div>
    {value && <div style={{ fontSize: 14, color: MT.ink2, fontFamily: valueMono ? MT.mono : MT.sans, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{value}</div>}
    {accessory}
    {chevron && <Icon name="chevronRight" size={17} color="#c6ccd6" />}
  </div>
);

const Btn = ({ kind = "primary", children, icon, full, style }) => {
  const base = { height: 48, borderRadius: MT.btnRadius, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 18px", width: full ? "100%" : "auto", border: "none" };
  const kinds = {
    primary: { background: MT.brand, color: "#fff", boxShadow: "0 1px 2px rgba(15,20,32,0.10)" },
    secondary: { background: "#fff", color: MT.ink, border: `1px solid ${MT.line}` },
    tinted: { background: MT.brandTint, color: MT.brandInk },
    ghostDanger: { background: "transparent", color: MT.red },
  };
  return <button style={{ ...base, ...kinds[kind], ...style }}>{icon && <Icon name={icon} size={18} color={kind === "primary" ? "#fff" : (kind === "ghostDanger" ? MT.red : MT.brand)} />}{children}</button>;
};

const Avatar = ({ initials, size = 42, dot }) => (
  <div style={{ position: "relative", flexShrink: 0 }}>
    <div style={{ width: size, height: size, borderRadius: 999, background: MT.brandTint, color: MT.brandInk, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MT.display, fontWeight: 600, fontSize: size * 0.32, letterSpacing: "-0.01em" }}>{initials}</div>
    {dot && <span style={{ position: "absolute", right: -1, bottom: -1, width: 13, height: 13, borderRadius: 999, background: dot, border: "2.5px solid #fff" }} />}
  </div>
);

// who-is-handling chip: calm dot + label
const HandledBy = ({ who }) => {
  const m = who === "you"
    ? { c: MT.green, t: "Ti" }
    : who === "closed"
    ? { c: MT.ink3, t: "Mbyllur" }
    : { c: MT.brand, t: "Medium" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: m.c, flexShrink: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: m.c }} />{m.t}
    </span>
  );
};

const BellButton = ({ dot }) => (
  <button style={{ width: 40, height: 40, borderRadius: 999, background: MT.headerBtnBg, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
    <Icon name="bell" size={21} color={MT.headerBtnInk} />
    {dot && <span style={{ position: "absolute", top: 8, right: 9, width: 7, height: 7, borderRadius: 999, background: MT.amber, border: "2px solid #fff" }} />}
  </button>
);

const RoundBtn = ({ icon, color }) => (
  <button style={{ width: 40, height: 40, borderRadius: 999, background: MT.headerBtnBg, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
    <Icon name={icon} size={21} color={color || MT.headerBtnInk} />
  </button>
);

// Bottom tabs — generalized labels, calm. badge = items needing you.
const Tabs = ({ active = "today" }) => {
  const items = [
    { id: "today", label: "Sot", icon: "home" },
    { id: "calendar", label: "Kalendari", icon: "calendar" },
    { id: "chats", label: "Bisedat", icon: "message", badge: 1 },
    { id: "clients", label: "Klientët", icon: "users" },
    { id: "settings", label: "Ti", icon: "settings" },
  ];
  return (
    <nav style={{ display: "flex", alignItems: "stretch", background: "rgba(255,255,255,0.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: `1px solid ${MT.line}`, padding: "8px 8px 22px", flexShrink: 0 }}>
      {items.map((it) => {
        const a = active === it.id;
        return (
          <button key={it.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}>
            <div style={{ position: "relative" }}>
              <Icon name={it.icon} size={23} color={a ? MT.brand : "#9aa1ad"} strokeWidth={a ? 2 : 1.5} />
              {it.badge ? <span style={{ position: "absolute", top: -3, right: -7, minWidth: 15, height: 15, padding: "0 4px", background: MT.amber, color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{it.badge}</span> : null}
            </div>
            <span style={{ fontSize: 10, fontFamily: MT.sans, letterSpacing: "0.01em", color: a ? MT.brand : "#9aa1ad", fontWeight: a ? 600 : 500 }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

// Screen scaffold for top-level (scrolling body on grouped bg)
// Compact top bar for top-level screens — title + action on one row,
// optional thin subtitle below. Replaces the taller DS large-title app bar.
const TopBar = ({ title, sub, right }) => (
  <header style={{ background: MT.headerBg, padding: "12px 20px 14px", flexShrink: 0, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", borderBottom: MT.headerBorder, boxShadow: MT.headerShadow }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 130% at 86% -34%, rgba(255,255,255,0.16), rgba(255,255,255,0) 56%)", pointerEvents: "none", opacity: MT.headerInk === "#fff" ? 1 : 0 }} />
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 40 }}>
      <h1 style={{ fontFamily: MT.display, fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", color: MT.headerInk, margin: 0, lineHeight: 1.1 }}>{title}</h1>
      {right}
    </div>
    {sub && <div style={{ position: "relative", fontSize: 13, color: MT.headerSub, marginTop: 1, letterSpacing: "-0.005em" }}>{sub}</div>}
  </header>
);

// Pushed-screen nav bar — back + title + optional action. Title is
// absolutely centered with symmetric insets so it stays on the true
// screen center regardless of whether a right action is present.
const NavBar = ({ title, onBack, right }) => (
  <header style={{ position: "relative", background: MT.headerBg, borderBottom: MT.headerBorder, boxShadow: MT.headerShadow, flexShrink: 0, height: 52, display: "flex", alignItems: "center", padding: "0 10px", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 160% at 86% -50%, rgba(255,255,255,0.16), rgba(255,255,255,0) 58%)", pointerEvents: "none", opacity: MT.headerInk === "#fff" ? 1 : 0 }} />
    {onBack && (
      <button onClick={onBack} style={{ width: 40, height: 40, marginLeft: -2, background: "transparent", border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 999, zIndex: 1 }}>
        <Icon name="chevronLeft" size={24} color={MT.headerInk === "#fff" ? "#fff" : MT.brand} strokeWidth={2} />
      </button>
    )}
    <div style={{ position: "absolute", left: 52, right: 52, top: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <span style={{ fontFamily: MT.display, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color: MT.headerInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
    </div>
    <div style={{ marginLeft: "auto", zIndex: 1 }}>{right}</div>
  </header>
);

const Screen = ({ children }) => (
  <div style={{ width: "100%", height: "100%", background: MT.bodyBg, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: MT.sans }}>{children}</div>
);
const Body = ({ children, pad = "8px 20px 24px" }) => (
  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: pad }}>{children}</div>
);

Object.assign(window, { MT, applyTheme, cardStyle, SectionLabel, Group, Row, Btn, Avatar, HandledBy, BellButton, RoundBtn, Tabs, Screen, Body, TopBar, NavBar });
