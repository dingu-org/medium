// Sheet sections — List rows & cards, Avatars, Chat.

const ListRows = () => (
  <Spec name="List rows" purpose="Grouped inset lists are the spine of settings & detail. Hairline separators, 46px min height." bg="#f2f3f6">
    <Group title="Variants">
      <Row icon="user" title="Profili i biznesit" chevron onPress />
      <Row icon="message" title="Shërbimet" value="3" chevron onPress />
      <Row icon="clock" title="Disponueshmëria" value="Hën–Pre" chevron onPress />
      <Row icon="bell" title="Kujtesat automatike" accessory={<Toggle on />} />
      <Row leading={<span style={{ width: 9, height: 9, borderRadius: 999, background: MT.green, flexShrink: 0 }} />} title="WhatsApp" value="I lidhur" chevron onPress />
      <Row icon="x" title="Dil nga llogaria" danger onPress />
    </Group>
    <Group title="With subtitle">
      <Row leading={<Avatar initials="AH" size={40} />} title="Anila Hoxha" subtitle="Seancë vijuese · 10:30" chevron onPress />
    </Group>
  </Spec>
);

const CardsSpec = () => (
  <Spec name="Cards" purpose="10–14px radius, sh-1, 24px interior padding minimum. The product is a solid object — no blur on chrome." bg="#f2f3f6">
    <Block label="Profile card" dir="column" align="stretch">
      <div style={{ ...cardStyle, padding: 18, display: "flex", alignItems: "center", gap: 14, width: 320 }}>
        <Avatar initials="EL" size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: MT.ink }}>Elira Maloku</div>
          <div style={{ fontSize: 13, color: MT.ink3, marginTop: 2 }}>Studio Elira · Tiranë</div>
        </div>
        <SheetBtn kind="secondary" size="sm">Ndrysho</SheetBtn>
      </div>
    </Block>
    <Block label="Stat card" gap={10}>
      <div style={{ ...cardStyle, padding: 16, width: 150 }}>
        <div style={{ fontFamily: MT.display, fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, fontVariantNumeric: "tabular-nums" }}>12</div>
        <div style={{ fontSize: 13, color: MT.ink2, marginTop: 2 }}>Takime</div>
        <div style={{ fontSize: 12, color: MT.greenInk, marginTop: 6 }}>↑ 3 nga e martja</div>
      </div>
      <div style={{ ...cardStyle, padding: 16, width: 150 }}>
        <div style={{ fontFamily: MT.display, fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, fontVariantNumeric: "tabular-nums" }}>9</div>
        <div style={{ fontSize: 13, color: MT.ink2, marginTop: 2 }}>Konfirmuara</div>
        <div style={{ fontSize: 12, color: MT.ink3, marginTop: 6 }}>75% e takimeve</div>
      </div>
    </Block>
  </Spec>
);

const AvatarsSpec = () => (
  <Spec name="Avatars" purpose="Initials on brand-tint. Status dot signals who's handling: sage/blue Medium, green you.">
    <Block label="Sizes" gap={18}>
      <Cell cap="32"><Avatar initials="AH" size={32} /></Cell>
      <Cell cap="42"><Avatar initials="EK" size={42} /></Cell>
      <Cell cap="54"><Avatar initials="EL" size={54} /></Cell>
    </Block>
    <Block label="With status dot" gap={18}>
      <Cell cap="Medium handling"><Avatar initials="GM" size={44} dot={MT.brand} /></Cell>
      <Cell cap="you · takeover"><Avatar initials="VL" size={44} dot={MT.green} /></Cell>
    </Block>
    <Block label="App mark">
      <Cell cap="M-mark · sage dot">
        <svg width="48" height="48" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#3B5BFE" /><path d="M11 27V13h2.4l4.1 7.6 4.1-7.6h2.4v14h-2.2v-9.5l-3.6 6.6h-1.4l-3.6-6.6V27H11Z" fill="#fff" /><circle cx="29.5" cy="13.5" r="1.6" fill="#7CC4A8" /></svg>
      </Cell>
    </Block>
  </Spec>
);

// ─────────────────────────── Chat ───────────────────────────
const Bubble = ({ side, who, text, meta }) => {
  const mine = side === "right";
  const ai = who === "ai";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "86%" }}>
        {ai && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontFamily: MT.mono, color: MT.brand, marginBottom: 3, letterSpacing: "0.04em" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: MT.sage }} />MEDIUM</div>}
        <div style={{ padding: "10px 13px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.45, letterSpacing: "-0.005em",
          ...(mine ? { background: MT.brand, color: "#fff", borderBottomRightRadius: 5 }
            : ai ? { background: MT.brandTint, color: MT.brandInk, borderBottomLeftRadius: 5 }
            : { background: "#fff", color: MT.ink, border: `1px solid ${MT.line}`, borderBottomLeftRadius: 5 }) }}>{text}</div>
        {meta && <div style={{ fontSize: 10.5, color: MT.ink3, padding: "4px 6px 0", textAlign: mine ? "right" : "left", fontFamily: MT.mono }}>{meta}</div>}
      </div>
    </div>
  );
};

const ChatBubbles = () => (
  <Spec name="Chat bubbles" purpose="Three voices: patient (left, white), Medium AI (left, tinted + label), you (right, brand). Two short sentences max." bg="#f2f3f6">
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.ink3 }}>Voices</div>
      <Bubble side="left" text="Mirëdita, dua të ricaktoj takimin e së enjtes." meta="14:18" />
      <Bubble side="left" who="ai" text="Sigurisht. Cila ditë ju shkon — e premte ose e hënë tjetër?" meta="14:18" />
      <Bubble side="right" text="Endi, e premtja në 16:30 është e lirë. Të shkon?" meta="14:21 · dërguar" />
      <div style={{ textAlign: "center", fontSize: 11, color: MT.ink3, fontFamily: MT.mono, padding: "2px 0" }}>— ti more bisedën në dorë —</div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <div style={{ display: "inline-flex", gap: 4, padding: "12px 14px", borderRadius: 16, borderBottomLeftRadius: 5, background: "#fff", border: `1px solid ${MT.line}` }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: "#c2c8d2" }} />)}
        </div>
      </div>
    </div>
  </Spec>
);

const ChatComposer = () => (
  <Spec name="Composer & takeover banner" purpose="Pill input + send. Banner shows when you've taken a thread — one tap returns it to Medium." bg="#f2f3f6">
    <Block label="Takeover banner" dir="column" align="stretch">
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", background: MT.greenTint, border: `1px solid #cfe7d9`, borderRadius: 12, width: 320 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: MT.green }} />
        <div style={{ flex: 1, fontSize: 12.5, color: MT.greenInk, fontWeight: 500 }}>Ti po bisedon — Medium në pauzë</div>
        <span style={{ fontSize: 12.5, color: MT.brand, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="handoff" size={14} color={MT.brand} />Ktheja</span>
      </div>
    </Block>
    <Block label="Composer" dir="column" align="stretch">
      <Cell cap="empty">
        <div style={{ display: "flex", gap: 10, alignItems: "center", width: 320 }}>
          <div style={{ flex: 1, height: 42, padding: "0 16px", border: `1px solid ${MT.line}`, borderRadius: 999, fontSize: 14.5, color: MT.ink3, display: "flex", alignItems: "center", background: "#fff" }}>Shkruaj një mesazh…</div>
          <button style={{ width: 42, height: 42, background: "#eef0f4", border: "none", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="send" size={17} color="#9aa1ad" /></button>
        </div>
      </Cell>
      <Cell cap="typed · ready">
        <div style={{ display: "flex", gap: 10, alignItems: "center", width: 320 }}>
          <div style={{ flex: 1, height: 42, padding: "0 16px", border: `1px solid ${MT.line}`, borderRadius: 999, fontSize: 14.5, color: MT.ink, display: "flex", alignItems: "center", background: "#fff" }}>Të shkon e premtja në 16:30?</div>
          <button style={{ width: 42, height: 42, background: MT.brand, border: "none", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="send" size={17} color="#fff" /></button>
        </div>
      </Cell>
    </Block>
  </Spec>
);

Object.assign(window, { ListRows, CardsSpec, AvatarsSpec, ChatBubbles, ChatComposer });
