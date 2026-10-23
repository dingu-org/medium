/** Onboarding wizard + the data-derived step list. */
export const onboarding = {
  metaTitle: 'Fillo · Medium',
  welcomeTitle: 'Mirë se erdhe te Medium',
  welcomeSub:
    "Asistenti yt që pret klientët në WhatsApp dhe u rezervon takimet pa pasur nevojë t'i përgjigjesh çdo mesazhi.",
  start: 'Fillo',
  skip: 'Kalo për tani',
  goToApp: 'Shko te paneli',
  helpLink: 'Ke nevojë për ndihmë?',
  allSetTitle: 'U regjistrove.',
  allSetSub:
    'Medium tashmë mund të pranojë rezervime në WhatsApp. Klienti i parë që shkruan do të marrë përgjigje brenda sekondash.',

  stepOf: (i: number, n: number) => `Hapi ${i} nga ${n}`,
  progress: (done: number, total: number) =>
    `${done} nga ${total} të përfunduara`,

  /** Guided onboarding shell (MED-115). Canvas strings; see the sprint notes for the invented ones. */
  flow: {
    helper: 'Progresi ruhet automatikisht',
    saving: 'Po ruhet…',
    continue: 'Vazhdo',
    back: 'Mbrapa',
    signOut: 'Dil',
    signOutLabel: 'Dil. Progresi yt është ruajtur.',
    stepOf: (n: number, total: number) => `Hapi ${n} nga ${total}`,
    done: 'Përfunduar',
    progressLabel: 'Progresi i konfigurimit',
    fixErrors: 'Plotëso fushat e shënuara më sipër.',
    saveFailedTitle: 'Nuk u ruajt.',
    saveFailedBody:
      'Kontrollo lidhjen e internetit. Gjithçka që shkrove është ende këtu.',
    retry: 'Provo sërish',
    later: 'Më vonë',
    notNow: 'Jo tani',
    goToApp: 'Shko te paneli',
  },

  /** Step 1, How it works (MED-116). Canvas strings, verbatim. */
  howItWorks: {
    title: 'Ja si funksionon',
    steps: [
      'Klientët të shkruajnë në WhatsApp.',
      'Medium u përgjigjet dhe gjen një orë që të përshtatet ty.',
      'Ti merr takimin, gati në kalendar.',
    ],
    timeNote:
      "Konfigurimi zgjat disa minuta. Nëse s'ke ende numër WhatsApp Business, marrja e tij mund të zgjasë më shumë.",
  },

  steps: {
    profileTitle: 'Profili yt',
    profileSub: 'Shto emrin e biznesit dhe të dhënat e kontaktit.',
    profileCta: 'Rregullo profilin',
    whatsappTitle: 'Lidh WhatsApp',
    whatsappSub:
      'Lidh numrin tënd të WhatsApp Business që klientët të shkruajnë.',
    whatsappCta: 'Lidh',
    availabilityTitle: 'Cakto disponueshmërinë',
    availabilitySub: 'Trego kur mund të rezervojnë klientët.',
    availabilityCta: 'Cakto orët',
    servicesTitle: 'Shto shërbimet',
    servicesSub: "Çfarë shërbimesh ofron dhe si t'u përgjigjet.",
    servicesCta: 'Shto shërbime',
    testMessageTitle: 'Dërgo një mesazh provë',
    testMessageSub:
      'Shkruaji numrit tënd të lidhur në WhatsApp për të parë asistentin të përgjigjet.',
  },
} as const;
