// Composer & send states — typed, pending sync, failed+retry, 24h window closed, connection revoked, offline queued.

const baseMsgs = (
  <React.Fragment>
    <CSys>sot · klienti nisi bisedën</CSys>
    <CBubble side="left" text="Mirëdita, a mund ta zhvendos takimin e nesërm?" meta="14:18" />
    <CSys>— ti more bisedën në dorë —</CSys>
  </React.Fragment>
);

// typed draft, ready to send
const SendTyped = () => (
  <CThread patient="Endi Kola" statusRow={<CStatusRow mode="you" />}
    messages={baseMsgs}
    composer={<CComposer state="typed" draft="Sigurisht — e premtja në 16:30 është e lirë." />} />
);

// optimistic pending sync (offline-first PWA)
const SendPending = () => (
  <CThread patient="Endi Kola" statusRow={<CStatusRow mode="you" />}
    messages={<React.Fragment>
      {baseMsgs}
      <CBubble side="right" text="Sigurisht — e premtja në 16:30 është e lirë." meta="po dërgohet" state="pending" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// failed send — needs attention + retry
const SendFailed = () => (
  <CThread patient="Endi Kola" statusRow={<CStatusRow mode="you" />}
    notice={<CNotice tone="danger" icon="x" text="Një mesazh nuk u dërgua. Prek mesazhin për ta provuar sërish." />}
    messages={<React.Fragment>
      {baseMsgs}
      <CBubble side="right" text="Sigurisht — e premtja në 16:30 është e lirë." meta="14:22" state="failed" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// offline — message queued
const SendOffline = () => (
  <CThread patient="Endi Kola" statusRow={<CStatusRow mode="you" />}
    notice={<CNotice tone="info" icon="clock" text="Pa internet. Mesazhi u vendos në radhë dhe do të dërgohet kur të lidhesh." />}
    messages={<React.Fragment>
      {baseMsgs}
      <CBubble side="right" text="Sigurisht — e premtja në 16:30 është e lirë." meta="në radhë" state="pending" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// 24h window closed — free-form blocked, template offered
const SendWindowClosed = () => (
  <CThread patient="Vera Lleshi" statusRow={<CStatusRow mode="you" />}
    messages={<React.Fragment>
      <CSys>2 maj · klientja nisi bisedën</CSys>
      <CBubble side="left" text="Faleminderit, shihemi të premten." meta="2 maj 16:40" />
      <CSys>— kanë kaluar mbi 24 orë —</CSys>
    </React.Fragment>}
    composer={<CComposer state="windowClosed" />} />
);

// connection revoked — reconnect to send
const SendRevoked = () => (
  <CThread patient="Anila Hoxha" statusRow={<CStatusRow mode="you" />}
    messages={baseMsgs}
    composer={<CComposer state="revoked" />} />
);

Object.assign(window, { SendTyped, SendPending, SendFailed, SendOffline, SendWindowClosed, SendRevoked });
