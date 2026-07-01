// Auth kit — shell, logo, fields with states, Google button, primary button states.
// v2 language (MT), calm/blue/soft. Reuses kit.jsx (Spinner).

const LogoMark = ({ size = 46 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="11" fill="#1F5D86" /><path d="M11 27V13h2.4l4.1 7.6 4.1-7.6h2.4v14h-2.2v-9.5l-3.6 6.6h-1.4l-3.6-6.6V27H11Z" fill="#fff" /><circle cx="29.5" cy="13.5" r="1.8" fill="#7CC4A8" /></svg>
);

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" /><path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" /></svg>
);

const AuthShell = ({ children }) => (
  <div style={{ width: "100%", height: "100%", position: "relative", background: "#fff", overflow: "hidden", fontFamily: MT.sans }}>
    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 60% at 50% -6%, ${MT.brandTint}, rgba(255,255,255,0) 60%)`, pointerEvents: "none" }} />
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px 32px", overflowY: "auto" }}>{children}</div>
  </div>
);

const AuthHead = ({ title, sub }) => (
  <div style={{ marginBottom: 28 }}>
    <LogoMark size={46} />
    <h1 style={{ fontFamily: MT.display, fontSize: 29, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, margin: "24px 0 0", lineHeight: 1.12 }}>{title}</h1>
    <p style={{ fontSize: 14.5, color: MT.ink2, margin: "9px 0 0", lineHeight: 1.5 }}>{sub}</p>
  </div>
);

// field with default / focus / filled / error
const AField = ({ label, value, placeholder, type = "text", state = "default", hint, error }) => {
  const focused = state === "focus";
  const isErr = state === "error" || !!error;
  const bc = isErr ? MT.red : focused ? MT.brand : MT.line;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#303744", letterSpacing: "-0.005em" }}>{label}</label>
        {hint && <span style={{ fontSize: 12.5, color: MT.brand, fontWeight: 500 }}>{hint}</span>}
      </div>
      <div style={{ height: 50, padding: "0 16px", border: `1px solid ${bc}`, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, boxShadow: focused ? "0 0 0 3px rgba(31,93,134,0.16)" : isErr ? "0 0 0 3px rgba(179,50,43,0.12)" : "none", fontSize: 15.5 }}>
        {value
          ? (type === "password" ? <span style={{ letterSpacing: "0.16em", color: MT.ink }}>{"•".repeat(value.length)}</span> : <span style={{ color: MT.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>)
          : <span style={{ color: "#a4abb7" }}>{placeholder}</span>}
        {focused && !isErr && <span style={{ width: 2, height: 20, background: MT.brand, borderRadius: 2, flexShrink: 0 }} />}
        {isErr && <Icon name="x" size={17} color={MT.red} />}
      </div>
      {error && <span style={{ fontSize: 12, color: MT.red, lineHeight: 1.4 }}>{error}</span>}
    </div>
  );
};

// primary button — default / loading
const AuthBtn = ({ children, loading }) => (
  <button style={{ height: 50, width: "100%", borderRadius: 12, background: MT.brand, color: "#fff", border: "none", fontFamily: MT.sans, fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: "0 1px 2px rgba(15,20,32,0.1)", opacity: loading ? 0.92 : 1, marginTop: 4 }}>
    {loading && <Spinner size={17} color="#fff" />}{children}
  </button>
);

const GoogleBtn = ({ children, redirecting }) => (
  <button style={{ height: 50, width: "100%", borderRadius: 12, border: `1px solid ${MT.line}`, background: "#fff", color: "#303744", fontFamily: MT.sans, fontSize: 15, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
    {redirecting ? <Spinner size={16} color={MT.brand} /> : <GoogleG />}{children}
  </button>
);

const Or = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0" }}>
    <div style={{ height: 1, flex: 1, background: MT.line }} />
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.ink3 }}>ose</span>
    <div style={{ height: 1, flex: 1, background: MT.line }} />
  </div>
);

const AuthFoot = ({ q, a }) => (
  <p style={{ textAlign: "center", fontSize: 13.5, color: MT.ink2, marginTop: 26 }}>{q} <span style={{ color: MT.brand, fontWeight: 600 }}>{a}</span></p>
);

// info banner (confirm-email hint etc.)
const AuthBanner = ({ tone = "muted", icon, children }) => {
  const m = tone === "muted" ? { bg: "#f4f6f9", bd: MT.line, fg: MT.ink2, ic: MT.ink3 } : { bg: MT.brandTint, bd: "#cfe0ee", fg: MT.brandInk, ic: MT.brand };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: m.bg, border: `1px solid ${m.bd}`, borderRadius: 12, marginBottom: 22 }}>
      {icon && <Icon name={icon} size={17} color={m.ic} />}
      <div style={{ flex: 1, fontSize: 13, color: m.fg, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
};

Object.assign(window, { LogoMark, GoogleG, AuthShell, AuthHead, AField, AuthBtn, GoogleBtn, Or, AuthFoot, AuthBanner });
