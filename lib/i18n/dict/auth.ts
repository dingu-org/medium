/** Auth screens: sign in, sign up, password recovery, validation. */
export const auth = {
  signIn: {
    title: 'Mirë se u ktheve',
    subtitle: 'Hyr për të parë kalendarin dhe bisedat.',
    email: 'Email',
    password: 'Fjalëkalimi',
    forgot: 'Harrove?',
    submit: 'Hyr',
    submitting: 'Po hyn…',
    redirecting: 'Po ridrejtohesh…',
    google: 'Vazhdo me Google',
    or: 'ose',
    footerQuestion: 'Nuk ke llogari?',
    footerAction: 'Regjistrohu',
    wrong: 'Email ose fjalëkalim i pasaktë.',
    confirmHint: 'Konfirmo email-in për të aktivizuar llogarinë, pastaj hyr.',
    // Shown when an emailed link fails at /auth/callback. The most common cause
    // is opening the mail in another browser than the one that requested it —
    // the PKCE verifier lives in that browser's cookies — so the banner always
    // offers a fresh link.
    linkFailed:
      'Lidhja nuk funksionoi — ose ka skaduar, ose u hap në një shfletues tjetër nga ai që e kërkoi.',
    linkFailedAction: 'Kërko një lidhje të re',
  },

  signUp: {
    title: 'Krijo llogarinë',
    subtitle: 'Lëre Medium-in të menaxhojë takimet — ti merru me punën.',
    emailPlaceholder: 'ti@biznesi.al',
    passwordPlaceholder: 'Të paktën 8 karaktere',
    submit: 'Krijo llogarinë',
    submitting: 'Po krijohet…',
    footerQuestion: 'Ke llogari?',
    footerAction: 'Hyr',
    emailTaken: 'Ky email është i regjistruar tashmë.',
  },

  forgot: {
    title: 'Rivendos fjalëkalimin',
    subtitle: 'Të dërgojmë një lidhje për ta rivendosur.',
    submit: 'Dërgo lidhjen',
    submitting: 'Po dërgohet…',
    sent: 'Të dërguam një email me udhëzimet.',
    backToSignIn: 'Kthehu te hyrja',
  },

  reset: {
    title: 'Zgjidh fjalëkalim të ri',
    subtitle: 'Përdor të paktën 8 karaktere.',
    password: 'Fjalëkalimi i ri',
    confirm: 'Përsërit fjalëkalimin',
    submit: 'Ruaj fjalëkalimin',
    submitting: 'Po ruhet…',
    mismatch: 'Fjalëkalimet nuk përputhen.',
    complete: 'Fjalëkalimi u ndryshua. Mund të hysh tani.',
  },

  errors: {
    emailInvalid: 'Shkruaj një email të vlefshëm.',
    passwordRequired: 'Fjalëkalimi është i detyrueshëm.',
    passwordMin: 'Fjalëkalimi duhet të ketë të paktën 8 karaktere.',
    oauthFailed: 'Nuk mund të fillojë hyrja me Google. Provo sërish.',
    callbackFailed:
      'Lidhja e hyrjes ka skaduar ose nuk është e vlefshme. Provo sërish.',
    signUpFailed: 'Llogaria nuk u krijua. Provo sërish.',
  },

  layout: {
    privacyPolicy: 'Politika e privatësisë',
    termsOfService: 'Kushtet e shërbimit',
    help: 'Ndihmë',
  },
} as const;
