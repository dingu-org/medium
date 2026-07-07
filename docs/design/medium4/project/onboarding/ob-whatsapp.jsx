// WhatsApp Embedded Signup — full state matrix. Copy grounded in connect-whatsapp.tsx error kinds.

// Launchpad (the step-2 entry)
const WALaunch = () => <OShell step={1}><WAExplain /></OShell>;

// Connecting — Meta popup open / exchanging token (loading)
const WAConnecting = () => (
  <OShell step={1}>
    <WAStatus eyebrow="Hapi 2 nga 4" tone="info" spin
      title="Po lidhet me WhatsApp…"
      body="Dritarja e Meta-s është e hapur. Zgjidh numrin dhe jep lejet — mos e mbyll këtë faqe."
      detail={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <WhatsAppMark size={18} />
        <span style={{ flex: 1, fontSize: 13, color: MT.ink2, lineHeight: 1.45 }}>Po presim përgjigjen nga Meta. Po krijohen edhe shabllonet e kujtesave.</span>
      </div>}
      ghost="Anulo lidhjen" />
  </OShell>
);

// Connected — success (matches toast.success copy)
const WAConnected = () => (
  <OShell step={1}>
    <WAStatus eyebrow="Hapi 2 nga 4" tone="success" icon="check"
      title="WhatsApp u lidh"
      body="Aplikacioni WhatsApp Business u lidh. Sinkronizimi po fillon."
      detail={<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: MT.green }} /><span style={{ flex: 1, fontSize: 13.5, color: MT.ink, fontWeight: 500 }}>+355 69 123 4567</span><ChannelChip state="connected" /></div>
        <div style={{ height: 1, background: MT.sep }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Icon name="clock" size={16} color={MT.amber} /><span style={{ flex: 1, fontSize: 12.5, color: MT.ink2 }}>Shablloni i kujtesave</span><span style={{ fontSize: 12, color: MT.amberInk, fontFamily: MT.mono }}>Në miratim</span></div>
      </div>}
      primary={<WAPrimary>Vazhdo</WAPrimary>} />
  </OShell>
);

// Error: business verification rejected — "Meta could not verify the business…"
const WARejected = () => (
  <OShell step={1}>
    <WAStatus eyebrow="Hapi 2 nga 4" tone="danger" icon="x"
      title="Verifikimi u refuzua"
      body="Meta nuk e verifikoi dot biznesin. Kontrollo të dhënat dhe provo sërish."
      detail={<div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MT.ink3, fontFamily: MT.mono, marginBottom: 9 }}>Arsye të zakonshme</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {["Dokumentet e paqarta ose të skaduara", "Emri i biznesit s'përputhet me regjistrimin", "Numri s'është llogari WhatsApp Business"].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 9, fontSize: 13, color: MT.ink2, lineHeight: 1.4 }}><span style={{ color: MT.red, marginTop: 1 }}>•</span>{t}</div>
          ))}
        </div>
      </div>}
      primary={<WAPrimary whatsapp>Provo sërish</WAPrimary>}
      secondary={<WASecondary>Si t'i rregulloj?</WASecondary>} />
  </OShell>
);

// Error: number already in use — "That number is already connected to another provider…"
const WADuplicate = () => (
  <OShell step={1}>
    <WAStatus eyebrow="Hapi 2 nga 4" tone="warning" icon="phone"
      title="Numri është në përdorim"
      body="Ky numër është lidhur me një ofrues tjetër. Shkëpute atje, pastaj provo sërish."
      detail={<div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MT.ink3, fontFamily: MT.mono, marginBottom: 9 }}>Si ta shkëpusësh</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {["Hap WhatsApp në telefon", "Cilësimet → Llogaria → Fshi llogarinë", "Kthehu këtu dhe provo sërish"].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: MT.amberTint, color: MT.amberInk, fontSize: 11, fontWeight: 700, fontFamily: MT.mono, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 13, color: MT.ink2, lineHeight: 1.4 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>}
      primary={<WAPrimary whatsapp>Provo sërish</WAPrimary>}
      ghost="Përdor numër tjetër" />
  </OShell>
);

// Error: connection incomplete / cancelled — "Connection incomplete — you can resume anytime."
const WAIncomplete = () => (
  <OShell step={1}>
    <WAStatus eyebrow="Hapi 2 nga 4" tone="info" icon="handoff"
      title="Lidhja mbeti përgjysmë"
      body="Dritarja u mbyll para se të përfundonte. Mund ta vazhdosh kurdo — asgjë nuk humbi."
      primary={<WAPrimary whatsapp>Vazhdo lidhjen</WAPrimary>}
      ghost="Bëje më vonë" />
  </OShell>
);

// Offline — "WhatsApp signup requires a connection."
const WAOffline = () => (
  <OShell step={1}>
    <WAStatus eyebrow="Hapi 2 nga 4" tone="warning" icon="phone"
      title="S'ka lidhje interneti"
      body="Lidhja e WhatsApp kërkon internet. Kontrollo lidhjen dhe provo sërish."
      primary={<WAPrimary>Provo sërish</WAPrimary>} />
  </OShell>
);

// Post-onboarding: token revoked / disconnected later — dashboard banner + reconnect launchpad
const WAReconnect = () => (
  <OShell step={1}>
    <div style={{ marginBottom: 18 }}>
      <Banner tone="danger" icon="phone" title="WhatsApp u shkëput" text="Leja skadoi ose u tërhoq. Pacientët nuk po marrin përgjigje derisa ta rilidhësh." />
    </div>
    <WAExplain reconnect />
  </OShell>
);

Object.assign(window, { WALaunch, WAConnecting, WAConnected, WARejected, WADuplicate, WAIncomplete, WAOffline, WAReconnect });
