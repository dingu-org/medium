/** Onboarding wizard + the data-derived step list. */
export const onboarding = {
  metaTitle: 'Fillo · Medium',
  welcomeTitle: 'Mirë se erdhe te Medium',
  welcomeSub:
    "Asistenti yt që pret pacientët në WhatsApp dhe u rezervon takimet pa pasur nevojë t'i përgjigjesh çdo mesazhi.",
  start: 'Fillo',
  skip: 'Kalo për tani',
  goToApp: 'Shko te paneli',
  allSetTitle: 'U regjistrove.',
  allSetSub:
    'Medium tashmë mund të pranojë rezervime në WhatsApp. Pacienti i parë që shkruan do të marrë përgjigje brenda sekondash.',

  stepOf: (i: number, n: number) => `Hapi ${i} nga ${n}`,
  progress: (done: number, total: number) => `${done} nga ${total} të përfunduara`,

  steps: {
    profileTitle: 'Profili yt',
    profileSub: 'Shto emrin e praktikës dhe zonën kohore.',
    profileCta: 'Rregullo profilin',
    whatsappTitle: 'Lidh WhatsApp',
    whatsappSub: 'Lidh numrin tënd të WhatsApp Business që pacientët të shkruajnë.',
    whatsappCta: 'Lidh',
    availabilityTitle: 'Cakto disponueshmërinë',
    availabilitySub: 'Trego kur mund të rezervojnë pacientët.',
    availabilityCta: 'Cakto orët',
    servicesTitle: 'Shto shërbimet',
    servicesSub: "Çfarë shërbimesh ofron dhe si t'u përgjigjet.",
    servicesCta: 'Shto shërbime',
    testMessageTitle: 'Dërgo një mesazh provë',
    testMessageSub:
      'Shkruaji numrit tënd të lidhur në WhatsApp për të parë asistentin të përgjigjet.',
  },
} as const;
