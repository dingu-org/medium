import { plural } from './common';

/** Calendar screen + appointment status / reminder badge labels. */
export const calendar = {
  title: 'Kalendari',
  views: { day: 'Ditë', week: 'Javë' },
  free: 'i lirë',
  today: 'sot',
  todayBtn: 'Sot',
  apptCount: (n: number) => plural(n, 'takim', 'takime'),
  restOfDayFree: 'Pjesa tjetër e ditës është e lirë.',
  mediumWillReply: "Medium do t'u përgjigjet kërkesave të reja.",
  emptyTitle: 'Asnjë takim sot',
  emptyText: 'Dita është e lirë. Shiko javën që vjen.',
  emptyDayTitle: 'Asnjë takim këtë ditë',
  emptyDayText:
    'E gjithë dita është e lirë. Shto një takim ose lëre Medium-in të rezervojë.',
  weekEmpty: 'Asnjë takim këtë javë.',
  weekEmptyDesc: 'Shpërndaj numrin tënd të WhatsApp për të marrë rezervime.',
  prevWeek: 'Java e kaluar',
  nextWeek: 'Java tjetër',
  currentWeek: 'java aktuale',
  todayLabel: '· Sot',
  newAppointment: 'Takim i ri',
  blockTime: 'Blloko kohë',
  allStatuses: 'Të gjitha statuset',

  // FAB menu
  addLabel: 'Shto',
  addApptTitle: 'Shto takim',
  addApptDesc: 'Rezervo manualisht për një pacient',
  blockTimeDesc: 'Pushime ose kohë personale',

  // Block time form
  blockDate: 'Data',
  blockLabelField: 'Etiketa (jo e detyrueshme)',
  blockOnlineRequired: 'Bllokimi i kohës kërkon lidhje interneti.',
  blockOnlineError: 'Nuk mund ta bllokosh kohën.',
  timeBlocked: 'Koha u bllokua.',
  saving: 'Po ruhet…',

  // Appointment form tabs
  existingPatient: 'Pacient ekzistues',
  newPatient: 'Pacient i ri',
  searchNamePhone: 'Kërko emër ose telefon…',
  offlineSearch: "Kërkimi i pacientit ekzistues kërkon lidhje. Shto një pacient të ri për ta radhitur takimin jashtë linje.",
  selectedLabel: 'Zgjedhur:',
  changeLink: 'ndrysho',
  searching: 'Po kërkon…',
  noMatches: 'Asnjë rezultat — provo "Pacient i ri".',
  serviceOptional: 'Shërbimi (jo i detyrueshëm)',
  servicePlaceholder: 'p.sh. Fizioterapi',
  booking: 'Po rezervon…',
  bookAppt: 'Rezervo takimin',
  pickPatient: 'Zgjidh një pacient.',
  enterPatientDetails: 'Vendos emrin dhe telefonin e pacientit.',
  apptQueued: "Takim u radhit. Do të sinkronizohet kur të jesh online.",
  apptQueuedRetry: 'Takim u radhit. Do të provohet automatikisht.',
  apptBooked: 'Takimi u rezervua.',
  apptQueueError: 'Nuk mund ta radhisësh takimin.',

  // Pending mutation labels (StatusPill in calendar rows)
  syncFailed: 'Sinkronizimi dështoi',
  cancelPending: 'Anulim në pritje',
  movePending: 'Lëvizje në pritje',
  notesPending: 'Shënime në pritje',
  statusPending: 'Statusi në pritje',
  syncPending: 'Sinkronizim në pritje',
} as const;

/** Appointment status pill labels (maps to the `appointmentStatus` enum). */
export const status = {
  pending: 'Në pritje',
  confirmed: 'Konfirmuar',
  cancelled: 'Anuluar',
  completed: 'Përfunduar',
  no_show: 'Nuk erdhi',
  rescheduled: 'Ricaktuar',
  noResponse: 'Pa përgjigje',
} as const;

/** Reminder badge labels. */
export const reminder = {
  pending: 'Kujtesa në pritje',
  sent: 'Kujtesa u dërgua',
  confirmed: 'Konfirmuar',
  cancelledByPatient: 'Anuluar nga pacienti',
  wantsReschedule: 'Kërkon ricaktim',
  skipped: 'Kujtesa u anashkalua',
  quotaReached: 'Kufiri i kujtesave u arrit',
  failed: 'Kujtesa dështoi',
} as const;
