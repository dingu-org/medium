// Thread handling states — AI handling, escalated/needs-you, manual takeover,
// AI paused (owner messaged from own WhatsApp), debounced rapid messages.

// 1 · Medium handling the booking autonomously
const ThreadAI = () => (
  <CThread patient="Anila Hoxha"
    statusRow={<CStatusRow mode="ai" />}
    messages={<React.Fragment>
      <CSys>6 maj · klientja nisi bisedën</CSys>
      <CBubble side="left" text="Përshëndetje, dua një takim këtë javë." meta="09:02" />
      <CBubble side="left" who="ai" text="Sigurisht. Cili shërbim ju duhet — vlerësim i parë apo seancë vijuese?" meta="09:02" />
      <CBubble side="left" text="Vijuese." meta="09:03" />
      <CBubble side="left" who="ai" text="Kam të lirë të mërkurën në 10:00 ose të enjten në 14:30. Cila ju shkon?" meta="09:03" />
      <CBubble side="left" text="E mërkura në 10:00." meta="09:05" />
      <CBubble side="left" who="ai" text="Mirë, ju kam rezervuar të mërkurën më 8 maj në orën 10:00. A doni një kujtesë një ditë para?" meta="09:05" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// 2 · Escalated — patient requested human / auto-escalation
const ThreadEscalated = () => (
  <CThread patient="Dritan Sopa"
    statusRow={<CStatusRow mode="escalated" />}
    notice={<CNotice tone="danger" icon="bell" text="Pacienti kërkoi të flasë me një person. Medium ndaloi përgjigjet." action="" />}
    messages={<React.Fragment>
      <CSys>sot · klienti nisi bisedën</CSys>
      <CBubble side="left" text="Më duhet diçka urgjente, kam dhimbje të forta." meta="11:20" />
      <CBubble side="left" who="ai" text="Më vjen keq që keni dhimbje. Dua t'ju lidh drejtpërdrejt me Dr. Hoxhën — ai është njoftuar dhe do t'ju përgjigjet shpejt." meta="11:20" />
      <CBubble side="left" text="Dua të flas me dikë, jo me robot." meta="11:21" />
      <CSys>— Medium ndaloi · pret ty —</CSys>
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// 3 · Manual takeover — you are chatting, can hand back to Medium
const ThreadTakeover = () => (
  <CThread patient="Endi Kola"
    statusRow={<CStatusRow mode="you" />}
    notice={<CNotice tone="success" icon="handoff" text="Ti po bisedon — Medium është në pauzë derisa t'ia kthesh." action="Ktheja Medium-it" />}
    messages={<React.Fragment>
      <CSys>4 maj · klienti nisi bisedën</CSys>
      <CBubble side="left" text="Mirëdita, dua të ricaktoj takimin e së enjtes." meta="14:18" />
      <CBubble side="left" who="ai" text="Sigurisht. Cila ditë ju shkon — e premte ose e hënë tjetër?" meta="14:18" />
      <CSys>— ti more bisedën në dorë —</CSys>
      <CBubble side="right" text="Endi, e premtja në 16:30 është e lirë. Të shkon?" meta="14:21 · dërguar" />
      <CBubble side="left" text="Po, përshtatet. Faleminderit." meta="14:24" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// 4 · AI paused — owner messaged the patient from their own WhatsApp (parallel-messages edge case)
const ThreadPaused = () => (
  <CThread patient="Genti Marku"
    statusRow={<CStatusRow mode="paused" />}
    notice={<CNotice tone="warning" icon="pause" text="Ti i shkrove vetë nga WhatsApp. Medium u ndal automatikisht deri në 15:10." action="Aktivizo tani" />}
    messages={<React.Fragment>
      <CSys>sot · klienti nisi bisedën</CSys>
      <CBubble side="left" text="A jeni në klinikë sot?" meta="14:40" />
      <CSys>— ti iu përgjigje nga WhatsApp · Medium u ndal —</CSys>
      <CBubble side="right" text="Po Genti, jam deri në 18:00. Eja kur të duash." meta="14:41 · nga telefoni yt" />
      <CBubble side="left" text="Faleminderit, vij nga ora 17:00." meta="14:43" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

// 5 · Debounce — rapid client messages grouped into a single turn
const ThreadDebounce = () => (
  <CThread patient="Mira Beqiri"
    statusRow={<CStatusRow mode="ai" />}
    messages={<React.Fragment>
      <CSys>sot · klientja nisi bisedën</CSys>
      <CGroup msgs={["Përshëndetje", "Doja të lija një takim", "A keni kohë sot?"]} meta="13:01 · 3 mesazhe" />
      <CSys>Medium pret pak që klientja të mbarojë para se të përgjigjet</CSys>
      <CBubble side="left" who="ai" text="Përshëndetje. Sot kam të lirë në 16:00 ose 17:30 — cila ju shkon?" meta="13:01" />
    </React.Fragment>}
    composer={<CComposer state="default" />} />
);

Object.assign(window, { ThreadAI, ThreadEscalated, ThreadTakeover, ThreadPaused, ThreadDebounce });
