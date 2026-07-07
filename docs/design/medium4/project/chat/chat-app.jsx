// Chats + takeover — compose every screen onto the canvas. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CF = PhoneFrame;
const W = 446, H = 918;

const ChatApp = () => (
  <DesignCanvas>
    <DCSection id="list" title="Lista e bisedave" subtitle="Needs-you first, who's-handling clarity · default / loading / empty / closed">
      <DCArtboard id="list-default" label="Lista" width={W} height={H}><CF><ChatListDefault /></CF></DCArtboard>
      <DCArtboard id="list-loading" label="Po ngarkohet" width={W} height={H}><CF><ChatListLoading /></CF></DCArtboard>
      <DCArtboard id="list-empty" label="Bosh" width={W} height={H}><CF><ChatListEmpty /></CF></DCArtboard>
      <DCArtboard id="list-closed" label="Të mbyllura" width={W} height={H}><CF><ChatListClosed /></CF></DCArtboard>
    </DCSection>

    <DCSection id="threads" title="Biseda · kush po menaxhon" subtitle="AI handling · escalation · manual takeover · auto-pause (own WhatsApp) · debounced messages">
      <DCArtboard id="t-ai" label="Medium po përgjigjet" width={W} height={H}><CF><ThreadAI /></CF></DCArtboard>
      <DCArtboard id="t-escalated" label="Eskaluar · të duhet ty" width={W} height={H}><CF><ThreadEscalated /></CF></DCArtboard>
      <DCArtboard id="t-takeover" label="Marrja në dorë" width={W} height={H}><CF><ThreadTakeover /></CF></DCArtboard>
      <DCArtboard id="t-paused" label="Pauzë · nga WhatsApp-i yt" width={W} height={H}><CF><ThreadPaused /></CF></DCArtboard>
      <DCArtboard id="t-debounce" label="Mesazhe të shpejta" width={W} height={H}><CF><ThreadDebounce /></CF></DCArtboard>
    </DCSection>

    <DCSection id="send" title="Composer · gjendjet e dërgimit" subtitle="Typed · pending sync · failed · offline queued · 24h window closed · reconnect">
      <DCArtboard id="s-typed" label="Tekst · gati" width={W} height={H}><CF><SendTyped /></CF></DCArtboard>
      <DCArtboard id="s-pending" label="Po dërgohet" width={W} height={H}><CF><SendPending /></CF></DCArtboard>
      <DCArtboard id="s-failed" label="Dështoi · provo sërish" width={W} height={H}><CF><SendFailed /></CF></DCArtboard>
      <DCArtboard id="s-offline" label="Pa internet · radhë" width={W} height={H}><CF><SendOffline /></CF></DCArtboard>
      <DCArtboard id="s-window" label="Dritarja 24-orëshe" width={W} height={H}><CF><SendWindowClosed /></CF></DCArtboard>
      <DCArtboard id="s-revoked" label="U shkëput · rilidh" width={W} height={H}><CF><SendRevoked /></CF></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<ChatApp />);
