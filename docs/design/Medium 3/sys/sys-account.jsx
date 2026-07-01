// System — account & GDPR: connection + notifications settings, danger zone, disconnect & delete dialogs.

const SettingRow = ({ icon, leading, title, sub, value, valueColor, chevron, accessory, danger, _first }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", borderTop: _first ? "none" : `1px solid ${MT.sep}` }}>
    {leading}
    {icon && <Icon name={icon} size={19} color={danger ? MT.red : "#5b6472"} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: danger ? MT.red : MT.ink }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: MT.ink3, marginTop: 2 }}>{sub}</div>}
    </div>
    {value && <div style={{ fontSize: 13.5, color: valueColor || MT.ink2, fontWeight: valueColor ? 600 : 400, flexShrink: 0 }}>{value}</div>}
    {accessory}
    {chevron && <Icon name="chevronRight" size={17} color="#c6ccd6" />}
  </div>
);

// account & data settings (hosts connection + GDPR)
const AccountScreen = () => (
  <Screen>
    <NavBar onBack={() => {}} title="Llogaria & të dhënat" />
    <Body pad="14px 20px 24px">
      <SectionLabel>Kanali</SectionLabel>
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <SettingRow _first leading={<span style={{ width: 9, height: 9, borderRadius: 999, background: MT.green, flexShrink: 0 }} />} title="WhatsApp Business" sub="+355 69 123 4567" value="I lidhur" valueColor={MT.greenInk} />
        <SettingRow icon="bell" title="Shablloni i kujtesave" value="Miratuar" valueColor={MT.greenInk} />
      </div>

      <SectionLabel>Njoftimet</SectionLabel>
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <SettingRow _first icon="calendar" title="Rezervime të reja" accessory={<Toggle on />} />
        <SettingRow icon="x" title="Anulime" accessory={<Toggle on />} />
        <SettingRow icon="bell" title="Eskalime" accessory={<Toggle on />} />
        <SettingRow icon="handoff" title="Kujtesa ditore" accessory={<Toggle />} />
      </div>

      <SectionLabel>Të dhënat e tua</SectionLabel>
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <SettingRow _first icon="arrowRight" title="Eksporto të dhënat" sub="Takime, pacientë, biseda · JSON" chevron />
        <SettingRow icon="clock" title="Ruajtja e të dhënave" value="90 ditë" chevron />
      </div>

      <SectionLabel style={{ color: MT.redInk }}>Zona e rrezikut</SectionLabel>
      <div style={{ ...cardStyle, border: "1px solid #f0d6d5" }}>
        <SettingRow _first icon="phone" title="Shkëput WhatsApp" danger chevron />
        <SettingRow icon="x" title="Fshi llogarinë" danger chevron />
      </div>
      <div style={{ fontSize: 12, color: MT.ink3, lineHeight: 1.5, padding: "12px 4px 0" }}>Veprimet e zonës së rrezikut s'kthehen.</div>
    </Body>
  </Screen>
);

const ModalOver = ({ backdrop, children }) => (
  <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", fontFamily: MT.sans }}>
    <div style={{ position: "absolute", inset: 0 }}>{backdrop}</div>
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,20,32,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>{children}</div>
  </div>
);

const DisconnectDialog = () => (
  <ModalOver backdrop={<AccountScreen />}>
    <div style={{ width: "100%", background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px -16px rgba(15,20,32,0.4)", overflow: "hidden" }}>
      <div style={{ padding: "22px 22px 18px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 999, background: MT.redTint, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon name="phone" size={24} color={MT.red} /></div>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Shkëput WhatsApp?</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 8 }}>Pacientët nuk do të mund të shkruajnë derisa ta rilidhësh. Takimet dhe historiku ruhen.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 18px 18px" }}>
        <button style={{ height: 48, borderRadius: 12, border: "none", background: MT.red, color: "#fff", fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Shkëput</button>
        <button style={{ height: 48, borderRadius: 12, border: `1px solid ${MT.line}`, background: "#fff", color: MT.ink, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Anulo</button>
      </div>
    </div>
  </ModalOver>
);

const DeleteAccountDialog = () => (
  <ModalOver backdrop={<AccountScreen />}>
    <div style={{ width: "100%", background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px -16px rgba(15,20,32,0.4)", overflow: "hidden" }}>
      <div style={{ padding: "22px 22px 16px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 999, background: MT.redTint, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon name="x" size={24} color={MT.red} strokeWidth={2.2} /></div>
        <div style={{ fontFamily: MT.display, fontSize: 18, fontWeight: 600, color: MT.ink, letterSpacing: "-0.02em" }}>Fshi llogarinë?</div>
        <div style={{ fontSize: 13.5, color: MT.ink2, lineHeight: 1.5, marginTop: 8 }}>Kjo fshin përgjithmonë praktikën, pacientët, takimet, bisedat dhe lidhjen me WhatsApp. S'kthehet.</div>
      </div>
      <div style={{ padding: "0 22px" }}>
        <div style={{ fontSize: 12.5, color: MT.ink2, marginBottom: 7 }}>Shkruaj <span style={{ fontFamily: MT.mono, fontWeight: 700, color: MT.ink }}>DELETE</span> për të konfirmuar</div>
        <div style={{ height: 46, padding: "0 14px", border: `1px solid ${MT.red}`, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", fontSize: 15, fontFamily: MT.mono, color: MT.ink, boxShadow: "0 0 0 3px rgba(179,50,43,0.12)" }}>DELETE<span style={{ display: "inline-block", width: 2, height: 18, background: MT.red, marginLeft: 1 }} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "18px" }}>
        <button style={{ height: 48, borderRadius: 12, border: "none", background: MT.red, color: "#fff", fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Fshi llogarinë</button>
        <button style={{ height: 48, borderRadius: 12, border: `1px solid ${MT.line}`, background: "#fff", color: MT.ink, fontFamily: MT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Anulo</button>
      </div>
    </div>
  </ModalOver>
);

Object.assign(window, { AccountScreen, DisconnectDialog, DeleteAccountDialog });
