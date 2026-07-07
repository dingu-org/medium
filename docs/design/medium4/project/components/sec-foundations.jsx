// Sheet sections A — Foundations (color, type, spacing/shape) + Buttons.

const Sw = ({ c, name, val, fg }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 86 }}>
    <div style={{ height: 52, borderRadius: 10, background: c, border: c.toLowerCase() === "#ffffff" || c === "#fff" ? `1px solid ${MT.line}` : "none", display: "flex", alignItems: "flex-end", padding: 7 }}>
      {fg && <span style={{ fontSize: 9.5, fontFamily: MT.mono, color: fg }}>Aa</span>}
    </div>
    <div style={{ fontSize: 11, fontWeight: 600, color: MT.ink, letterSpacing: "-0.01em" }}>{name}</div>
    <div style={{ fontSize: 10, fontFamily: MT.mono, color: MT.ink3 }}>{val}</div>
  </div>
);

const FoundationColor = () => (
  <Spec name="Color" purpose="Cool-neutral spine carries 95% of surface. One brand blue for action; semantics only in their role.">
    <Block label="Brand · clinical blue">
      <Sw c={MT.brand} name="brand-500" val="#3B5BFE" fg="#fff" />
      <Sw c={MT.brandInk} name="brand-ink" val="#2A41C9" fg="#fff" />
      <Sw c={MT.brandTint} name="brand-tint" val="#EAEEFF" fg={MT.brandInk} />
      <Sw c={MT.sage} name="sage · dot" val="#7CC4A8" fg="#1b4736" />
    </Block>
    <Block label="Semantic">
      <Sw c={MT.green} name="success" val="#17A45D" fg="#fff" />
      <Sw c={MT.amber} name="warning" val="#DE930B" fg="#fff" />
      <Sw c={MT.red} name="danger" val="#D5453C" fg="#fff" />
      <Sw c={MT.brand} name="info" val="#3B5BFE" fg="#fff" />
    </Block>
    <Block label="Neutrals">
      <Sw c="#0F1420" name="ink" val="#0F1420" fg="#fff" />
      <Sw c="#6b7280" name="ink-2" val="#6b7280" fg="#fff" />
      <Sw c="#9aa1ad" name="ink-3" val="#9aa1ad" fg="#fff" />
      <Sw c="#e6e9ee" name="border" val="#e6e9ee" fg="#6b7280" />
      <Sw c="#f2f3f6" name="bg" val="#f2f3f6" fg="#9aa1ad" />
      <Sw c="#ffffff" name="card" val="#ffffff" fg="#9aa1ad" />
    </Block>
  </Spec>
);

const FoundationType = () => (
  <Spec name="Type" purpose="Inter Tight (display) · Inter (body) · JetBrains Mono. Compact scale — most UI lives at 14–15px.">
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: MT.display, fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, lineHeight: 1 }}>12</div>
        <div style={{ fontSize: 10.5, fontFamily: MT.mono, color: MT.ink3, marginTop: 6 }}>Inter Tight 600 · 40 / hero numerals only</div>
      </div>
      <div style={{ height: 1, background: MT.sep }} />
      <div>
        <div style={{ fontFamily: MT.display, fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink }}>Kalendari sot</div>
        <div style={{ fontSize: 10.5, fontFamily: MT.mono, color: MT.ink3, marginTop: 5 }}>Inter Tight 600 · 26 / large title</div>
      </div>
      <div>
        <div style={{ fontFamily: MT.display, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color: MT.ink }}>Detajet e takimit</div>
        <div style={{ fontSize: 10.5, fontFamily: MT.mono, color: MT.ink3, marginTop: 5 }}>Inter Tight 600 · 17 / nav title</div>
      </div>
      <div>
        <div style={{ fontFamily: MT.sans, fontSize: 15, fontWeight: 400, letterSpacing: "-0.005em", color: MT.ink }}>Po, e mërkura në 10:00 është mirë për ju.</div>
        <div style={{ fontSize: 10.5, fontFamily: MT.mono, color: MT.ink3, marginTop: 5 }}>Inter 400 · 15 / body default</div>
      </div>
      <div>
        <div style={{ fontFamily: MT.sans, fontSize: 13, fontWeight: 400, color: MT.ink2 }}>Studio Elira · Tiranë</div>
        <div style={{ fontSize: 10.5, fontFamily: MT.mono, color: MT.ink3, marginTop: 5 }}>Inter 400 · 13 / secondary</div>
      </div>
      <div>
        <div style={{ fontFamily: MT.mono, fontSize: 13, fontWeight: 500, color: MT.brandInk, letterSpacing: "0.02em" }}>KONFIRMO · 14:30</div>
        <div style={{ fontSize: 10.5, fontFamily: MT.mono, color: MT.ink3, marginTop: 5 }}>JetBrains Mono 500 · keywords & metadata</div>
      </div>
    </div>
  </Spec>
);

const FoundationShape = () => (
  <Spec name="Shape & elevation" purpose="Hairlines do the work. Restrained radius, three low-spread elevation levels.">
    <Block label="Radius">
      <Cell cap="card · 14"><div style={{ width: 64, height: 48, borderRadius: 14, background: "#fff", border: `1px solid ${MT.line}` }} /></Cell>
      <Cell cap="button · 12"><div style={{ width: 64, height: 48, borderRadius: 12, background: "#fff", border: `1px solid ${MT.line}` }} /></Cell>
      <Cell cap="input · 12"><div style={{ width: 64, height: 48, borderRadius: 12, background: "#fff", border: `1px solid ${MT.line}` }} /></Cell>
      <Cell cap="pill · 999"><div style={{ width: 64, height: 48, borderRadius: 999, background: "#fff", border: `1px solid ${MT.line}` }} /></Cell>
    </Block>
    <Block label="Elevation">
      <Cell cap="sh-1 · resting card"><div style={{ width: 96, height: 56, borderRadius: 12, background: "#fff", border: `1px solid ${MT.line}`, boxShadow: "0 1px 2px rgba(15,20,32,0.04)" }} /></Cell>
      <Cell cap="sh-2 · popover"><div style={{ width: 96, height: 56, borderRadius: 12, background: "#fff", boxShadow: "0 6px 18px -6px rgba(15,20,32,0.22)" }} /></Cell>
      <Cell cap="sh-3 · modal"><div style={{ width: 96, height: 56, borderRadius: 12, background: "#fff", boxShadow: "0 20px 48px -12px rgba(15,20,32,0.38)" }} /></Cell>
    </Block>
    <Block label="Focus ring">
      <Cell cap="3px brand @18%"><div style={{ width: 96, height: 48, borderRadius: 12, background: "#fff", border: `1px solid ${MT.brand}`, boxShadow: "0 0 0 3px rgba(59,91,254,0.18)" }} /></Cell>
    </Block>
  </Spec>
);

// ─────────────────────────── Buttons ───────────────────────────
const ButtonKinds = () => (
  <Spec name="Buttons · kinds & sizes" purpose="6px–12px radius. Primary carries one action per view; destructive is plain, never hidden.">
    <Block label="Kinds" gap={10}>
      <Cell cap="primary"><SheetBtn kind="primary">Rezervo</SheetBtn></Cell>
      <Cell cap="secondary"><SheetBtn kind="secondary">Anulo</SheetBtn></Cell>
      <Cell cap="tinted"><SheetBtn kind="tinted">Ricakto</SheetBtn></Cell>
      <Cell cap="ghost · danger"><SheetBtn kind="ghostDanger">Anulo takimin</SheetBtn></Cell>
    </Block>
    <Block label="With icon" gap={10}>
      <Cell cap="leading icon"><SheetBtn kind="primary" icon="plus">Takim i ri</SheetBtn></Cell>
      <Cell cap="tinted + icon"><SheetBtn kind="tinted" icon="handoff">Ktheja Medium-it</SheetBtn></Cell>
    </Block>
    <Block label="Sizes" gap={10}>
      <Cell cap="sm · 36"><SheetBtn kind="secondary" size="sm">Ndrysho</SheetBtn></Cell>
      <Cell cap="md · 48"><SheetBtn kind="primary" size="md">Ruaj</SheetBtn></Cell>
      <Cell cap="lg · 50 · full" grow><SheetBtn kind="primary" size="lg" full>Hyr</SheetBtn></Cell>
    </Block>
  </Spec>
);

const ButtonStates = () => (
  <Spec name="Buttons · states" purpose="Hover steps one shade; press adds 1% scale on primary; focus is the 3px ring; disabled is 40%.">
    <Block label="Primary" gap={10}>
      <Cell cap="default"><SheetBtn kind="primary">Rezervo</SheetBtn></Cell>
      <Cell cap="hover"><SheetBtn kind="primary" state="hover">Rezervo</SheetBtn></Cell>
      <Cell cap="pressed"><SheetBtn kind="primary" state="pressed">Rezervo</SheetBtn></Cell>
      <Cell cap="focus"><SheetBtn kind="primary" state="focus">Rezervo</SheetBtn></Cell>
      <Cell cap="loading"><SheetBtn kind="primary" state="loading">Po ruhet</SheetBtn></Cell>
      <Cell cap="disabled"><SheetBtn kind="primary" state="disabled">Rezervo</SheetBtn></Cell>
    </Block>
    <Block label="Secondary" gap={10}>
      <Cell cap="default"><SheetBtn kind="secondary">Anulo</SheetBtn></Cell>
      <Cell cap="hover"><SheetBtn kind="secondary" state="hover">Anulo</SheetBtn></Cell>
      <Cell cap="focus"><SheetBtn kind="secondary" state="focus">Anulo</SheetBtn></Cell>
      <Cell cap="disabled"><SheetBtn kind="secondary" state="disabled">Anulo</SheetBtn></Cell>
    </Block>
    <Block label="Tinted" gap={10}>
      <Cell cap="default"><SheetBtn kind="tinted">Ricakto</SheetBtn></Cell>
      <Cell cap="hover"><SheetBtn kind="tinted" state="hover">Ricakto</SheetBtn></Cell>
      <Cell cap="pressed"><SheetBtn kind="tinted" state="pressed">Ricakto</SheetBtn></Cell>
    </Block>
  </Spec>
);

Object.assign(window, { FoundationColor, FoundationType, FoundationShape, ButtonKinds, ButtonStates });
