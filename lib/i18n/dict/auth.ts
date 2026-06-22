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
    google: 'Vazhdo me Google',
    or: 'ose',
    footerQuestion: 'Nuk ke llogari?',
    footerAction: 'Regjistrohu',
    wrong: 'Email ose fjalëkalim i pasaktë.',
    confirmHint: 'Konfirmo email-in për të aktivizuar llogarinë, pastaj hyr.',
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

  errors: {
    emailInvalid: 'Shkruaj një email të vlefshëm.',
    passwordRequired: 'Fjalëkalimi është i detyrueshëm.',
    passwordMin: 'Fjalëkalimi duhet të ketë të paktën 8 karaktere.',
    oauthFailed: 'Nuk mund të fillojë hyrja me Google. Provo sërish.',
  },

  layout: {
    privacyPolicy: 'Politika e privatësisë',
    termsOfService: 'Kushtet e shërbimit',
  },
} as const;
