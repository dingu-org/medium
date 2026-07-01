/** Settings (profile / AI / notifications / retention / WhatsApp / danger zone)
 *  + the availability editor. */
export const settings = {
  title: 'Llogaria & të dhënat',
  sectionChannel: 'Kanali',
  sectionNotifications: 'Njoftimet',
  sectionData: 'Të dhënat e tua',
  sectionProfile: 'Profili',
  sectionAi: 'Asistenti',
  dangerZone: 'Zona e rrezikut',
  dangerNote: "Veprimet e zonës së rrezikut s'kthehen.",

  whatsappBusiness: 'WhatsApp Business',
  connected: 'I lidhur',
  disconnected: 'I shkëputur',
  reconnect: 'Rilidh',
  reminderTemplate: 'Shablloni i kujtesave',
  approved: 'Miratuar',

  notifNewBookings: 'Rezervime të reja',
  notifCancellations: 'Anulime',
  notifReschedules: 'Ricaktime',
  notifEscalations: 'Eskalime',
  notifReminders: 'Kujtesa ditore',
  notifReminderFailure: 'Dështime të kujtesave',
  notifConnection: 'Shkëputje e WhatsApp',
  notifResumeOffer: 'Rikthim i asistentit',

  // Push notifications (per-browser) card
  pushCardTitle: 'Njoftimet në këtë pajisje',
  pushCardSub: 'Merr njoftime edhe kur aplikacioni është i mbyllur.',
  pushEnable: 'Aktivizo njoftimet',
  pushDisable: 'Çaktivizo njoftimet',
  pushEnabled: 'Njoftimet janë aktive në këtë pajisje.',
  pushBlocked:
    'Njoftimet janë të bllokuara. Lejoji te cilësimet e shfletuesit për këtë faqe.',
  pushUnsupported: 'Ky shfletues nuk mbështet njoftime push.',
  pushEnabledToast: 'Njoftimet u aktivizuan.',
  pushDisabledToast: 'Njoftimet u çaktivizuan.',
  pushBlockedToast: 'Njoftimet janë të bllokuara në shfletues.',
  pushErrorToast: 'Nuk u aktivizuan njoftimet. Provo sërish.',

  exportData: 'Eksporto të dhënat',
  exportSub: 'Takime, pacientë, biseda · JSON',
  retention: 'Ruajtja e të dhënave',
  retentionDays: (n: number) => `${n} ditë`,

  practiceName: 'Klinika ose praktika',
  fullName: 'Emri i plotë',
  timezone: 'Zona kohore',
  aiName: 'Emri i asistentit',
  aiGreeting: 'Përshëndetja',
  aiEscalationKeyword: 'Fjala kyçe e eskalimit',

  availability: 'Disponueshmëria',
  availabilitySub: 'Orët e punës, ditët e bllokuara dhe kohëzgjatja e takimit.',
  services: 'Shërbimet',
  servicesSub: 'Shërbimet që ofron dhe kohëzgjatja e tyre.',
  servicesTitle: 'Shërbimet',
  servicesIntro: 'Menaxho shërbimet që mund të rezervojnë klientët.',
  serviceName: 'Emri i shërbimit',
  serviceDuration: 'Kohëzgjatja',
  serviceAdd: 'Shto shërbim',
  serviceEdit: 'Ndrysho shërbimin',
  serviceSave: 'Ruaj',
  serviceActive: 'Aktiv',
  serviceInactive: 'Joaktiv',
  serviceEmpty: 'Ende asnjë shërbim',
  serviceEmptySub: 'Shto të paktën një shërbim për të pranuar rezervime.',
  serviceOnlineOnly: 'Shërbimet mund të ndryshohen vetëm kur je online.',
  serviceSaved: 'Shërbimi u ruajt.',

  disconnectWhatsapp: 'Shkëput WhatsApp',
  deleteAccount: 'Fshi llogarinë',
  disconnectTitle: 'Shkëput WhatsApp?',
  disconnectBody:
    'Pacientët nuk do të mund të shkruajnë derisa ta rilidhësh. Takimet dhe historiku ruhen.',
  disconnectConfirm: 'Shkëput',
  deleteTitle: 'Fshi llogarinë?',
  deleteBody:
    "Kjo fshin përgjithmonë praktikën, pacientët, takimet, bisedat dhe lidhjen me WhatsApp. S'kthehet.",
  deleteTypePrompt: 'Shkruaj DELETE për të konfirmuar',
  deleteConfirm: 'Fshi llogarinë',
  savedToast: 'Ndryshimet u ruajtën.',

  // Practice card
  practiceCard: 'Klinika',
  practiceCardSub: 'Emri dhe zona kohore e klinikës.',

  // AI assistant card
  aiCard: 'Asistenti AI',
  aiCardSub: 'Si prezantohet asistenti dhe kur të të lajmërojë.',
  aiNameLabel: 'Emri i asistentit',
  aiGreetingLabel: 'Mesazhi i mirëseardhjes',
  aiGreetingPlaceholder: 'Ej! Faleminderit që na shkruat…',
  aiEscalationLabel: 'Fjala kyçe e eskalimit',
  aiEscalationHint: 'Kur pacienti dërgon këtë fjalë, AI ia kalon bisedën ty.',

  // Notifications card
  notifCardSub: 'Cilat ngjarje dërgojnë njoftime push.',
  emailComingSoon: 'Njoftimet me email — së shpejti.',

  // Retention card
  retentionCardSub: 'Sa kohë mbahen mesazhet dhe historia e pacientëve.',

  // Save button / offline states
  saveSettings: 'Ruaj cilësimet',
  requiresConnection: 'Ndryshimet kërkojnë lidhje me internet.',
  settingsRequireConnection: 'Cilësimet kërkojnë lidhje.',

  // WhatsApp connection badge labels
  connectionBadgeActionNeeded: 'Kërkohet veprim',
  connectionBadgePending: 'Në pritje',
  connectionBadgeNotConnected: 'Nuk është lidhur',

  // WhatsApp card
  whatsappCardSub:
    'Lidh numrin tënd WhatsApp Business që pacientët të të shkruajnë klinikës.',
  whatsappRevoked:
    'Lidhja juaj WhatsApp u revokua. Rilidh për të rifilluar mesazhet.',
  whatsappConnectedId: 'ID e numrit të lidhur:',
  whatsappEnvNote:
    'Vendos NEXT_PUBLIC_META_APP_ID dhe NEXT_PUBLIC_META_CONFIG_ID për të aktivizuar regjistrimin.',

  // ConnectWhatsApp button + toasts
  whatsappConnecting: 'Po lidhet…',
  whatsappConnectBusiness: 'Lidh WhatsApp Business',
  whatsappReconnectBusiness: 'Rilidh WhatsApp Business',
  whatsappRequiresConnection: 'WhatsApp kërkon lidhje.',
  whatsappNotConfigured: 'WhatsApp nuk është konfiguruar.',
  whatsappRequiresHttps:
    'WhatsApp kërkon HTTPS — Facebook e bllokon në http://. Hap aplikacionin nëpërmjet HTTPS.',
  whatsappIncomplete: 'Lidhja mbeti e paplotë — mund ta vazhdosh kurdo.',
  whatsappSuccess: 'WhatsApp Business u lidh. Sinkronizimi po fillon.',
  whatsappFailed: 'Diçka shkoi keq me lidhjen e WhatsApp. Provo sërish.',

  // Danger zone toasts / inline
  accountAndWhatsappRequireConnection:
    'Veprimet e llogarisë dhe lidhjes WhatsApp kërkojnë lidhje.',
  disconnectRequiresConnection: 'Shkëputja e WhatsApp kërkon lidhje.',
  deleteRequiresConnection: 'Fshirja e llogarisë kërkon lidhje.',
  disconnectedToast: 'WhatsApp u shkëput.',
  disconnectFailed: 'Nuk u shkëput. Provo sërish.',
  deleteFailed: 'Nuk u fshi llogaria. Provo sërish.',
  disconnecting: 'Po shkëputet…',
  deleting: 'Po fshihet…',
} as const;

/** Availability editor (weekly hours + blocked periods). */
export const availability = {
  title: 'Disponueshmëria',
  daysAndHours: 'Ditët dhe orët',
  appointmentLength: 'Kohëzgjatja e takimeve',
  blockedPeriods: 'Periudha të bllokuara',
  addBlocked: 'Shto periudhë',
  copyToAll: 'Kopjo te të gjitha',
  from: 'Nga',
  to: 'Deri',
  closed: 'Mbyllur',
  label: 'Etiketa',
  minutes: (n: number) => `${n} min`,

  // Weekly hours card
  weeklyHours: 'Orët javore',
  weeklyHoursSub: 'Kur mund të rezervojnë pacientët. Takimet janë 60 minuta.',
  requiresConnection: 'Ndryshimet e disponueshmërisë kërkojnë lidhje.',
  copyToAllToast: 'Orët u kopjuan te të gjitha ditët e aktivizuara.',
  endAfterStart: 'Ora e mbarimit duhet të jetë pas orës së fillimit.',
  saveAvailability: 'Ruaj disponueshmërinë',
  savedToast: 'Disponueshmëria u ruajt.',

  // Blocked periods card
  blockedPeriodsSub: "Pushime ose kohë personale kur s'merr takime.",
  noBlocked: 'Asnjë periudhë e bllokuar',
  deleteBlockedAriaLabel: 'Fshi periudhën e bllokuar',
  addBlockDate: 'Data',
  addBlockLabelOptional: 'Etiketa (opsionale)',
  addBlockLabelPlaceholder: 'p.sh. Pushim',
  pickDate: 'Zgjidh një datë për të bllokuar.',
  blockedRequiresConnection: 'Periudhat e bllokuara kërkojnë lidhje.',
  addedToast: 'Periudha e bllokuar u shtua.',

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

  // Settings back-link label on availability page
  backToSettings: 'Cilësimet',
} as const;
