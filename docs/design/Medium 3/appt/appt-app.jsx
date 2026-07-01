// Appointment lifecycle — compose every sheet. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CF = ({ children }) => <PhoneFrame>{children}</PhoneFrame>;
const W = 446, H = 918;

const ApptApp = () => (
  <DesignCanvas>
    <DCSection id="detail" title="Detajet e takimit" subtitle="Bottom sheet over the calendar · confirmed / pending / ended / notes editing">
      <DCArtboard id="d-confirmed" label="Konfirmuar" width={W} height={H}><CF><DetailConfirmed /></CF></DCArtboard>
      <DCArtboard id="d-pending" label="Në pritje" width={W} height={H}><CF><DetailPending /></CF></DCArtboard>
      <DCArtboard id="d-ended" label="Ka mbaruar · kryer/nuk erdhi" width={W} height={H}><CF><DetailEnded /></CF></DCArtboard>
      <DCArtboard id="d-notes" label="Shënim · duke redaktuar" width={W} height={H}><CF><DetailNotes /></CF></DCArtboard>
    </DCSection>

    <DCSection id="actions" title="Ricaktim & anulim" subtitle="Reschedule picker / loading / empty · cancel with reason · results">
      <DCArtboard id="a-reschedule" label="Ricakto · zgjidh orarin" width={W} height={H}><CF><Reschedule /></CF></DCArtboard>
      <DCArtboard id="a-resched-loading" label="Oraret po ngarkohen" width={W} height={H}><CF><RescheduleLoading /></CF></DCArtboard>
      <DCArtboard id="a-resched-empty" label="Asnjë orar i lirë" width={W} height={H}><CF><RescheduleEmpty /></CF></DCArtboard>
      <DCArtboard id="a-cancel" label="Anulo · arsyeja" width={W} height={H}><CF><Cancel /></CF></DCArtboard>
      <DCArtboard id="a-resched-ok" label="U ricaktua · sukses" width={W} height={H}><CF><ResultRescheduled /></CF></DCArtboard>
    </DCSection>

    <DCSection id="create" title="Takim i ri" subtitle="Add menu · existing patient · new patient · block time · booked">
      <DCArtboard id="c-menu" label="Shto · menu" width={W} height={H}><CF><AddMenu /></CF></DCArtboard>
      <DCArtboard id="c-existing" label="Pacient ekzistues" width={W} height={H}><CF><NewApptExisting /></CF></DCArtboard>
      <DCArtboard id="c-new" label="Pacient i ri" width={W} height={H}><CF><NewApptNew /></CF></DCArtboard>
      <DCArtboard id="c-block" label="Blloko kohë" width={W} height={H}><CF><BlockTime /></CF></DCArtboard>
      <DCArtboard id="c-booked" label="U rezervua · sukses" width={W} height={H}><CF><ResultBooked /></CF></DCArtboard>
    </DCSection>

    <DCSection id="sync" title="Sinkronizimi" subtitle="Offline-first mutation results · queued · failed">
      <DCArtboard id="s-queued" label="Në radhë · offline" width={W} height={H}><CF><ResultQueued /></CF></DCArtboard>
      <DCArtboard id="s-failed" label="Dështoi" width={W} height={H}><CF><ResultFailed /></CF></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<ApptApp />);
