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
    // Shown when an emailed link fails. Email links verify server-side, so they
    // now work in any browser or device — the old "open it where you asked for
    // it" advice would send the PT down a dead end. Both banners offer a fresh
    // link instead of naming a cause we cannot be sure of.
    linkFailed: 'Lidhja nuk funksionoi. Kërko një lidhje të re për të vazhduar.',
    linkExpired:
      'Kjo lidhje ka skaduar ose është përdorur tashmë. Kërko një lidhje të re për të vazhduar.',
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
