// System states — compose every screen. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CF = ({ children }) => <PhoneFrame>{children}</PhoneFrame>;
const W = 446, H = 918;

const SysApp = () => (
  <DesignCanvas>
    <DCSection id="conn" title="Lidhja & sinkronizimi" subtitle="Offline-first banners · offline / pending / failed / update / can't-connect">
      <DCArtboard id="offline" label="Jashtë linje" width={W} height={H}><CF><OfflineState /></CF></DCArtboard>
      <DCArtboard id="pending" label="Po sinkronizohet" width={W} height={H}><CF><PendingSync /></CF></DCArtboard>
      <DCArtboard id="failed" label="Ndryshime të dështuara" width={W} height={H}><CF><FailedSync /></CF></DCArtboard>
      <DCArtboard id="update" label="Version i ri" width={W} height={H}><CF><UpdateAvailable /></CF></DCArtboard>
      <DCArtboard id="error" label="S'lidhet me serverin" width={W} height={H}><CF><ErrorState /></CF></DCArtboard>
    </DCSection>

    <DCSection id="install" title="Instalimi & njoftimet push" subtitle="PWA install (Android / iOS) · push permission · lock-screen notifications">
      <DCArtboard id="install-android" label="Instalo · Android" width={W} height={H}><CF><InstallAndroid /></CF></DCArtboard>
      <DCArtboard id="install-ios" label="Instalo · iOS" width={W} height={H}><CF><InstallIos /></CF></DCArtboard>
      <DCArtboard id="push-permission" label="Leje për njoftimet" width={W} height={H}><CF><PushPermission /></CF></DCArtboard>
      <DCArtboard id="lock-screen" label="Njoftimet në ekran të kyçur" width={W} height={H}><CF><LockScreen /></CF></DCArtboard>
    </DCSection>

    <DCSection id="feed" title="Njoftimet & banderolat" subtitle="In-app feed · operational banners (reconnect / template / quota) · toasts">
      <DCArtboard id="feed" label="Njoftimet" width={W} height={H}><CF><FeedScreen /></CF></DCArtboard>
      <DCArtboard id="feed-empty" label="Bosh" width={W} height={H}><CF><FeedEmpty /></CF></DCArtboard>
      <DCArtboard id="ops" label="Banderola operacionale" width={W} height={H}><CF><OpsBanners /></CF></DCArtboard>
      <DCArtboard id="toasts" label="Toasts" width={W} height={H}><CF><ToastStack /></CF></DCArtboard>
    </DCSection>

    <DCSection id="account" title="Llogaria & GDPR" subtitle="Connection + notification settings · data export · disconnect & delete confirmations">
      <DCArtboard id="account" label="Llogaria & të dhënat" width={W} height={H}><CF><AccountScreen /></CF></DCArtboard>
      <DCArtboard id="disconnect" label="Shkëput WhatsApp" width={W} height={H}><CF><DisconnectDialog /></CF></DCArtboard>
      <DCArtboard id="delete" label="Fshi llogarinë" width={W} height={H}><CF><DeleteAccountDialog /></CF></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<SysApp />);
