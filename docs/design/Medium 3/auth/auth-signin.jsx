// Auth screens — sign in / sign up / recovery / verification, every state.

// ── Sign in ──
const SignIn = () => (
  <AuthShell>
    <AuthHead title="Mirë se u ktheve" sub="Hyr për të parë kalendarin dhe bisedat." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AField label="Fjalëkalimi" type="password" value="elira2026" focused hint="Harrove?" state="focus" />
      <AuthBtn>Hyr</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Nuk ke llogari?" a="Regjistrohu" />
  </AuthShell>
);

const SignInValidation = () => (
  <AuthShell>
    <AuthHead title="Mirë se u ktheve" sub="Hyr për të parë kalendarin dhe bisedat." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio" state="error" error="Shkruaj një email të vlefshëm." />
      <AField label="Fjalëkalimi" type="password" value="" placeholder="Fjalëkalimi" hint="Harrove?" state="error" error="Fjalëkalimi është i detyrueshëm." />
      <AuthBtn>Hyr</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Nuk ke llogari?" a="Regjistrohu" />
  </AuthShell>
);

const SignInWrong = () => (
  <AuthShell>
    <AuthHead title="Mirë se u ktheve" sub="Hyr për të parë kalendarin dhe bisedat." />
    <AuthBanner tone="muted" icon="x"><span style={{ color: MT.redInk, fontWeight: 500 }}>Email ose fjalëkalim i pasaktë.</span></AuthBanner>
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AField label="Fjalëkalimi" type="password" value="gabim123" hint="Harrove?" />
      <AuthBtn>Hyr</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Nuk ke llogari?" a="Regjistrohu" />
  </AuthShell>
);

const SignInSubmitting = () => (
  <AuthShell>
    <AuthHead title="Mirë se u ktheve" sub="Hyr për të parë kalendarin dhe bisedat." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AField label="Fjalëkalimi" type="password" value="elira2026" hint="Harrove?" />
      <AuthBtn loading>Po hyn…</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Nuk ke llogari?" a="Regjistrohu" />
  </AuthShell>
);

const SignInConfirmHint = () => (
  <AuthShell>
    <AuthHead title="Mirë se u ktheve" sub="Hyr për të parë kalendarin dhe bisedat." />
    <AuthBanner tone="brand" icon="bell">Konfirmo email-in për të aktivizuar llogarinë, pastaj hyr.</AuthBanner>
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AField label="Fjalëkalimi" type="password" value="" placeholder="Fjalëkalimi" hint="Harrove?" />
      <AuthBtn>Hyr</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Nuk ke llogari?" a="Regjistrohu" />
  </AuthShell>
);

// ── Sign up ──
const SignUp = () => (
  <AuthShell>
    <AuthHead title="Krijo llogarinë" sub="Lëre Medium-in të menaxhojë takimet — ti merru me punën." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="" placeholder="ti@biznesi.al" />
      <AField label="Fjalëkalimi" type="password" value="" placeholder="Të paktën 8 karaktere" />
      <AuthBtn>Krijo llogarinë</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Ke llogari?" a="Hyr" />
  </AuthShell>
);

const SignUpError = () => (
  <AuthShell>
    <AuthHead title="Krijo llogarinë" sub="Lëre Medium-in të menaxhojë takimet — ti merru me punën." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" state="error" error="Ky email është i regjistruar tashmë." />
      <AField label="Fjalëkalimi" type="password" value="123" state="error" error="Fjalëkalimi duhet të ketë të paktën 8 karaktere." />
      <AuthBtn>Krijo llogarinë</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Ke llogari?" a="Hyr" />
  </AuthShell>
);

const SignUpSubmitting = () => (
  <AuthShell>
    <AuthHead title="Krijo llogarinë" sub="Lëre Medium-in të menaxhojë takimet — ti merru me punën." />
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AField label="Email" value="elira@studio.al" />
      <AField label="Fjalëkalimi" type="password" value="elira2026" />
      <AuthBtn loading>Po krijohet…</AuthBtn>
    </div>
    <Or />
    <GoogleBtn>Vazhdo me Google</GoogleBtn>
    <AuthFoot q="Ke llogari?" a="Hyr" />
  </AuthShell>
);

Object.assign(window, { SignIn, SignInValidation, SignInWrong, SignInSubmitting, SignInConfirmHint, SignUp, SignUpError, SignUpSubmitting });
