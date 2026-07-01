// Auth — recovery, verification, reset, OAuth states.

const BackToSignIn = () => (
  <div style={{ textAlign: "center", marginTop: 22 }}><span style={{ fontSize: 13.5, color: MT.ink2 }}>← Kthehu te <span style={{ color: MT.brand, fontWeight: 600 }}>hyrja</span></span></div>
);

// forgot password — request
const Forgot = () => (
  <AuthShell>
    <AuthHead title="Rikupero fjalëkalimin" sub="Shkruaj email-in dhe të dërgojmë një lidhje për ta rivendosur." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" focused state="focus" />
      <AuthBtn>Dërgo lidhjen</AuthBtn>
    </div>
    <BackToSignIn />
  </AuthShell>
);

const ForgotSending = () => (
  <AuthShell>
    <AuthHead title="Rikupero fjalëkalimin" sub="Shkruaj email-in dhe të dërgojmë një lidhje për ta rivendosur." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AuthBtn loading>Po dërgohet…</AuthBtn>
    </div>
    <BackToSignIn />
  </AuthShell>
);

// forgot password — sent (success)
const ForgotSent = () => (
  <AuthShell>
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: MT.greenTint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={26} color={MT.greenInk} strokeWidth={2} /></div>
    </div>
    <h1 style={{ fontFamily: MT.display, fontSize: 27, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, margin: 0, lineHeight: 1.14 }}>Kontrollo email-in</h1>
    <p style={{ fontSize: 14.5, color: MT.ink2, margin: "10px 0 0", lineHeight: 1.5 }}>Nëse ekziston një llogari për <span style={{ color: MT.ink, fontWeight: 600 }}>elira@studio.al</span>, të dërguam një lidhje për të rivendosur fjalëkalimin.</p>
    <div style={{ marginTop: 26 }}><GoogleBtn>Hap aplikacionin e email-it</GoogleBtn></div>
    <BackToSignIn />
  </AuthShell>
);

// email verification after sign-up
const VerifyEmail = () => (
  <AuthShell>
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: MT.brandTint, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="bell" size={26} color={MT.brand} /></div>
    </div>
    <h1 style={{ fontFamily: MT.display, fontSize: 27, fontWeight: 600, letterSpacing: "-0.03em", color: MT.ink, margin: 0, lineHeight: 1.14 }}>Konfirmo email-in</h1>
    <p style={{ fontSize: 14.5, color: MT.ink2, margin: "10px 0 0", lineHeight: 1.5 }}>Të dërguam një lidhje verifikimi te <span style={{ color: MT.ink, fontWeight: 600 }}>elira@studio.al</span>. Hape për të aktivizuar llogarinë dhe vazhdo.</p>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 26 }}>
      <GoogleBtn>Hap aplikacionin e email-it</GoogleBtn>
      <button style={{ height: 46, background: "transparent", border: "none", color: MT.ink2, fontFamily: MT.sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Ridërgo lidhjen</button>
    </div>
  </AuthShell>
);

// reset — set a new password (from email link)
const ResetPassword = () => (
  <AuthShell>
    <AuthHead title="Vendos fjalëkalim të ri" sub="Zgjidh një fjalëkalim të ri për llogarinë tënde." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Fjalëkalimi i ri" type="password" value="" placeholder="Të paktën 8 karaktere" />
      <AField label="Përsërit fjalëkalimin" type="password" value="" placeholder="Shkruaje sërish" />
      <AuthBtn>Ruaj fjalëkalimin</AuthBtn>
    </div>
    <BackToSignIn />
  </AuthShell>
);

// OAuth — redirecting to Google
const OauthRedirect = () => (
  <AuthShell>
    <AuthHead title="Mirë se u ktheve" sub="Hyr për të parë kalendarin dhe bisedat." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AField label="Fjalëkalimi" type="password" value="elira2026" hint="Harrove?" />
      <AuthBtn>Hyr</AuthBtn>
    </div>
    <Or />
    <GoogleBtn redirecting>Po të ridrejtojmë…</GoogleBtn>
    <AuthFoot q="Nuk ke llogari?" a="Regjistrohu" />
  </AuthShell>
);

// OAuth — error toast over sign in
const OauthError = () => (
  <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0 }}><SignIn /></div>
    <div style={{ position: "absolute", top: 20, left: 16, right: 16, zIndex: 3 }}>
      <Toast tone="danger" icon="x" text="S'u nis dot hyrja me Google. Provo sërish." />
    </div>
  </div>
);

Object.assign(window, { Forgot, ForgotSending, ForgotSent, VerifyEmail, ResetPassword, OauthRedirect, OauthError });
