/** Appointment detail sheet + manual booking form. */
export const appointment = {
  detailsTitle: 'Detajet e takimit',
  privateNote: 'Shënim privat',
  notePlaceholder: 'Shto një shënim privat…',
  saveNote: 'Ruaj shënimin',

  call: 'Telefono',
  whatsapp: 'WhatsApp',
  chat: 'Biseda',
  openChat: 'Hap bisedën',

  reschedule: 'Ricakto',
  cancel: 'Anulo takimin',
  markComplete: 'Shëno si të kryer',
  markNoShow: 'Nuk erdhi',
  ended: 'ka mbaruar',

  cancelReasonLabel: 'Arsyeja (jo e detyrueshme)',
  cancelReasonPlaceholder: 'Pse po anulohet?',
  cancelTitle: 'Anulo takimin?',
  cancelBody: "Pacienti do të njoftohet menjëherë. Ky veprim s'kthehet.",
  cancelConfirm: 'Anulo takimin',
  cancelBodyAlt: 'Anulo këtë takim? Pacienti do të njoftohet.',
  cancelBack: 'Mbrapa',
  bookedToast: 'Takimi u rezervua',
  markedComplete: 'U shënua si i kryer.',
  markedNoShow: 'U shënua si mungesë.',
  rescheduled: 'Takimi u ricaktua.',
  cancelled: 'Takimi u anulua.',

  // Reschedule mode
  pickNewTime: 'Zgjidh një kohë të re',
  back: 'Mbrapa',
  loadingSlots: 'Po ngarkon hapësirat…',
  noSlotsOnline: 'Asnjë hapësirë e lirë në 14 ditët e ardhshme. Kontrollo disponueshmërinë tënde.',
  noSlotsOffline: 'Rilidhu për të ngarkuar hapësirat e disponueshme.',
  slotsRequireConnection: 'Ngarkimi i hapësirave të disponueshme kërkon lidhje interneti.',

  // Queued / offline toasts
  changeQueued: 'Ndryshim u radhit. Do të sinkronizohet kur të jesh online.',
  changeQueuedRetry: 'Ndryshim u radhit. Do të provohet automatikisht.',
  changeQueueError: 'Nuk mund ta radhisësh ndryshimin.',
  notesQueued: 'Shënimet u radhitën. Do të sinkronizohen kur të jesh online.',
  notesQueuedRetry: 'Shënimet u radhitën. Do të provohen automatikisht.',
  notesQueueError: 'Nuk mund ta radhisësh shënimin.',
  notesSaved: 'Shënimet u ruajtën.',

  // Pending mutation labels (StatusPill in sheet)
  syncFailed: 'Sinkronizimi dështoi',
  cancelPending: 'Anulim në pritje',
  movePending: 'Lëvizje në pritje',
  notesPending: 'Shënime në pritje',
  statusPending: 'Statusi në pritje',
  syncPending: 'Sinkronizim në pritje',

  // manual booking
  newTitle: 'Takim i ri',
  patient: 'Pacienti',
  service: 'Shërbimi',
  date: 'Data',
  time: 'Ora',
  searchPatient: 'Kërko pacient…',
  addPatient: 'Shto pacient',
  patientName: 'Emri',
  patientPhone: 'Telefoni',
} as const;
