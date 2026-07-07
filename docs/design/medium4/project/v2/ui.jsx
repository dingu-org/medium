// Medium v2 — shared primitives, "New direction" language (Variant B — Manrope).
// Vivid royal blue, borderless big-radius cards on warm gray canvas, black pill
// dock, circular buttons, diagonal hatch texture. Attaches to window.
const MT = {
  bg: "#f3f3f0", card: "#ffffff",
  ink: "#0C0D12", ink2: "#5E6572", ink3: "#9CA2AE",
  line: "#e7e7e2", sep: "#f0f0ec", sunken: "#f6f6f3",
  brand: "#3B5BFE", brandTint: "#EAEEFF", brandInk: "#2A41C9",
  green: "#17A45D", greenTint: "#E6F5EC", greenInk: "#0F7A43",
  amber: "#DE930B", amberTint: "#FBF1DC", amberInk: "#9C6707",
  red: "#D5453C", redTint: "#FBEAE9", redInk: "#A93129",
  sage: "#7CC4A8", dock: "#0C0D12",
  // theme-driven (set by applyTheme; defaults = Calm + Blue + Soft)
  headerBg: "transparent", headerInk: "#0C0D12", headerSub: "#9CA2AE",
  headerBtnBg: "#ffffff", headerBtnInk: "#0C0D12",
  headerBorder: "none", headerShadow: "none",
  bodyBg: "#f3f3f0", grad: "linear-gradient(152deg, #5B78FF 0%, #3B5BFE 50%, #2A41C9 100%)",
  radius: 26, btnRadius: 999,
  display: '"Manrope", sans-serif', sans: '"Manrope", sans-serif', mono: '"JetBrains Mono", monospace',
};

// Soft ambient elevation — borderless cards live on shadow, not hairlines.
const MT_SH = "0 1px 2px rgba(12,13,18,0.03), 0 10px 30px -18px rgba(12,13,18,0.14)";
const MT_SH_FLOAT = "0 2px 4px rgba(12,13,18,0.04), 0 24px 48px -20px rgba(12,13,18,0.22)";

// Diagonal hatch — free slots, progress remainders.
const hatch = (color = "rgba(12,13,18,0.13)", gap = 6.5) =>
  `repeating-linear-gradient(135deg, ${color} 0, ${color} 1.5px, transparent 1.5px, transparent ${gap}px)`;

// Accent palettes + atmospheres. applyTheme() mutates MT + cardStyle in place so
// the whole (re-rendering) tree re-themes live from tweak values.
const MT_ACCENTS = {
  blue:       { brand: "#3B5BFE", brandTint: "#EAEEFF", brandInk: "#2A41C9", grad: "linear-gradient(152deg,#5B78FF,#3B5BFE,#2A41C9)" },
  teal:       { brand: "#0f9184", brandTint: "#e2f4f1", brandInk: "#0a655c", grad: "linear-gradient(152deg,#1db3a4,#0f9184,#0a655c)" },
  indigo:     { brand: "#5b50d6", brandTint: "#edecfb", brandInk: "#3d34a0", grad: "linear-gradient(152deg,#7a70e8,#5b50d6,#4239ae)" },
  terracotta: { brand: "#c2603e", brandTint: "#fbeee7", brandInk: "#8f4128", grad: "linear-gradient(152deg,#d97b58,#c2603e,#9a4a2e)" },
};
function applyTheme(t) {
  const a = MT_ACCENTS[t.accent] || MT_ACCENTS.blue;
  MT.brand = a.brand; MT.brandTint = a.brandTint; MT.brandInk = a.brandInk; MT.grad = a.grad;

  if (t.atmosphere === "immersive") {
    Object.assign(MT, { headerBg: a.grad, headerInk: "#fff", headerSub: "rgba(255,255,255,0.74)",
      headerBtnBg: "rgba(255,255,255,0.18)", headerBtnInk: "#fff", headerBorder: "none",
      headerShadow: "0 14px 34px -22px rgba(12,13,18,0.7)", bodyBg: "#f3f3f0" });
  } else if (t.atmosphere === "solid") {
    Object.assign(MT, { headerBg: a.brand, headerInk: "#fff", headerSub: "rgba(255,255,255,0.78)",
      headerBtnBg: "rgba(255,255,255,0.18)", headerBtnInk: "#fff", headerBorder: "none",
      headerShadow: "0 8px 20px -16px rgba(12,13,18,0.6)", bodyBg: "#ffffff" });
  } else { // calm — canvas header, white circle buttons
    Object.assign(MT, { headerBg: "transparent", headerInk: "#0C0D12", headerSub: "#9CA2AE",
      headerBtnBg: "#ffffff", headerBtnInk: "#0C0D12", headerBorder: "none",
      headerShadow: "none", bodyBg: "#f3f3f0" });
  }

  const shape = { soft: [26, 999], crisp: [16, 14], round: [30, 999] }[t.shape] || [26, 999];
  MT.radius = shape[0]; MT.btnRadius = shape[1];
}
// borderRadius is a live getter so spreads/direct use read MT.radius fresh —
// React dev-mode freezes inline style objects, so we must never mutate this.
const cardStyle = { background: MT.card, get borderRadius() { return MT.radius; }, border: "none", boxShadow: MT_SH, overflow: "hidden" };

const SectionLabel = ({ children, style }) => (
  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: MT.ink3, padding: "0 8px 9px", ...style }}>{children}</div>
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
    {footer && <div style={{ fontSize: 12.5, color: MT.ink3, padding: "9px 8px 0", lineHeight: 1.45 }}>{footer}</div>}
  </div>
);

const Row = ({ icon, iconColor, leading, title, titleWeight, subtitle, value, valueMono, accessory, chevron, danger, onPress, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 18px", minHeight: 46, borderTop: _first ? "none" : `1px solid ${MT.sep}`, cursor: onPress ? "pointer" : "default" }}>
    {leading}
    {icon && <Icon name={icon} size={19} color={danger ? MT.red : (iconColor || "#6a7080")} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: titleWeight || 600, color: danger ? MT.red : MT.ink, letterSpacing: "-0.005em" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: MT.ink3, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
    </div>
    {value && <div style={{ fontSize: 14, color: MT.ink2, fontFamily: valueMono ? MT.mono : MT.sans, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{value}</div>}
    {accessory}
    {chevron && <Icon name="chevronRight" size={17} color="#c6ccd6" />}
  </div>
);

const Btn = ({ kind = "primary", children, icon, full, style }) => {
  const base = { height: 48, borderRadius: MT.btnRadius, fontFamily: MT.sans, fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 20px", width: full ? "100%" : "auto", border: "none", whiteSpace: "nowrap", flexShrink: 0 };
  const kinds = {
    primary: { background: MT.brand, color: "#fff", boxShadow: "0 10px 24px -12px rgba(59,91,254,0.5)" },
    secondary: { background: "#fff", color: MT.ink, boxShadow: MT_SH },
    tinted: { background: MT.brandTint, color: MT.brandInk },
    dark: { background: MT.dock, color: "#fff" },
    ghostDanger: { background: "transparent", color: MT.red },
  };
  return <button style={{ ...base, ...kinds[kind], ...style }}>{icon && <Icon name={icon} size={18} color={kind === "primary" || kind === "dark" ? "#fff" : (kind === "ghostDanger" ? MT.red : MT.brand)} />}{children}</button>;
};

const Avatar = ({ initials, size = 42, dot }) => (
  <div style={{ position: "relative", flexShrink: 0 }}>
    <div style={{ width: size, height: size, borderRadius: 999, background: MT.brandTint, color: MT.brandInk, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MT.display, fontWeight: 700, fontSize: size * 0.32, letterSpacing: "-0.01em" }}>{initials}</div>
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: m.c, flexShrink: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: m.c }} />{m.t}
    </span>
  );
};

const BellButton = ({ dot }) => (
  <button style={{ width: 44, height: 44, borderRadius: 999, background: MT.headerBtnBg, border: "none", boxShadow: MT.headerBtnBg === "#ffffff" ? MT_SH : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", flexShrink: 0 }}>
    <Icon name="bell" size={20} color={MT.headerBtnInk} strokeWidth={1.7} />
    {dot && <span style={{ position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 999, background: MT.brand, border: "2px solid #fff" }} />}
  </button>
);

const RoundBtn = ({ icon, color }) => (
  <button style={{ width: 44, height: 44, borderRadius: 999, background: MT.headerBtnBg, border: "none", boxShadow: MT.headerBtnBg === "#ffffff" ? MT_SH : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
    <Icon name={icon} size={20} color={color || MT.headerBtnInk} strokeWidth={1.7} />
  </button>
);

// Bottom nav — floating black pill dock, icon-only circular targets.
const Tabs = ({ active = "today" }) => {
  const items = [
    { id: "today", icon: "home", label: "Sot" },
    { id: "calendar", icon: "calendar", label: "Kalendari" },
    { id: "chats", icon: "message", label: "Bisedat", badge: true },
    { id: "clients", icon: "users", label: "Klientët" },
    { id: "settings", icon: "settings", label: "Ti" },
  ];
  return (
    <div style={{ padding: "8px 14px 16px", flexShrink: 0, background: "transparent" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: MT.dock, borderRadius: 999, padding: 6, boxShadow: "0 18px 40px -18px rgba(12,13,18,0.55)" }}>
        {items.map((it) => {
          const a = active === it.id;
          return (
            <button key={it.id} aria-label={it.label} style={{ width: 52, height: 52, borderRadius: 999, background: a ? MT.brand : "transparent", border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", padding: 0 }}>
              <Icon name={it.icon} size={22} color={a ? "#fff" : "rgba(255,255,255,0.66)"} strokeWidth={a ? 1.9 : 1.6} />
              {it.badge && !a ? <span style={{ position: "absolute", top: 11, right: 11, width: 7, height: 7, borderRadius: 999, background: MT.brand, border: `2px solid ${MT.dock}` }} /> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

// Screen scaffold for top-level (scrolling body on canvas bg)
// Canvas-colored top bar — big rounded title + white circle actions.
const TopBar = ({ title, sub, right }) => (
  <header style={{ background: MT.headerBg, padding: "14px 16px 12px", flexShrink: 0, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", borderBottom: MT.headerBorder === "none" ? "none" : MT.headerBorder, boxShadow: MT.headerShadow }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 130% at 86% -34%, rgba(255,255,255,0.16), rgba(255,255,255,0) 56%)", pointerEvents: "none", opacity: MT.headerInk === "#fff" ? 1 : 0 }} />
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
      <h1 style={{ fontFamily: MT.display, fontSize: 27, fontWeight: 700, letterSpacing: "-0.025em", color: MT.headerInk, margin: 0, lineHeight: 1.1 }}>{title}</h1>
      {right}
    </div>
    {sub && <div style={{ position: "relative", fontSize: 13.5, color: MT.headerSub, marginTop: 2, letterSpacing: "-0.005em" }}>{sub}</div>}
  </header>
);

// Pushed-screen nav bar — white circle back button on canvas, centered title.
const NavBar = ({ title, onBack, right }) => (
  <header style={{ position: "relative", background: MT.headerBg, borderBottom: MT.headerBorder === "none" ? "none" : MT.headerBorder, boxShadow: MT.headerShadow, flexShrink: 0, height: 60, display: "flex", alignItems: "center", padding: "0 16px", overflow: "visible" }}>
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 160% at 86% -50%, rgba(255,255,255,0.16), rgba(255,255,255,0) 58%)", pointerEvents: "none", opacity: MT.headerInk === "#fff" ? 1 : 0 }} />
    {onBack && (
      <button onClick={onBack} style={{ width: 44, height: 44, background: MT.headerInk === "#fff" ? "rgba(255,255,255,0.18)" : "#ffffff", boxShadow: MT.headerInk === "#fff" ? "none" : MT_SH, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 999, zIndex: 1, flexShrink: 0 }}>
        <Icon name="chevronLeft" size={22} color={MT.headerInk === "#fff" ? "#fff" : MT.ink} strokeWidth={1.9} />
      </button>
    )}
    <div style={{ position: "absolute", left: 60, right: 60, top: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <span style={{ fontFamily: MT.display, fontSize: 17, fontWeight: 700, letterSpacing: "-0.015em", color: MT.headerInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
    </div>
    <div style={{ marginLeft: "auto", zIndex: 1 }}>{right}</div>
  </header>
);

const Screen = ({ children }) => (
  <div style={{ width: "100%", height: "100%", background: MT.bodyBg, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: MT.sans }}>{children}</div>
);
const Body = ({ children, pad = "8px 16px 24px" }) => (
  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: pad }}>{children}</div>
);

Object.assign(window, { MT, MT_SH, MT_SH_FLOAT, hatch, applyTheme, cardStyle, SectionLabel, Group, Row, Btn, Avatar, HandledBy, BellButton, RoundBtn, Tabs, Screen, Body, TopBar, NavBar });
