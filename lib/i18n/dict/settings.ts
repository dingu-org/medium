/** Settings (profile / AI / notifications / retention / WhatsApp / danger zone)
 *  + the availability editor. */
export const settings = {
  sectionNotifications: 'Njoftimet',
  dangerZone: 'Zona e rrezikut',
  dangerNote: "Veprimet e zonës së rrezikut s'kthehen.",

  whatsappBusiness: 'WhatsApp Business',
  connected: 'I lidhur',
  reconnect: 'Rilidh',
  comingSoon: 'Së shpejti',

  notifNewBookings: 'Rezervime të reja',
  notifCancellations: 'Anulime',
  notifReschedules: 'Ricaktime',
  notifEscalations: 'Eskalime',
  notifManualReply: 'Mesazhe që presin ty',
  notifManualReplySub: 'Kur ti menaxhon bisedën dhe pacienti të shkruan',
  notifReminderFailure: 'Dështime të kujtesave',
  notifConnection: 'Shkëputje e WhatsApp',
  notifResumeOffer: 'Rikthim i asistentit',
  notifBilling: 'Kufijtë mujorë',
  notifBillingSub: 'Kur i afrohesh ose arrin kufirin e muajit',
  notifGroupAppointments: 'Takimet',
  notifGroupConversations: 'Bisedat',
  notifGroupSystem: 'Sistemi',
  notifEscalationSub: 'Kur biseda kalon te ti',
  notifSaveFailed: 'Nuk u ruajt njoftimi. Provo sërish.',

  // Push notifications (per-device) master card
  pushCardTitle: 'Njoftimet në këtë pajisje',
  pushDeviceGeneric: 'Kjo pajisje',
  pushBlocked:
    'Njoftimet janë të bllokuara. Lejoji te cilësimet e shfletuesit për këtë faqe.',
  pushUnsupported: 'Ky shfletues nuk mbështet njoftime push.',
  pushEnabledToast: 'Njoftimet u aktivizuan.',
  pushDisabledToast: 'Njoftimet u çaktivizuan.',
  pushBlockedToast: 'Njoftimet janë të bllokuara në shfletues.',
  pushErrorToast: 'Nuk u aktivizuan njoftimet. Provo sërish.',

  exportData: 'Eksporto të dhënat',
  exportSub: 'Takime, klientë, biseda · JSON',
  retentionDays: (n: number) => `${n} ditë`,

  fullName: 'Emri',
  aiName: 'Emri i asistentit',

  availability: 'Disponueshmëria',
  services: 'Shërbimet',
  servicesTitle: 'Shërbimet',
  servicesIntro: 'Menaxho shërbimet që mund të rezervojnë klientët.',
  serviceName: 'Emri i shërbimit',
  serviceDuration: 'Kohëzgjatja',
  serviceAdd: 'Shto shërbim',
  serviceEdit: 'Ndrysho shërbimin',
  serviceSave: 'Ruaj',
  serviceActive: 'Aktiv',
  serviceEmpty: 'Ende asnjë shërbim',
  serviceEmptySub: 'Shto të paktën një shërbim për të pranuar rezervime.',
  serviceOnlineOnly: 'Shërbimet mund të ndryshohen vetëm kur je online.',
  serviceSaved: 'Shërbimi u ruajt.',

  disconnectWhatsapp: 'Shkëput WhatsApp',
  deleteAccount: 'Fshi llogarinë',
  disconnectTitle: 'Shkëput WhatsApp?',
  disconnectBody:
    'Pacientët nuk do të marrin asnjë përgjigje derisa ta rilidhësh. Takimet dhe historiku ruhen.',
  disconnectConfirm: 'Shkëput',
  deleteTitle: 'Fshi llogarinë?',
  deleteBody:
    "Kjo fshin përgjithmonë praktikën, klientët, takimet, bisedat dhe lidhjen me WhatsApp. S'kthehet.",
  deleteConfirm: 'Fshi llogarinë',
  savedToast: 'Ndryshimet u ruajtën.',

  exportFailed: 'Eksporti dështoi. Provo sërish.',

  // Assistant identity fields (assistant screen)
  aiGreetingPlaceholder: 'Ej! Faleminderit që na shkruat…',
  aiEscalationHint: 'Kur pacienti dërgon këtë fjalë, AI ia kalon bisedën ty.',

  // Account & data screen (Phase 15 · task 12)
  accountSection: 'Llogaria',
  emailRow: 'Email',
  dataSection: 'Të dhënat',
  dataFooter:
    'Bisedat më të vjetra se afati fshihen vetë. Takimet dhe klientët ruhen gjithmonë.',
  retentionRow: 'Ruajtja e bisedave',
  retentionFailed: 'Nuk u ruajt afati. Provo sërish.',
  deleteTypePromptPre: 'Shkruaj ',
  deleteTypePromptPost: ' për të konfirmuar',

  // Offline states
  settingsRequireConnection: 'Cilësimet kërkojnë lidhje.',

  // WhatsApp connection badge labels
  connectionBadgePending: 'Në pritje',
  connectionBadgeNotConnected: 'Nuk është lidhur',

  // WhatsApp env note (dev affordance)
  whatsappEnvNote:
    'Vendos NEXT_PUBLIC_META_APP_ID dhe NEXT_PUBLIC_META_CONFIG_ID për të aktivizuar regjistrimin.',

  // WhatsApp — not connected (wa-connect)
  whatsappConnectBullets: [
    {
      title: 'Numri yt i WhatsApp Business',
      sub: 'Jo një numër personal — duhet llogari Business.',
    },
    {
      title: 'Verifikim përmes Meta-s',
      sub: 'Hapet dritarja e Meta-s; ti zgjedh numrin dhe jep leje.',
    },
    {
      title: 'Pas lidhjes, Medium fillon vetë',
      sub: 'Shabllonet e kujtesave krijohen automatikisht.',
    },
  ],
  whatsappConnectNote: 'Hapet te Meta · zgjat ~2 minuta',

  // WhatsApp — pending (client in-flight, wa-pending)
  whatsappPendingTitle: 'Po lidhet me Meta-n',
  whatsappPendingBody:
    'Po verifikojmë numrin dhe lejet. Zakonisht zgjat më pak se një minutë.',

  // WhatsApp — connected (wa-connected)
  whatsappRemindersLabel: 'Kujtesat',
  whatsappTemplateEyebrow: 'Shablloni i kujtesës',
  whatsappTemplateApproved: 'Miratuar',
  whatsappTemplatePending: 'Në pritje',
  whatsappTemplateRejected: 'Refuzuar',
  whatsappTemplatePreparing: 'Po krijohet…',
  whatsappTemplateNote:
    'Shablloni miratohet nga Meta dhe nuk ndryshohet nga aplikacioni.',
  // Sample bubble (keywords are KwTag chips → t.ops.confirm / t.ops.cancel)
  whatsappTemplatePreviewLead:
    'Kujtesë: keni një takim nesër në 14:30. Përgjigjuni ',
  whatsappTemplatePreviewMid: ' për ta konfirmuar ose ',
  whatsappTemplatePreviewTail: ' për ta anuluar.',

  // WhatsApp — revoked (wa-revoked)
  whatsappRevokedTitle: 'Lidhja u revokua',
  whatsappRevokedBody: (number?: string) =>
    number
      ? `Meta e ndërpreu lejen për numrin ${number}. Pacientët nuk po marrin përgjigje.`
      : 'Meta e ndërpreu lejen. Pacientët nuk po marrin përgjigje.',
  whatsappReconnectNote: 'Rilidhja mban numrin dhe historikun',

  // ConnectWhatsApp button + toasts
  whatsappConnecting: 'Po lidhet…',
  whatsappConnectBusiness: 'Lidh WhatsApp Business',
  whatsappReconnectBusiness: 'Rilidh WhatsApp Business',
  whatsappRequiresConnection: 'WhatsApp kërkon lidhje.',
  whatsappNotConfigured: 'WhatsApp nuk është konfiguruar.',
  whatsappRequiresHttps:
    'WhatsApp kërkon HTTPS — Facebook e bllokon në http://. Hap aplikacionin nëpërmjet HTTPS.',
  whatsappIncomplete: 'Lidhja mbeti e paplotë — mund ta vazhdosh kurdo.',
  whatsappIncompleteTitle: 'Lidhja mbeti përgjysmë',
  whatsappSuccess: 'WhatsApp Business u lidh. Sinkronizimi po fillon.',
  whatsappFailed: 'Diçka shkoi keq me lidhjen e WhatsApp. Provo sërish.',
  whatsappFailedTitle: 'Lidhja nuk u përfundua',
  whatsappErrRejectedTitle: 'Verifikimi u refuzua',
  whatsappErrRejected:
    'Meta nuk e verifikoi dot biznesin. Kontrollo të dhënat dhe provo sërish.',
  whatsappErrRejectedReasons: [
    'Dokumentet e paqarta ose të skaduara',
    "Emri i biznesit s'përputhet me regjistrimin",
    "Numri s'është llogari WhatsApp Business",
  ],
  whatsappErrDuplicateTitle: 'Numri është i zënë',
  whatsappErrDuplicate:
    'Ky numër është lidhur me një ofrues tjetër. Shkëpute atje dhe provo sërish.',
  whatsappCommonReasons: 'Arsye të zakonshme',

  // Danger zone toasts / inline
  disconnectRequiresConnection: 'Shkëputja e WhatsApp kërkon lidhje.',
  deleteRequiresConnection: 'Fshirja e llogarisë kërkon lidhje.',
  disconnectedToast: 'WhatsApp u shkëput.',
  disconnectFailed: 'Nuk u shkëput. Provo sërish.',
  deleteFailed: 'Nuk u fshi llogaria. Provo sërish.',
  disconnecting: 'Po shkëputet…',
  deleting: 'Po fshihet…',

  // Hub (Ti)
  hubTitle: 'Ti',
  groupPraktika: 'Praktika',
  groupMedium: 'Medium',
  groupLlogaria: 'Llogaria',
  profileBusiness: 'Profili i biznesit',
  assistant: 'Asistenti',
  accountAndData: 'Llogaria & të dhënat',
  helpAndContact: 'Ndihmë & kontakt',
  signOut: 'Dil nga llogaria',
  assistantActive: 'Aktiv',
  assistantPaused: 'Në pauzë',

  // Profile screen (Phase 15 task 6)
  profileTitleLabel: 'Titulli',
  profileTitleHelp: 'Medium e përdor kur u prezantohet pacientëve.',
  profilePracticeLabel: 'Emri i praktikës',
  profileAddressLabel: 'Adresa',
  profileAddressHelp: 'Medium e përdor kur pacientët pyesin ku ndodhesh.',
  profilePhoneLabel: 'Telefoni',
  profilePhoneHelp: 'Vjen nga lidhja me WhatsApp Business. Ndryshohet aty.',
  profilePracticeRequired: 'Shkruaj emrin e praktikës.',

  // AssistantCard (hub + assistant screen)
  assistantCardActiveTitle: 'Medium po përgjigjet',
  assistantCardActiveSub: 'Përgjigjet dhe rezervon vetë në WhatsApp.',
  assistantCardPausedTitle: 'Medium është në pauzë',
  assistantCardPausedSub: 'Pacientët nuk marrin asnjë përgjigje në WhatsApp.',
  assistantToggleLabel: 'Ndiz ose fik asistentin',
  pauseFailed: 'Nuk u ndryshua gjendja e asistentit. Provo sërish.',

  // Assistant identity (Asistenti screen — Identiteti group)
  assistantIdentityGroup: 'Identiteti',
  assistantIdentityFooter:
    'Kur pacienti shkruan NDIHMË — ose Medium nuk kupton — biseda kalon te ti automatikisht.',
  assistantGreetingRow: 'Prezantimi',
  assistantKeywordRow: 'Fjala e ndihmës',
  assistantValueUnset: 'Pa vendosur',
  assistantNameHelp: 'Emri me të cilin Medium u prezantohet pacientëve.',
  assistantGreetingHelp:
    'Mesazhi i parë që dërgon Medium kur pacienti shkruan për herë të parë.',

  // OfflineNote (shared gate)
  offlineNote: 'Je jashtë linje — ndryshimet nuk ruhen dot tani.',

  // VersionFoot
  versionLabel: (version?: string, build?: string) =>
    `Medium ${version ?? '—'}${build ? ` · ${build}` : ''}`,

  // Services list (Phase 15 redesign)
  serviceActiveCount: (n: number) => `${n} aktive`,
  serviceListFooter: 'Medium u ofron pacientëve vetëm shërbimet aktive.',
  serviceMeta: (durationMinutes: number, price: string | null) =>
    price ? `${durationMinutes} min · ${price} Lekë` : `${durationMinutes} min`,

  // Service edit sheet
  serviceDurationChip: (m: number) => `${m}′`,
  serviceDurationOther: 'Tjetër',
  serviceMinutesLabel: 'Minuta',
  serviceMinutesSuffix: 'min',
  serviceMinutesHelp: 'Nga 5 deri në 480 minuta.',
  servicePriceLabel: 'Çmimi',
  servicePriceSuffix: 'Lekë',
  serviceDelete: 'Fshi shërbimin',
  serviceDeleted: 'Shërbimi u fshi.',
} as const;

/** Availability editor (weekly hours + blocked periods + timezone). */
export const availability = {
  title: 'Disponueshmëria',
  blockedPeriods: 'Periudha të bllokuara',
  addBlocked: 'Shto periudhë',
  closed: 'Mbyllur',

  // Weekly hours section
  weeklyScheduleLabel: 'Orari javor',
  copyMonday: 'Kopjo të hënën kudo',
  copyMondayToast: 'Orari i së hënës u kopjua te të gjitha ditët.',
  endAfterStart: 'Ora e mbarimit duhet të jetë pas orës së fillimit.',
  savedToast: 'Disponueshmëria u ruajt.',

  // Blocked periods section + add sheet
  deleteBlockedAriaLabel: 'Fshi periudhën e bllokuar',
  addBlockDate: 'Data',
  timeRangeLabel: 'Orari',
  addBlockLabelOptional: 'Etiketa (opsionale)',
  addBlockLabelPlaceholder: 'p.sh. Pushim',
  pickDate: 'Zgjidh një datë për të bllokuar.',
  addedToast: 'Periudha e bllokuar u shtua.',

  // Timezone group + picker sheet
  timezone: 'Zona kohore',
  timezoneSearch: 'Kërko zonën kohore',
  timezoneSaved: 'Zona kohore u ruajt.',
  timezoneFailed: 'Zona kohore nuk u ruajt. Provo sërish.',

  // Aria labels for time inputs
  startTimeAriaLabel: (day: string) => `${day} ora e fillimit`,
  endTimeAriaLabel: (day: string) => `${day} ora e mbarimit`,
  blockStartAriaLabel: 'Ora e fillimit të bllokimit',
  blockEndAriaLabel: 'Ora e mbarimit të bllokimit',

  // Weekday names (Monday-first display order, JS getDay() values)
  days: {
    0: 'E diel',
    1: 'E hënë',
    2: 'E martë',
    3: 'E mërkurë',
    4: 'E enjte',
    5: 'E premte',
    6: 'E shtunë',
  } as Record<number, string>,

  // Short weekday labels (JS getDay() index) for summary chips.
  daysShort: {
    0: 'Die',
    1: 'Hën',
    2: 'Mar',
    3: 'Mër',
    4: 'Enj',
    5: 'Pre',
    6: 'Sht',
  } as Record<number, string>,
} as const;
