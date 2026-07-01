// System — push permission, lock-screen notifications, in-app feed, operational banners, toasts.

// push-permission rationale (pre-prompt sheet over Today)
const PushPermission = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", fontFamily: MT.sans }}>
    <div style={{ position: "absolute", inset: 0 }}><TodayMini topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />} /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,20,32,0.4)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: "0 -10px 40px -8px rgba(15,20,32,0.3)", padding: "10px 24px 28px" }}>
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 18 }}><div style={{ width: 38, height: 5, borderRadius: 999, background: "#dfe3ea" }} /></div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}><div style={{ width: 60, height: 60, borderRadius: 16, background: MT.brandTint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="bell" size={28} color={MT.brand} /></div></div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: MT.display, fontSize: 21, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Lejo njoftimet</div>
        <div style={{ fontSize: 14.5, color: MT.ink2, lineHeight: 1.5, marginTop: 9, padding: "0 6px" }}>Të njoftojmë vetëm kur ka rëndësi — rezervim i ri, anulim, ose kur një pacient të kërkon ty.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
        <button style={{ height: 50, background: MT.brand, color: "#fff", border: "none", borderRadius: 12, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 2px rgba(15,20,32,0.1)" }}>Lejo njoftimet</button>
        <button style={{ height: 50, background: "transparent", color: MT.ink2, border: "none", fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Jo tani</button>
      </div>
    </div>
  </div>
);

// iOS lock-screen with stacked Web Push notifications
const LockScreen = () => (
  <div style={{ width: "100%", height: "100%", background: "linear-gradient(165deg,#1a2740,#0f1726 55%,#0a0f1a)", display: "flex", flexDirection: "column", fontFamily: MT.sans, overflow: "hidden", position: "relative" }}>
    <div style={{ textAlign: "center", color: "#fff", paddingTop: 52 }}>
      <div style={{ fontSize: 15, fontWeight: 500, opacity: 0.85, letterSpacing: "0.01em" }}>E mërkurë, 6 maj</div>
      <div style={{ fontFamily: MT.display, fontSize: 76, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 4 }}>9:41</div>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 9, padding: "0 12px 26px" }}>
      <PushCard title="Eskalim — Dritan Sopa" body="Pacienti kërkoi të flasë me një person." time="tani" />
      <PushCard title="Rezervim i ri" body="Anila Hoxha — e mërkurë 10:00, Konsultë e parë." time="2 min" />
      <PushCard title="Anulim" body="Mira Beqiri anuloi seancën e së hënës." time="14 min" />
      <PushCard title="Ricaktim i kërkuar" body="Vera Lleshi do një orar tjetër për të premten." time="1 orë" />
    </div>
  </div>
);

// in-app notification feed (bell sheet)
const FeedScreen = () => (
  <Screen>
    <NavBar onBack={() => {}} title="Njoftimet" right={<span style={{ fontSize: 13, color: MT.brand, fontWeight: 600 }}>Lexo të gjitha</span>} />
    <Body pad="14px 20px 24px">
      <Group title="E re">
        <FeedRow _first kind="escalation" title="Dritan Sopa kërkoi të flasë me ty." time="tani" unread />
        <FeedRow kind="booking" title="Rezervim i ri — Anila Hoxha, e mërkurë 10:00." time="2 min" unread />
      </Group>
      <Group title="Më herët">
        <FeedRow _first kind="confirm" title="Anila Hoxha konfirmoi për të mërkurën 10:00." time="dje 18:20" />
        <FeedRow kind="reschedule" title="Vera Lleshi kërkoi ricaktim." time="dje 14:30" />
        <FeedRow kind="cancel" title="Mira Beqiri anuloi seancën e së hënës." time="2 ditë" />
        <FeedRow kind="disconnect" title="WhatsApp u shkëput — kërkohet rilidhje." time="3 ditë" />
      </Group>
      <div style={{ textAlign: "center", fontSize: 12.5, color: MT.ink3, padding: "4px 0 8px" }}>Nuk ka njoftime të tjera.</div>
    </Body>
  </Screen>
);

const FeedEmpty = () => (
  <Screen>
    <NavBar onBack={() => {}} title="Njoftimet" />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 32px", background: MT.bodyBg }}>
      <div style={{ width: 60, height: 60, borderRadius: 999, background: "#eef1f5", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Icon name="bell" size={28} color="#9aa1ad" /></div>
      <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Asnjë njoftim ende</div>
      <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 7, maxWidth: 250 }}>Rezervimet, anulimet dhe sinjalizimet do të shfaqen këtu.</div>
    </div>
  </Screen>
);

// operational banners (risk list) — reconnect WhatsApp + template rejected, in context
const OpsBanners = () => (
  <Screen>
    <SysTopBar dot="online" sub="E mërkurë · 6 maj" />
    <Body pad="16px 20px 24px">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 14px", background: MT.redTint, border: "1px solid #f0d0cf", borderRadius: 12 }}>
          <Icon name="phone" size={18} color={MT.red} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: MT.redInk }}>Rilidh WhatsApp</div><div style={{ fontSize: 12.5, color: MT.redInk, opacity: 0.82, marginTop: 2, lineHeight: 1.45 }}>Lidhja skadoi. Pacientët nuk po marrin përgjigje.</div><div style={{ fontSize: 13, fontWeight: 600, color: MT.red, marginTop: 8 }}>Rilidh tani →</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 14px", background: MT.amberTint, border: "1px solid #f0e0bd", borderRadius: 12 }}>
          <Icon name="x" size={18} color={MT.amber} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: MT.amberInk }}>Shablloni u refuzua nga Meta</div><div style={{ fontSize: 12.5, color: MT.amberInk, opacity: 0.85, marginTop: 2, lineHeight: 1.45 }}>Kujtesat 24-orëshe janë në pauzë derisa ta rregullosh.</div><div style={{ fontSize: 13, fontWeight: 600, color: MT.amberInk, marginTop: 8 }}>Shiko arsyen →</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "13px 14px", background: MT.brandTint, border: "1px solid #cfe0ee", borderRadius: 12 }}>
          <Icon name="sparkle" size={18} color={MT.brand} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: MT.brandInk }}>180 / 250 mesazhe sot</div><div style={{ fontSize: 12.5, color: MT.brandInk, opacity: 0.82, marginTop: 2, lineHeight: 1.45 }}>Po i afrohesh kufirit ditor të Meta-s (Tier 1).</div></div>
        </div>
      </div>
    </Body>
    <Tabs active="today" />
  </Screen>
);

// toast collection over a backdrop
const ToastStack = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0 }}><TodayMini topBar={<SysTopBar dot="online" sub="E mërkurë · 6 maj" />} /></div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,20,32,0.18)" }} />
    <div style={{ position: "absolute", left: 16, right: 16, bottom: 90, display: "flex", flexDirection: "column", gap: 10 }}>
      <Toast tone="success" icon="check" text="Takimi u rezervua." />
      <Toast tone="neutral" icon="clock" text="Ndryshimi u sinkronizua." />
      <Toast tone="danger" icon="x" text="Një ndryshim kërkon vëmendje." />
    </div>
  </div>
);

Object.assign(window, { PushPermission, LockScreen, FeedScreen, FeedEmpty, OpsBanners, ToastStack });
