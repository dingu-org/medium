// Chat list — default (needs-you first), loading, empty, closed filter.

const ListConvo = ({ initials, name, last, time, who, unread, alert, _first }) => (
  <div style={{ display: "flex", gap: 13, padding: "13px 16px", alignItems: "center", borderTop: _first ? "none" : `1px solid ${MT.sep}`, cursor: "pointer" }}>
    <Avatar initials={initials} size={44} dot={alert ? MT.red : who === "you" ? MT.green : MT.brand} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: MT.ink, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ fontSize: 11.5, color: MT.ink3, fontFamily: MT.mono, flexShrink: 0, whiteSpace: "nowrap" }}>{time}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: unread || alert ? MT.ink : MT.ink2, fontWeight: unread || alert ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{last}</div>
        {alert ? <span style={{ fontSize: 11.5, fontWeight: 600, color: MT.red, display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, whiteSpace: "nowrap" }}><span style={{ width: 7, height: 7, borderRadius: 999, background: MT.red }} />Të duhet ty</span> : <HandledBy who={who} />}
        {unread > 0 && <Count n={unread} />}
      </div>
    </div>
  </div>
);

const ChatListDefault = () => (
  <Screen>
    <TopBar title="Bisedat" right={<RoundBtn icon="search" />} />
    <div style={{ padding: "4px 16px 14px", flexShrink: 0 }}>
      <Seg value="active" w="100%" options={[{ k: "active", l: "Aktive" }, { k: "closed", l: "Të mbyllura" }]} />
    </div>
    <Body pad="0 16px 24px">
      <SectionLabel style={{ color: MT.redInk }}>Të duhet ty</SectionLabel>
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <ListConvo _first initials="DS" name="Dritan Sopa" last="Dua të flas me dikë, jo me robot." time="3 min" alert unread={1} />
        <ListConvo initials="EK" name="Endi Kola" last="Po, përshtatet. Faleminderit." time="8 min" who="you" unread={0} />
      </div>
      <SectionLabel>Medium po menaxhon</SectionLabel>
      <div style={{ ...cardStyle }}>
        <ListConvo _first initials="AH" name="Anila Hoxha" last="Po, e mërkura në 10:00 është mirë." time="12 min" who="ai" />
        <ListConvo initials="GM" name="Genti Marku" last="Konfirmoi takimin për të enjten." time="1 orë" who="ai" />
        <ListConvo initials="VL" name="Vera Lleshi" last="Faleminderit, takimin e ricaktuat." time="3 orë" who="ai" />
        <ListConvo initials="MB" name="Mira Beqiri" last="A mund të shoh oraret e lira?" time="4 orë" who="ai" />
      </div>
    </Body>
    <Tabs active="chats" />
  </Screen>
);

const ChatListLoading = () => (
  <Screen>
    <TopBar title="Bisedat" right={<RoundBtn icon="search" />} />
    <div style={{ padding: "4px 16px 14px", flexShrink: 0 }}>
      <Seg value="active" w="100%" options={[{ k: "active", l: "Aktive" }, { k: "closed", l: "Të mbyllura" }]} />
    </div>
    <Body pad="12px 16px 24px">
      <div style={{ ...cardStyle }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ borderTop: i ? `1px solid ${MT.sep}` : "none" }}><SkeletonRow /></div>)}
      </div>
    </Body>
    <Tabs active="chats" />
  </Screen>
);

const ChatListEmpty = () => (
  <Screen>
    <TopBar title="Bisedat" right={<RoundBtn icon="search" />} />
    <div style={{ padding: "4px 16px 14px", flexShrink: 0 }}>
      <Seg value="active" w="100%" options={[{ k: "active", l: "Aktive" }, { k: "closed", l: "Të mbyllura" }]} />
    </div>
    <Body pad="0 16px 24px">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", padding: "0 28px" }}>
        <div style={{ width: 60, height: 60, borderRadius: 999, background: "#ecece7", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Icon name="message" size={28} color="#9CA2AE" /></div>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Asnjë bisedë aktive</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 7, maxWidth: 260 }}>Kur një pacient shkruan në WhatsApp, biseda shfaqet këtu — Medium përgjigjet vetë.</div>
      </div>
    </Body>
    <Tabs active="chats" />
  </Screen>
);

const ChatListClosed = () => (
  <Screen>
    <TopBar title="Bisedat" right={<RoundBtn icon="search" />} />
    <div style={{ padding: "4px 16px 14px", flexShrink: 0 }}>
      <Seg value="closed" w="100%" options={[{ k: "active", l: "Aktive" }, { k: "closed", l: "Të mbyllura" }]} />
    </div>
    <Body pad="12px 16px 24px">
      <div style={{ ...cardStyle }}>
        <ListConvo _first initials="LK" name="Liridon Krasniqi" last="Takimi u krye. Faleminderit." time="dje" who="closed" />
        <ListConvo initials="FB" name="Fatjona Bega" last="Anuloi takimin e premtes." time="2 ditë" who="closed" />
        <ListConvo initials="RM" name="Ramadan Maliqi" last="Konfirmoi dhe erdhi." time="5 ditë" who="closed" />
      </div>
    </Body>
    <Tabs active="chats" />
  </Screen>
);

Object.assign(window, { ChatListDefault, ChatListLoading, ChatListEmpty, ChatListClosed });
