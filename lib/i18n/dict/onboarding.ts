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

  /** Step 2, Business identity (MED-117). Canvas strings; typeRequired and tooLong are drafted. */
  business: {
    title: 'Biznesi yt',
    sub: 'Emri që shohin klientët dhe çfarë lloj biznesi ke.',
    namePlaceholder: 'p.sh. Studio Elira',
    typeLabel: 'Lloji i biznesit',
    typeHelp: 'Zgjidh atë që të përshtatet më shumë.',
    typeRequired: 'Zgjidh llojin e biznesit.',
    fixOne: 'Plotëso fushën e shënuar për të vazhduar.',
    more: 'Shto më shumë',
    optionalTag: '· me dëshirë',
    ownerLabel: 'Emri yt',
    titlePlaceholder: 'p.sh. Manikyriste',
    taglineLabel: 'Përshkrim i shkurtër',
    taglinePlaceholder: 'p.sh. Manikyr dhe pedikyr në qendër të Tiranës.',
    tooLong: 'Teksti është shumë i gjatë.',
  },

  /**
   * Step 3, Services (MED-118). Canvas strings (3a-3d) except the ones marked
   * DRAFTED, which have no artboard and are listed for the copy review.
   */
  services: {
    title: 'Shërbimi yt',
    sub: "Ajo që rezervojnë klientët te ti. Medium e përdor për t'u treguar çfarë përfshin, sa zgjat dhe sa kushton.",
    subSaved: 'Ky është shërbimi që Medium u ofron klientëve.',
    nameLabel: 'Emri i shërbimit',
    namePlaceholder: 'p.sh. Manikyr me xhel',
    durationLabel: 'Kohëzgjatja',
    durationChip: (m: number) => `${m} min`,
    priceLabel: 'Çmimi',
    pricePlaceholder: 'p.sh. 2500',
    priceSuffix: 'Lekë',
    modeLabel: 'Ku bëhet shërbimi?',
    modes: {
      at_business: {
        title: 'Në ambientin tim',
        sub: 'Klienti vjen në adresën e biznesit.',
      },
      at_client: {
        title: 'Te klienti',
        sub: 'Ti shkon në adresën e klientit.',
      },
      online: {
        title: 'Online',
        sub: 'Me video. Lidhjen ia dërgon vetë klientit.',
      },
    },
    descriptionLabel: 'Përshkrimi',
    descriptionPlaceholder: 'Çfarë përfshin shërbimi',
    descriptionHelp: 'Medium e përdor kur klientët pyesin çfarë përfshin.',
    nameRequired: 'Shkruaj emrin e shërbimit.', // DRAFTED
    durationRequired: 'Zgjidh sa zgjat shërbimi.',
    durationRange: 'Kohëzgjatja duhet të jetë nga 5 deri në 480 minuta.', // DRAFTED
    priceRequired: 'Shkruaj çmimin. Duhet të jetë më shumë se 0.',
    modeRequired: 'Zgjidh ku bëhet shërbimi.',
    descriptionRequired: 'Shkruaj shkurt çfarë përfshin shërbimi.',
    nameTaken: 'Një shërbim me këtë emër ekziston tashmë.',
    fixMany: (n: number) => `Plotëso ${n} fushat e shënuara për të vazhduar.`,
    editLabel: (name: string) => `Ndrysho shërbimin ${name}`,
    add: 'Shto shërbim',
    freeLimit: 'Plani falas përfshin një shërbim.',
    activeLabel: 'Aktiv',
    activeHelp: 'Kur është i fshehur, klientët nuk mund ta rezervojnë.', // DRAFTED
    activeRequired:
      'Të paktën një shërbim duhet të jetë aktiv që klientët të rezervojnë.', // DRAFTED
    hiddenTag: '· i fshehur', // DRAFTED
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
