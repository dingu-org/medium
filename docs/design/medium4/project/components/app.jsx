// Component sheet — compose every spec onto the canvas. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CARD = { borderRadius: 12, background: "#fff" };

const Sheet = () => (
  <DesignCanvas>
    <DCSection id="foundations" title="Foundations" subtitle="Tokens — color, type, shape & elevation">
      <DCArtboard id="color" label="Color" width={470} height={660} style={CARD}><FoundationColor /></DCArtboard>
      <DCArtboard id="type" label="Type" width={470} height={580} style={CARD}><FoundationType /></DCArtboard>
      <DCArtboard id="shape" label="Shape & elevation" width={470} height={490} style={CARD}><FoundationShape /></DCArtboard>
    </DCSection>

    <DCSection id="buttons" title="Butona" subtitle="Kinds, sizes & every interaction state">
      <DCArtboard id="btn-kinds" label="Kinds & sizes" width={470} height={560} style={CARD}><ButtonKinds /></DCArtboard>
      <DCArtboard id="btn-states" label="States" width={470} height={555} style={CARD}><ButtonStates /></DCArtboard>
    </DCSection>

    <DCSection id="forms" title="Format" subtitle="Inputs, selectors & toggles with default / focus / error / disabled">
      <DCArtboard id="form-text" label="Text fields" width={600} height={560} style={CARD}><FormText /></DCArtboard>
      <DCArtboard id="form-controls" label="Selectors & toggles" width={600} height={560} style={CARD}><FormControls /></DCArtboard>
    </DCSection>

    <DCSection id="badges" title="Statuset" subtitle="Lifecycle status, channel state, handled-by, counts & keywords">
      <DCArtboard id="status" label="Status pills" width={470} height={440} style={CARD}><BadgeStatus /></DCArtboard>
      <DCArtboard id="badge-misc" label="Handled-by · counts · keywords" width={470} height={440} style={CARD}><BadgeMisc /></DCArtboard>
    </DCSection>

    <DCSection id="lists" title="Listat & kartat" subtitle="Grouped inset rows, cards, avatars">
      <DCArtboard id="rows" label="List rows" width={430} height={640} style={CARD}><ListRows /></DCArtboard>
      <DCArtboard id="cards" label="Cards" width={400} height={470} style={CARD}><CardsSpec /></DCArtboard>
      <DCArtboard id="avatars" label="Avatars" width={430} height={480} style={CARD}><AvatarsSpec /></DCArtboard>
    </DCSection>

    <DCSection id="chat" title="Bisedat" subtitle="Bubble voices, takeover banner, composer states">
      <DCArtboard id="bubbles" label="Chat bubbles" width={430} height={530} style={CARD}><ChatBubbles /></DCArtboard>
      <DCArtboard id="composer" label="Composer & takeover" width={400} height={440} style={CARD}><ChatComposer /></DCArtboard>
    </DCSection>

    <DCSection id="nav" title="Navigimi" subtitle="App bars & bottom tabs">
      <DCArtboard id="appbars" label="App bars" width={400} height={480} style={CARD}><NavSpec /></DCArtboard>
      <DCArtboard id="tabs" label="Bottom tabs" width={400} height={390} style={CARD}><TabsSpec /></DCArtboard>
    </DCSection>

    <DCSection id="feedback" title="Feedback" subtitle="Banners, toasts, empty states, loading, dialogs">
      <DCArtboard id="banners" label="Banners" width={372} height={565} style={CARD}><BannersSpec /></DCArtboard>
      <DCArtboard id="toast-empty" label="Toasts & empty" width={360} height={750} style={CARD}><ToastEmptySpec /></DCArtboard>
      <DCArtboard id="loading" label="Loading & skeletons" width={380} height={650} style={CARD}><LoadingSpec /></DCArtboard>
      <DCArtboard id="dialogs" label="Dialogs" width={360} height={710} style={CARD}><DialogSpec /></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<Sheet />);
