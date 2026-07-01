// Auth — compose every screen. Look locked: calm / blue / soft.
applyTheme({ atmosphere: "calm", accent: "blue", shape: "soft" });

const CF = ({ children }) => <PhoneFrame>{children}</PhoneFrame>;
const W = 446, H = 918;

const AuthApp = () => (
  <DesignCanvas>
    <DCSection id="signin" title="Hyrja & regjistrimi" subtitle="Sign in / sign up · default · validation · wrong credentials · submitting · confirm hint">
      <DCArtboard id="signin" label="Hyr" width={W} height={H}><CF><SignIn /></CF></DCArtboard>
      <DCArtboard id="signin-validation" label="Gabime fushash" width={W} height={H}><CF><SignInValidation /></CF></DCArtboard>
      <DCArtboard id="signin-wrong" label="Kredenciale të pasakta" width={W} height={H}><CF><SignInWrong /></CF></DCArtboard>
      <DCArtboard id="signin-submitting" label="Po hyn…" width={W} height={H}><CF><SignInSubmitting /></CF></DCArtboard>
      <DCArtboard id="signin-confirm" label="Konfirmo email-in" width={W} height={H}><CF><SignInConfirmHint /></CF></DCArtboard>
      <DCArtboard id="signup" label="Regjistrohu" width={W} height={H}><CF><SignUp /></CF></DCArtboard>
      <DCArtboard id="signup-error" label="Gabime regjistrimi" width={W} height={H}><CF><SignUpError /></CF></DCArtboard>
      <DCArtboard id="signup-submitting" label="Po krijohet…" width={W} height={H}><CF><SignUpSubmitting /></CF></DCArtboard>
    </DCSection>

    <DCSection id="recovery" title="Rikuperim & verifikim" subtitle="Forgot password · sent · verify email · reset · Google OAuth redirect & error">
      <DCArtboard id="forgot" label="Rikupero fjalëkalimin" width={W} height={H}><CF><Forgot /></CF></DCArtboard>
      <DCArtboard id="forgot-sending" label="Po dërgohet…" width={W} height={H}><CF><ForgotSending /></CF></DCArtboard>
      <DCArtboard id="forgot-sent" label="Lidhja u dërgua" width={W} height={H}><CF><ForgotSent /></CF></DCArtboard>
      <DCArtboard id="verify" label="Konfirmo email-in" width={W} height={H}><CF><VerifyEmail /></CF></DCArtboard>
      <DCArtboard id="reset" label="Fjalëkalim i ri" width={W} height={H}><CF><ResetPassword /></CF></DCArtboard>
      <DCArtboard id="oauth-redirect" label="Po të ridrejtojmë" width={W} height={H}><CF><OauthRedirect /></CF></DCArtboard>
      <DCArtboard id="oauth-error" label="Gabim me Google" width={W} height={H}><CF><OauthError /></CF></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById("root")).render(<AuthApp />);
