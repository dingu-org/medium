// Sheet sections — Navigation chrome + Feedback (banners, toasts, empty, loading, dialogs).

const FakeStatusBar = () => (
  <div style={{ height: 26, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", background: "inherit" }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: MT.headerInk, fontFamily: MT.sans }}>9:41</span>
    <span style={{ fontSize: 11, color: MT.headerInk }}>● ● ●</span>
  </div>
);

const Chrome = ({ children, w = 340 }) => (
  <div style={{ width: w, borderRadius: 18, overflow: "hidden", border: `1px solid ${MT.line}`, boxShadow: "0 1px 2px rgba(15,20,32,0.04)" }}>{children}</div>
);

const NavSpec = () => (
  <Spec name="App bars" purpose="Large title on top-level destinations; centered title + back chevron on pushed detail views.">
    <Block label="Large title" dir="column" align="stretch">
      <Chrome><TopBar title="Sot" sub="E mërkurë · 6 maj" right={<BellButton dot />} /></Chrome>
    </Block>
    <Block label="Pushed · back + action" dir="column" align="stretch">
      <Chrome><NavBar onBack={() => {}} title="Endi Kola" right={<RoundBtn icon="phone" />} /></Chrome>
    </Block>
    <Block label="Pushed · title only" dir="column" align="stretch">
      <Chrome><NavBar onBack={() => {}} title="Detajet e takimit" /></Chrome>
    </Block>
  </Spec>
);

const TabsSpec = () => (
  <Spec name="Bottom tabs" purpose="The spine of the app. 5 tabs, active tint is brand, unread rides the icon as a dot." bg="#f2f3f6">
    <Block label="Active · Sot" dir="column" align="stretch">
      <div style={{ width: 340, borderRadius: 16, overflow: "hidden", border: `1px solid ${MT.line}`, background: "#fff" }}><Tabs active="today" /></div>
    </Block>
    <Block label="Active · Bisedat (unread badge)" dir="column" align="stretch">
      <div style={{ width: 340, borderRadius: 16, overflow: "hidden", border: `1px solid ${MT.line}`, background: "#fff" }}><Tabs active="chats" /></div>
    </Block>
  </Spec>
);

// ─────────────────────────── Feedback ───────────────────────────
const BannersSpec = () => (
  <Spec name="Banners" purpose="Persistent in-context status. Reconnect-WhatsApp and template-rejected are the two operational ones from the risk list.">
    <Block label="Tones" dir="column" gap={12} align="stretch">
      <Banner tone="success" icon="check" title="Takimi u rezervua" text="Anila Hoxha · e mërkurë 10:00." />
      <Banner tone="info" icon="sparkle" title="Medium po menaxhon 4 biseda" text="Do të të njoftojë kur duhesh ti." />
      <Banner tone="warning" icon="phone" title="Rilidh WhatsApp" text="Lidhja skadoi. Pacientët nuk marrin përgjigje." action="Rilidh tani →" />
      <Banner tone="danger" icon="x" title="Shablloni u refuzua nga Meta" text="Kujtesat 24-orëshe janë në pauzë." action="Shiko arsyen →" />
    </Block>
  </Spec>
);

const ToastEmptySpec = () => (
  <Spec name="Toasts & empty states" purpose="Toasts are transient confirmation. Empty states are one muted icon, one line, one action." bg="#f2f3f6">
    <Block label="Toasts" dir="column" gap={10} align="stretch">
      <Toast tone="success" icon="check" text="Mesazhi u dërgua." />
      <Toast tone="danger" icon="x" text="Dërgimi dështoi. Provo sërish." />
    </Block>
    <Block label="Empty states" gap={12}>
      <div style={{ ...cardStyle, width: 290 }}><EmptyState icon="calendar" title="Asnjë takim sot" text="Dita është e lirë. Shiko javën që vjen." action={<SheetBtn kind="tinted" size="sm">Shiko javën</SheetBtn>} /></div>
    </Block>
    <Block gap={12}>
      <div style={{ ...cardStyle, width: 290 }}><EmptyState icon="message" title="Asnjë bisedë aktive" text="Kur një pacient shkruan, do ta shohësh këtu." /></div>
    </Block>
  </Spec>
);

const LoadingSpec = () => (
  <Spec name="Loading & skeletons" purpose="Calm shimmer mirrors the real layout. Spinner only inside actions; never a full-screen blocker after first load." bg="#f2f3f6">
    <Block label="Skeleton list" dir="column" align="stretch">
      <div style={{ ...cardStyle, width: 320 }}>
        <SkeletonRow />
        <div style={{ borderTop: `1px solid ${MT.sep}` }}><SkeletonRow /></div>
        <div style={{ borderTop: `1px solid ${MT.sep}` }}><SkeletonRow /></div>
      </div>
    </Block>
    <Block label="Skeleton stat cards" gap={10}>
      <div style={{ ...cardStyle, padding: 16, width: 150, display: "flex", flexDirection: "column", gap: 10 }}><Sk w={44} h={30} r={8} /><Sk w="70%" h={11} /></div>
      <div style={{ ...cardStyle, padding: 16, width: 150, display: "flex", flexDirection: "column", gap: 10 }}><Sk w={44} h={30} r={8} /><Sk w="70%" h={11} /></div>
    </Block>
    <Block label="Inline spinners" gap={18}>
      <Cell cap="on brand"><span style={{ width: 48, height: 48, borderRadius: 12, background: MT.brand, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Spinner size={20} color="#fff" /></span></Cell>
      <Cell cap="neutral"><span style={{ width: 48, height: 48, borderRadius: 12, background: "#fff", border: `1px solid ${MT.line}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Spinner size={20} color={MT.brand} /></span></Cell>
    </Block>
  </Spec>
);

const DialogSpec = () => (
  <Spec name="Dialogs" purpose="Modal only for decisions that block. sh-3 elevation, centered. Destructive primary is red and plainly named." bg="#f2f3f6">
    <Block label="Confirm" gap={16}>
      <Dialog title="Konfirmo takimin?" body="Anila Hoxha · e mërkurë 10:00. Pacienti do të marrë një kujtesë." primary="Konfirmo" secondary="Jo tani" />
    </Block>
    <Block label="Destructive" gap={16}>
      <Dialog title="Anulo takimin?" body="Pacienti do të njoftohet menjëherë. Ky veprim s'kthehet." primary="Anulo takimin" secondary="Mbaje" destructive />
    </Block>
  </Spec>
);

Object.assign(window, { NavSpec, TabsSpec, BannersSpec, ToastEmptySpec, LoadingSpec, DialogSpec });
