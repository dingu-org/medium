// Sheet sections — Form controls + Badges / status.

const FormText = () => (
  <Spec name="Text fields" purpose="50px height, 12px radius. Focus is the brand ring; error is red ring + message.">
    <Block label="States" gap={18}>
      <Cell cap="default"><TextField label="Email" placeholder="ti@biznesi.al" /></Cell>
      <Cell cap="focus"><TextField label="Email" value="elira@studio.al" state="focus" /></Cell>
    </Block>
    <Block label=" " gap={18}>
      <Cell cap="filled"><TextField label="Fjalëkalimi" type="password" value="elira2026" hint="Harrove?" /></Cell>
      <Cell cap="error"><TextField label="Email" value="elira@" state="error" message="Email-i nuk është i vlefshëm." /></Cell>
    </Block>
    <Block label=" " gap={18}>
      <Cell cap="disabled"><TextField label="Numri WhatsApp" value="+355 69 000 0000" state="disabled" /></Cell>
      <Cell cap="textarea"><TextArea label="Shënim" value="Pacienti preferon paradite." /></Cell>
    </Block>
  </Spec>
);

const FormControls = () => (
  <Spec name="Selectors & toggles" purpose="Segmented for 2–3 options; switch for instant on/off; checkbox for multi-select.">
    <Block label="Select" gap={18}>
      <Cell cap="closed"><SelectField label="Shërbimi" value="Seancë vijuese" /></Cell>
      <Cell cap="open"><SelectField label="Shërbimi" value="Seancë vijuese" open /></Cell>
    </Block>
    <Block label="Segmented control">
      <Cell cap="2 options"><Seg value="active" options={[{ k: "active", l: "Aktive" }, { k: "closed", l: "Të mbyllura" }]} /></Cell>
    </Block>
    <Block label="Switch" gap={20}>
      <Cell cap="on"><Toggle on /></Cell>
      <Cell cap="off"><Toggle /></Cell>
      <Cell cap="disabled"><Toggle on disabled /></Cell>
    </Block>
    <Block label="Checkbox" gap={20}>
      <Cell cap="checked"><Checkbox checked label="E hënë" /></Cell>
      <Cell cap="unchecked"><Checkbox label="E diel" /></Cell>
      <Cell cap="focus"><Checkbox label="E martë" state="focus" /></Cell>
      <Cell cap="disabled"><Checkbox checked label="E shtunë" state="disabled" /></Cell>
    </Block>
  </Spec>
);

const BadgeStatus = () => (
  <Spec name="Status pills" purpose="Appointment lifecycle state. Dot + label, semantic tint background.">
    <Block label="Appointment status" gap={12}>
      <Cell cap="confirmed"><StatusPill status="confirmed" /></Cell>
      <Cell cap="pending"><StatusPill status="pending" /></Cell>
      <Cell cap="no response"><StatusPill status="noresp" /></Cell>
      <Cell cap="cancelled"><StatusPill status="cancelled" /></Cell>
    </Block>
    <Block label="Channel state" gap={12}>
      <Cell cap="connected"><ChannelChip state="connected" /></Cell>
      <Cell cap="reconnect"><ChannelChip state="reconnect" /></Cell>
    </Block>
    <Block label=" " gap={12}>
      <Cell cap="pending"><ChannelChip state="pending" /></Cell>
      <Cell cap="coming soon"><ChannelChip state="soon" /></Cell>
    </Block>
  </Spec>
);

const BadgeMisc = () => (
  <Spec name="Handled-by · counts · keywords" purpose="Who's on a thread, unread counts, and protocol keywords the patient texts.">
    <Block label="Handled-by chip" gap={16}>
      <Cell cap="Medium (AI)"><HandledBy who="ai" /></Cell>
      <Cell cap="you (takeover)"><HandledBy who="you" /></Cell>
      <Cell cap="closed"><HandledBy who="closed" /></Cell>
    </Block>
    <Block label="Counts & dots" gap={16}>
      <Cell cap="unread"><Count n={2} /></Cell>
      <Cell cap="needs you"><Count n={1} tone="amber" /></Cell>
      <Cell cap="urgent"><Count n={3} tone="red" /></Cell>
      <Cell cap="unread dot"><span style={{ width: 10, height: 10, borderRadius: 999, background: MT.brand, display: "inline-block" }} /></Cell>
    </Block>
    <Block label="Protocol keywords" gap={8}>
      <Cell><KwTag>KONFIRMO</KwTag></Cell>
      <Cell><KwTag>ANULO</KwTag></Cell>
      <Cell><KwTag>RICAKTO</KwTag></Cell>
      <Cell><KwTag>NDIHMË</KwTag></Cell>
    </Block>
  </Spec>
);

Object.assign(window, { FormText, FormControls, BadgeStatus, BadgeMisc });
