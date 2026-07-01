// Component-sheet kit — scaffolding + every component variant/state for handover.
// Locked look: calm / blue / soft (set in host before render). Reuses MT + v2 primitives.
// All exports attach to window so the per-section babel scripts can read them.

// ── one-time css: functional spin + calm skeleton shimmer ──
if (typeof document !== "undefined" && !document.getElementById("sheet-kit-css")) {
  const s = document.createElement("style");
  s.id = "sheet-kit-css";
  s.textContent = [
    "@keyframes sheetspin{to{transform:rotate(360deg)}}",
    "@keyframes sheetshimmer{0%{background-position:-180px 0}100%{background-position:180px 0}}",
    ".sk-shimmer{background:linear-gradient(90deg,#e9ecf1 0%,#f3f5f8 50%,#e9ecf1 100%);background-size:360px 100%;animation:sheetshimmer 1.4s ease-in-out infinite}",
  ].join("\n");
  document.head.appendChild(s);
}

// ── small color helper for button hover/press shades ──
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────── sheet scaffolding ───────────────────────────
// Each artboard hosts one Spec. Spec owns the card chrome itself so it fills
// the artboard edge-to-edge; the canvas card behind it is just a white rect.
const Spec = ({ name, purpose, bg = "#ffffff", pad = 22, gap = 22, children }) => (
  <div style={{ width: "100%", height: "100%", background: bg, fontFamily: MT.sans, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${MT.sep}`, flexShrink: 0, background: "#fff" }}>
      <div style={{ fontFamily: MT.display, fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", color: MT.ink }}>{name}</div>
      {purpose && <div style={{ fontSize: 12.5, color: MT.ink3, marginTop: 3, lineHeight: 1.45 }}>{purpose}</div>}
    </div>
    <div style={{ flex: 1, minHeight: 0, padding: pad, display: "flex", flexDirection: "column", gap, overflow: "hidden" }}>{children}</div>
  </div>
);

// labelled block within a Spec
const Block = ({ label, children, gap = 14, dir = "row", wrap = true, align = "flex-end" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {label && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.ink3 }}>{label}</div>}
    <div style={{ display: "flex", flexDirection: dir, gap, flexWrap: wrap ? "wrap" : "nowrap", alignItems: dir === "row" ? align : "stretch" }}>{children}</div>
  </div>
);

// component + tiny caption beneath
const Cell = ({ cap, children, grow }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-start", flex: grow ? 1 : "0 0 auto", minWidth: 0 }}>
    <div>{children}</div>
    {cap && <div style={{ fontSize: 10, color: MT.ink3, fontFamily: MT.mono, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{cap}</div>}
  </div>
);

const Spinner = ({ size = 18, color = "#fff", width = 2.2 }) => (
  <span style={{ width: size, height: size, borderRadius: 999, border: `${width}px solid ${color}40`, borderTopColor: color, display: "inline-block", animation: "sheetspin 0.7s linear infinite", flexShrink: 0 }} />
);

// ─────────────────────────── buttons ───────────────────────────
const SheetBtn = ({ kind = "primary", state = "default", icon, children, full, size = "md" }) => {
  const h = size === "sm" ? 36 : size === "lg" ? 50 : 48;
  const base = { height: h, borderRadius: MT.btnRadius, fontFamily: MT.sans, fontSize: size === "sm" ? 13 : 15, fontWeight: 600, letterSpacing: "-0.01em", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: size === "sm" ? "0 14px" : "0 18px", width: full ? "100%" : "auto", border: "none", transition: "none", position: "relative" };
  const ring = "0 0 0 3px rgba(31,93,134,0.18)";
  const looks = {
    primary: { bg: MT.brand, fg: "#fff", sh: "0 1px 2px rgba(15,20,32,0.10)", hoverBg: shade(MT.brand, 0.9), pressBg: shade(MT.brand, 0.82) },
    secondary: { bg: "#fff", fg: MT.ink, border: `1px solid ${MT.line}`, hoverBg: "#f5f6f8", pressBg: "#eceef2" },
    tinted: { bg: MT.brandTint, fg: MT.brandInk, hoverBg: "#e2edf6", pressBg: "#d6e5f1" },
    ghostDanger: { bg: "transparent", fg: MT.red, hoverBg: MT.redTint, pressBg: "#f6dfdf" },
  };
  const L = looks[kind];
  let bg = L.bg, sh = L.sh || "none", transform = "none";
  if (state === "hover") { bg = L.hoverBg; }
  if (state === "pressed") { bg = L.pressBg; if (kind === "primary") transform = "scale(0.99)"; }
  if (state === "focus") sh = (L.sh ? L.sh + ", " : "") + ring;
  const dim = state === "disabled" ? 0.4 : 1;
  const iconColor = kind === "primary" ? "#fff" : kind === "ghostDanger" ? MT.red : MT.brand;
  return (
    <button style={{ ...base, background: bg, color: L.fg, border: L.border, boxShadow: sh, transform, opacity: dim, cursor: state === "disabled" ? "not-allowed" : "pointer" }}>
      {state === "loading" ? <Spinner size={17} color={kind === "primary" ? "#fff" : MT.brand} /> : (icon && <Icon name={icon} size={size === "sm" ? 16 : 18} color={iconColor} />)}
      {children}
    </button>
  );
};

// ─────────────────────────── form controls ───────────────────────────
const TextField = ({ label, value, placeholder, type = "text", state = "default", hint, message }) => {
  const focused = state === "focus";
  const error = state === "error";
  const disabled = state === "disabled";
  const borderC = error ? MT.red : focused ? MT.brand : MT.line;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, width: 248, opacity: disabled ? 0.55 : 1 }}>
      {label && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#303744", letterSpacing: "-0.005em" }}>{label}</label>
          {hint && <span style={{ fontSize: 12.5, color: MT.brand, fontWeight: 500 }}>{hint}</span>}
        </div>
      )}
      <div style={{ height: 50, padding: "0 16px", border: `1px solid ${borderC}`, borderRadius: 12, background: disabled ? "#f5f6f8" : "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, boxShadow: focused ? "0 0 0 3px rgba(31,93,134,0.16)" : error ? "0 0 0 3px rgba(179,50,43,0.13)" : "none", fontSize: 15.5 }}>
        {value
          ? (type === "password" ? <span style={{ letterSpacing: "0.16em", color: MT.ink }}>{"•".repeat(value.length)}</span> : <span style={{ color: MT.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>)
          : <span style={{ color: "#a4abb7" }}>{placeholder}</span>}
        {error && <Icon name="x" size={17} color={MT.red} />}
        {focused && !error && <span style={{ width: 2, height: 20, background: MT.brand, borderRadius: 2, flexShrink: 0 }} />}
      </div>
      {message && <span style={{ fontSize: 12, color: error ? MT.red : MT.ink3, lineHeight: 1.4 }}>{message}</span>}
    </div>
  );
};

const TextArea = ({ label, value, placeholder, state = "default" }) => {
  const focused = state === "focus";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, width: 248 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: "#303744" }}>{label}</label>}
      <div style={{ minHeight: 88, padding: "12px 16px", border: `1px solid ${focused ? MT.brand : MT.line}`, borderRadius: 12, background: "#fff", boxShadow: focused ? "0 0 0 3px rgba(31,93,134,0.16)" : "none", fontSize: 14.5, lineHeight: 1.5, color: value ? MT.ink : "#a4abb7" }}>{value || placeholder}</div>
    </div>
  );
};

const SelectField = ({ label, value, open }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 7, width: 248 }}>
    {label && <label style={{ fontSize: 13, fontWeight: 600, color: "#303744" }}>{label}</label>}
    <div style={{ height: 50, padding: "0 14px 0 16px", border: `1px solid ${open ? MT.brand : MT.line}`, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: open ? "0 0 0 3px rgba(31,93,134,0.16)" : "none", fontSize: 15.5, color: MT.ink }}>
      {value}<Icon name="chevronDown" size={18} color={MT.ink3} />
    </div>
  </div>
);

const Checkbox = ({ checked, label, state = "default" }) => {
  const disabled = state === "disabled";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: disabled ? 0.45 : 1 }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, border: checked ? "none" : `1.5px solid ${state === "focus" ? MT.brand : "#c4cbd6"}`, background: checked ? MT.brand : "#fff", boxShadow: state === "focus" ? "0 0 0 3px rgba(31,93,134,0.18)" : "none", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <Icon name="check" size={15} color="#fff" strokeWidth={2.6} />}
      </span>
      {label && <span style={{ fontSize: 14.5, color: MT.ink }}>{label}</span>}
    </div>
  );
};

const Toggle = ({ on, disabled }) => (
  <div style={{ width: 44, height: 26, borderRadius: 999, background: on ? MT.brand : "#d4dae3", position: "relative", flexShrink: 0, opacity: disabled ? 0.45 : 1 }}>
    <div style={{ position: "absolute", top: 3, width: 20, height: 20, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(15,20,32,0.2)", transform: on ? "translateX(21px)" : "translateX(3px)" }} />
  </div>
);

const Seg = ({ options, value, w = 248 }) => (
  <div style={{ display: "flex", background: "#e8eaef", borderRadius: 10, padding: 3, gap: 2, width: w }}>
    {options.map((o) => {
      const on = o.k === value;
      return <div key={o.k} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 8, fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.005em", color: on ? MT.ink : MT.ink2, background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 2px rgba(15,20,32,0.10)" : "none" }}>{o.l}</div>;
    })}
  </div>
);

// ─────────────────────────── badges & status ───────────────────────────
const STATUS = {
  confirmed: { label: "Konfirmuar", bg: MT.greenTint, fg: MT.greenInk, dot: MT.green },
  pending: { label: "Në pritje", bg: MT.amberTint, fg: MT.amberInk, dot: MT.amber },
  noresp: { label: "Pa përgjigje", bg: "#eef0f4", fg: "#4b5563", dot: "#8d95a3" },
  cancelled: { label: "Anuluar", bg: MT.redTint, fg: MT.redInk, dot: MT.red },
};
const StatusPill = ({ status }) => {
  const s = STATUS[status] || STATUS.pending;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px 3px 7px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 500, lineHeight: 1.4 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: s.dot }} />{s.label}</span>;
};

const WhatsAppMark = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.15c-.24.68-1.42 1.31-1.95 1.36-.5.05-1.13.2-3.7-.78-3.12-1.23-5.13-4.37-5.28-4.57-.15-.2-1.25-1.66-1.25-3.16s.79-2.24 1.07-2.55c.28-.31.61-.38.81-.38.2 0 .41.01.59.02.19.01.44-.07.69.53.24.6.83 2.07.9 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.45.53-.15.15-.3.31-.13.61.17.3.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.36 1.45.3.15.47.12.65-.07.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.72.81 2.01.96.3.15.5.22.57.35.07.13.07.73-.17 1.41Z"/></svg>
);

const ChannelChip = ({ channel = "whatsapp", state = "connected" }) => {
  const map = {
    connected: { dot: MT.green, label: "I lidhur", fg: MT.greenInk, bg: MT.greenTint },
    reconnect: { dot: MT.red, label: "Rilidh", fg: MT.redInk, bg: MT.redTint },
    soon: { dot: "#c2c8d2", label: "Së shpejti", fg: "#6b7280", bg: "#eef0f4" },
    pending: { dot: MT.amber, label: "Po lidhet", fg: MT.amberInk, bg: MT.amberTint },
  };
  const m = map[state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px 5px 8px", borderRadius: 999, background: m.bg, fontSize: 12, fontWeight: 500, color: m.fg }}>
      <WhatsAppMark size={15} />
      <span style={{ width: 1, height: 12, background: "rgba(0,0,0,0.1)" }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: m.dot }} />{m.label}</span>
    </span>
  );
};

const Count = ({ n, tone = "brand" }) => {
  const bg = tone === "brand" ? MT.brand : tone === "amber" ? MT.amber : MT.red;
  return <span style={{ background: bg, color: "#fff", fontSize: 11, fontWeight: 600, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>{n}</span>;
};

const KwTag = ({ children }) => (
  <span style={{ fontFamily: MT.mono, fontSize: 11.5, fontWeight: 500, color: MT.brandInk, background: MT.brandTint, padding: "3px 7px", borderRadius: 6, letterSpacing: "0.02em" }}>{children}</span>
);

// ─────────────────────────── feedback ───────────────────────────
const Banner = ({ tone = "info", icon, title, text, action }) => {
  const map = {
    info: { bg: MT.brandTint, bd: "#cfe0ee", fg: MT.brandInk, ic: MT.brand },
    success: { bg: MT.greenTint, bd: "#cfe7d9", fg: MT.greenInk, ic: MT.green },
    warning: { bg: MT.amberTint, bd: "#f0e0bd", fg: MT.amberInk, ic: MT.amber },
    danger: { bg: MT.redTint, bd: "#f0d0cf", fg: MT.redInk, ic: MT.red },
  };
  const m = map[tone];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px", background: m.bg, border: `1px solid ${m.bd}`, borderRadius: 12, width: 300 }}>
      {icon && <Icon name={icon} size={18} color={m.ic} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: m.fg, letterSpacing: "-0.005em" }}>{title}</div>
        {text && <div style={{ fontSize: 12.5, color: m.fg, opacity: 0.82, marginTop: 2, lineHeight: 1.45 }}>{text}</div>}
        {action && <div style={{ fontSize: 13, fontWeight: 600, color: m.ic, marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
};

const Toast = ({ tone = "neutral", icon, text }) => {
  const ic = tone === "success" ? MT.green : tone === "danger" ? MT.red : "#fff";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#1b2230", borderRadius: 12, boxShadow: "0 10px 30px -10px rgba(15,20,32,0.5)", width: 300 }}>
      {icon && <Icon name={icon} size={18} color={ic} />}
      <span style={{ flex: 1, fontSize: 13.5, color: "#fff", fontWeight: 500 }}>{text}</span>
    </div>
  );
};

const EmptyState = ({ icon, title, text, action }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "26px 24px", gap: 4 }}>
    <div style={{ width: 56, height: 56, borderRadius: 999, background: "#eef1f5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
      <Icon name={icon} size={26} color="#9aa1ad" />
    </div>
    <div style={{ fontFamily: MT.display, fontSize: 16, fontWeight: 600, color: MT.ink, letterSpacing: "-0.01em" }}>{title}</div>
    {text && <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, maxWidth: 240 }}>{text}</div>}
    {action && <div style={{ marginTop: 12 }}>{action}</div>}
  </div>
);

// skeletons
const Sk = ({ w = "100%", h = 12, r = 6, style }) => (
  <span className="sk-shimmer" style={{ display: "block", width: w, height: h, borderRadius: r, ...style }} />
);
const SkeletonRow = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px" }}>
    <Sk w={44} h={44} r={999} />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
      <Sk w="54%" h={12} />
      <Sk w="78%" h={10} />
    </div>
    <Sk w={40} h={18} r={999} />
  </div>
);

const Dialog = ({ title, body, primary, secondary, destructive }) => (
  <div style={{ width: 300, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px -16px rgba(15,20,32,0.4)", overflow: "hidden" }}>
    <div style={{ padding: "22px 22px 18px", textAlign: "center" }}>
      <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>{title}</div>
      {body && <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 8 }}>{body}</div>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 18px 18px" }}>
      {destructive
        ? <button style={{ height: 48, borderRadius: MT.btnRadius, border: "none", background: MT.red, color: "#fff", fontFamily: MT.sans, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer", boxShadow: "0 1px 2px rgba(15,20,32,0.10)" }}>{primary}</button>
        : <SheetBtn kind="primary" full>{primary}</SheetBtn>}
      <SheetBtn kind="secondary" full>{secondary}</SheetBtn>
    </div>
  </div>
);

Object.assign(window, {
  shade, Spec, Block, Cell, Spinner, SheetBtn, TextField, TextArea, SelectField,
  Checkbox, Toggle, Seg, StatusPill, WhatsAppMark, ChannelChip, Count, KwTag,
  Banner, Toast, EmptyState, Sk, SkeletonRow, Dialog,
});
