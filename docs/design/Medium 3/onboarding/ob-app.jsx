// Onboarding — compose every screen onto the canvas. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const F = ({ children }) => <PhoneFrame>{children}</PhoneFrame>;
const W = 446, H = 918;

const OnbApp = () => (
  <DesignCanvas>
    <DCSection id="wizard" title="Hyrja në Medium" subtitle="First-run wizard — Welcome → Profile → Hours → Services → Done">
      <DCArtboard id="welcome" label="Mirë se erdhe" width={W} height={H}><F><StepWelcome /></F></DCArtboard>
      <DCArtboard id="profile" label="1 · Profili" width={W} height={H}><F><StepProfile /></F></DCArtboard>
      <DCArtboard id="hours" label="3 · Disponueshmëria" width={W} height={H}><F><StepHours /></F></DCArtboard>
      <DCArtboard id="services" label="4 · Shërbimet" width={W} height={H}><F><StepServices /></F></DCArtboard>
      <DCArtboard id="done" label="U regjistrove" width={W} height={H}><F><StepDone /></F></DCArtboard>
    </DCSection>

    <DCSection id="whatsapp" title="Lidhja e WhatsApp" subtitle="Step 2 · Meta Embedded Signup — launchpad, loading, success & every failure mode">
      <DCArtboard id="launch" label="Launchpad" width={W} height={H}><F><WALaunch /></F></DCArtboard>
      <DCArtboard id="connecting" label="Po lidhet · loading" width={W} height={H}><F><WAConnecting /></F></DCArtboard>
      <DCArtboard id="connected" label="U lidh · success" width={W} height={H}><F><WAConnected /></F></DCArtboard>
      <DCArtboard id="rejected" label="Verifikimi u refuzua" width={W} height={H}><F><WARejected /></F></DCArtboard>
      <DCArtboard id="duplicate" label="Numri në përdorim" width={W} height={H}><F><WADuplicate /></F></DCArtboard>
      <DCArtboard id="incomplete" label="Lidhja përgjysmë" width={W} height={H}><F><WAIncomplete /></F></DCArtboard>
      <DCArtboard id="offline" label="Pa internet" width={W} height={H}><F><WAOffline /></F></DCArtboard>
      <DCArtboard id="reconnect" label="U shkëput · rilidh" width={W} height={H}><F><WAReconnect /></F></DCArtboard>
    </DCSection>

    <DCSection id="edge" title="Gjendje fushash" subtitle="Validation, empty & finalizing states across the flow">
      <DCArtboard id="profile-error" label="Profili · gabim" width={W} height={H}><F><ProfileError /></F></DCArtboard>
      <DCArtboard id="services-empty" label="Shërbimet · bosh" width={W} height={H}><F><ServicesEmpty /></F></DCArtboard>
      <DCArtboard id="finalizing" label="Po përfundon · loading" width={W} height={H}><F><Finalizing /></F></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<OnbApp />);
