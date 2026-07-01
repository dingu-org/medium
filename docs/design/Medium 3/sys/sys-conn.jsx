// System — connectivity & sync banners + PWA install prompts.

const OfflineState = () => (
  <TodayMini
    topBar={<SysTopBar dot="offline" sub="E mërkurë · 6 maj" />}
    banner={<TopBanner tone="muted">Je jashtë linje. Po shfaqen të dhënat e fundit. 2 ndryshime do të sinkronizohen kur të lidhesh.</TopBanner>}
  />
);

const PendingSync = () => (
  <TodayMini
    topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />}
    banner={<div style={{ background: "#eef0f4", borderBottom: `1px solid ${MT.line}`, padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexShrink: 0 }}><Spinner size={13} color={MT.ink3} width={1.6} /><span style={{ fontSize: 12.5, color: "#6b7280" }}>2 ndryshime presin sinkronizimin.</span></div>}
  />
);

const FailedSync = () => (
  <TodayMini
    topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />}
    banner={<div style={{ flexShrink: 0 }}>
      <TopBanner tone="error">2 ndryshime kërkojnë vëmendje.</TopBanner>
      <div style={{ background: "#fdf3f2" }}>
        <FailedRow _first title="Mesazhi nuk u sinkronizua" error="Dritarja 24-orëshe u mbyll" />
        <FailedRow title="Ndryshimi i takimit dështoi" error="Token-i i WhatsApp skadoi" />
      </div>
    </div>}
  />
);

const UpdateAvailable = () => (
  <TodayMini
    topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />}
    banner={<div style={{ background: "#fff", borderBottom: `1px solid ${MT.line}`, padding: "9px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexShrink: 0 }}>
      <span style={{ fontSize: 12.5, color: MT.ink2 }}>Version i ri i disponueshëm.</span>
      <button style={{ height: 30, padding: "0 12px", borderRadius: 8, border: `1px solid ${MT.line}`, background: "#fff", fontSize: 12.5, fontWeight: 600, color: MT.brand, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="arrowRight" size={14} color={MT.brand} />Rifresko</button>
    </div>}
  />
);

const ErrorState = () => (
  <Screen>
    <SysTopBar dot="offline" sub="E mërkurë · 6 maj" />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 32px", background: MT.bodyBg }}>
      <div style={{ width: 62, height: 62, borderRadius: 999, background: MT.redTint, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}><Icon name="x" size={28} color={MT.red} strokeWidth={2} /></div>
      <div style={{ fontFamily: MT.display, fontSize: 19, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>S'lidhet dot me serverin</div>
      <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 8, maxWidth: 260 }}>Kontrollo lidhjen e internetit dhe provo sërish.</div>
      <button style={{ marginTop: 20, height: 46, padding: "0 22px", background: MT.brand, color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="arrowRight" size={16} color="#fff" />Provo sërish</button>
    </div>
    <Tabs active="today" />
  </Screen>
);

// ── PWA install ──
const InstallStrip = ({ children, action }) => (
  <div style={{ background: "#fff", borderBottom: `1px solid ${MT.line}`, padding: "11px 16px", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
    <Icon name="arrowRight" size={0} color="transparent" />
    <div style={{ width: 30, height: 30, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}><MMark size={30} radius={8} /></div>
    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: MT.ink2, lineHeight: 1.4 }}>{children}</div>
    {action}
    <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}><Icon name="x" size={16} color={MT.ink3} /></button>
  </div>
);

const InstallAndroid = () => (
  <TodayMini
    topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />}
    banner={<InstallStrip action={<button style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: MT.brand, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Instalo</button>}>Instalo Medium për qasje më të shpejtë dhe njoftime.</InstallStrip>}
  />
);

const InstallIos = () => (
  <TodayMini
    topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />}
    banner={<InstallStrip action={<span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: "#eef0f4", flexShrink: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MT.brand} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg></span>}>Instalo nga Safari: prek <b style={{ color: MT.ink }}>Ndaj</b>, pastaj <b style={{ color: MT.ink }}>Shto në ekran</b>.</InstallStrip>}
  />
);

Object.assign(window, { OfflineState, PendingSync, FailedSync, UpdateAvailable, ErrorState, InstallAndroid, InstallIos });
