// Klientët — the patients directory tab. Compose every screen.
// Look locked: calm / blue / soft (matches the sibling canvases).
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CF = ({ children }) => <PhoneFrame>{children}</PhoneFrame>;
const W = 446, H = 918;

const ClientsApp = () => (
  <DesignCanvas>
    <DCSection id="list" title="Klientët" subtitle="Directory tab · default / loading / empty / search">
      <DCArtboard id="list-default" label="Klientët" width={W} height={H}><CF><ClientsDefault /></CF></DCArtboard>
      <DCArtboard id="list-loading" label="Po ngarkohet" width={W} height={H}><CF><ClientsLoading /></CF></DCArtboard>
      <DCArtboard id="list-empty" label="Bosh" width={W} height={H}><CF><ClientsEmpty /></CF></DCArtboard>
      <DCArtboard id="list-search" label="Kërkim" width={W} height={H}><CF><ClientsSearch /></CF></DCArtboard>
    </DCSection>

    <DCSection id="detail" title="Klienti" subtitle="Detail · history, notes, contact · WhatsApp / manual / opt-out">
      <DCArtboard id="client-detail" label="Klient · WhatsApp" width={W} height={H}><CF><ClientDetail /></CF></DCArtboard>
      <DCArtboard id="client-manual" label="Klient · me dorë + opt-out" width={W} height={H}><CF><ClientManual /></CF></DCArtboard>
      <DCArtboard id="client-new" label="Klient i ri" width={W} height={H}><CF><ClientNew /></CF></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<ClientsApp />);
